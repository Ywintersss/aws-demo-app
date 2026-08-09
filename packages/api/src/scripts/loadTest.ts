/**
 * Sustained load generator for the ECS target-tracking scale-out demo.
 *
 * Why this exists rather than clicking "Burn CPU" on the /infra page:
 *
 *  - `ECSServiceAverageCPUUtilization` is averaged across every task in the
 *    service. Each Fargate task is 0.25 vCPU and the API is single-threaded, so
 *    one burning task can only ever pin its own 0.25 vCPU. With 2 tasks running,
 *    a single in-flight burn tops out at ~50% service average — which is exactly
 *    at the scaling target, never above it. That is the ~60% ceiling you hit by
 *    hand. The fix is concurrency (load every task at once), not a longer burn.
 *  - Target tracking needs the metric sustained above target across roughly three
 *    consecutive 1-minute datapoints before it acts. Manual clicking cannot hold
 *    a duty cycle that high for that long.
 *
 * The burn is synchronous and blocks the event loop, so a task cannot answer
 * `GET /health` while burning. Defaults below are deliberately gentle: short
 * burns plus a pause, and low concurrency, so the queue of burns sitting ahead of
 * an arriving health check stays well inside the ALB's 5s health check timeout.
 * Raising CONCURRENCY aggressively will get tasks deregistered and replaced,
 * which corrupts the very evidence this script is meant to produce.
 */

const DEFAULTS = {
  minutes: 3,
  concurrency: 4,
  burnMs: 1500,
  pauseMs: 250,
  email: 'admin@aethelgard.demo',
  password: 'demo1234',
  progressIntervalMs: 15_000,
} as const;

type Options = {
  url: string;
  minutes: number;
  concurrency: number;
  burnMs: number;
  pauseMs: number;
  email: string;
  password: string;
};

type Stats = {
  ok: number;
  failed: number;
  servedBy: Map<string, number>;
  lastError: string | null;
};

const parseArgs = (argv: string[]): Options => {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined || !arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    // Support both `--flag value` and `--flag=value`.
    if (key.includes('=')) {
      const [name, ...rest] = key.split('=');
      flags.set(name!, rest.join('='));
    } else if (next !== undefined && !next.startsWith('--')) {
      flags.set(key, next);
      i += 1;
    }
  }

  const numberFlag = (name: string, fallback: number): number => {
    const raw = flags.get(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`--${name} must be a positive number, got "${raw}"`);
    }
    return value;
  };

  const url = flags.get('url') ?? process.env.ALB_DNS_NAME ?? process.env.API_URL;
  if (url === undefined || url.length === 0) {
    throw new Error(
      'Missing target. Pass --url http://<alb-dns-name> or set ALB_DNS_NAME in the environment.',
    );
  }

  return {
    // Accept a bare DNS name as well as a full URL, and drop any trailing slash
    // so path concatenation below never produces a double slash.
    url: (url.startsWith('http') ? url : `http://${url}`).replace(/\/+$/, ''),
    minutes: numberFlag('minutes', DEFAULTS.minutes),
    concurrency: Math.floor(numberFlag('concurrency', DEFAULTS.concurrency)),
    burnMs: Math.floor(numberFlag('burn-ms', DEFAULTS.burnMs)),
    pauseMs: Math.floor(numberFlag('pause-ms', DEFAULTS.pauseMs)),
    email: flags.get('email') ?? DEFAULTS.email,
    password: flags.get('password') ?? DEFAULTS.password,
  };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const login = async (options: Options): Promise<string> => {
  const response = await fetch(`${options.url}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: options.email, password: options.password }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Login failed for ${options.email}: HTTP ${response.status}. ${body}\n` +
        'The burn endpoint is admin-only — check the demo users have been seeded.',
    );
  }

  const body = (await response.json()) as { token?: string };
  if (typeof body.token !== 'string') {
    throw new Error('Login succeeded but returned no token.');
  }
  return body.token;
};

/** One worker: burn, pause, repeat, until the shared deadline passes. */
const runWorker = async (
  options: Options,
  token: string,
  deadline: number,
  stats: Stats,
): Promise<void> => {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${options.url}/api/admin/load/burn`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ durationMs: options.burnMs }),
      });

      if (response.ok) {
        stats.ok += 1;
        // X-Served-By is what turns this into scale-out evidence: new instance
        // IDs appearing part-way through the run are the tasks ECS just added.
        const servedBy = response.headers.get('x-served-by') ?? 'unknown';
        stats.servedBy.set(servedBy, (stats.servedBy.get(servedBy) ?? 0) + 1);
      } else {
        stats.failed += 1;
        stats.lastError = `HTTP ${response.status}`;
      }
    } catch (error) {
      // A task being replaced mid-run shows up here as a connection reset. Record
      // it and keep going rather than tearing the whole run down.
      stats.failed += 1;
      stats.lastError = error instanceof Error ? error.message : String(error);
    }

    // Yields the target's event loop so queued health checks get answered.
    await sleep(options.pauseMs);
  }
};

const formatDistribution = (servedBy: Map<string, number>): string => {
  const entries = [...servedBy.entries()].sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return 'none yet';
  return entries.map(([id, count]) => `${id}=${count}`).join('  ');
};

const reportProgress = (startedAt: number, deadline: number, stats: Stats): void => {
  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  console.log(
    `[${String(elapsed).padStart(3)}s elapsed, ${remaining}s left] ` +
      `ok=${stats.ok} failed=${stats.failed} | tasks: ${formatDistribution(stats.servedBy)}`,
  );
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  const stats: Stats = { ok: 0, failed: 0, servedBy: new Map(), lastError: null };

  console.log(`Target       : ${options.url}`);
  console.log(`Duration     : ${options.minutes} min`);
  console.log(`Concurrency  : ${options.concurrency} workers`);
  console.log(`Burn / pause : ${options.burnMs}ms / ${options.pauseMs}ms per worker cycle`);
  console.log('');

  const token = await login(options);
  console.log('Authenticated. Starting load — watch the ECS service task count.\n');

  const startedAt = Date.now();
  const deadline = startedAt + options.minutes * 60_000;
  const progress = setInterval(
    () => reportProgress(startedAt, deadline, stats),
    DEFAULTS.progressIntervalMs,
  );

  try {
    await Promise.all(
      Array.from({ length: options.concurrency }, () =>
        runWorker(options, token, deadline, stats),
      ),
    );
  } finally {
    clearInterval(progress);
  }

  console.log('\n--- Run complete ---');
  console.log(`Requests OK    : ${stats.ok}`);
  console.log(`Requests failed: ${stats.failed}${stats.lastError !== null ? ` (last: ${stats.lastError})` : ''}`);
  console.log(`Distinct tasks : ${stats.servedBy.size}`);
  console.log(`Distribution   : ${formatDistribution(stats.servedBy)}`);
  console.log(
    '\nScale-IN takes longer than scale-out (a ~15 min cooldown is typical).' +
      '\nLeave the CloudWatch task-count graph open to capture the descent.',
  );
};

main().catch((error: unknown) => {
  console.error('load test failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
