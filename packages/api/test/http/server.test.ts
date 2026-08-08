import { describe, expect, it, vi } from 'vitest';
import { buildServer, type ServerDeps } from '../../src/http/server.js';
import { setForcedUnhealthy } from '../../src/http/healthState.js';
import type { Db } from '../../src/adapters/persistence/postgres/pool.js';
import type { AuthProvider } from '../../src/ports/index.js';

const PRINCIPAL = { userId: 'user-1', email: 'doc@aethelgard.demo', role: 'doctor' as const, branchId: 'branch-1' };

const buildDeps = (overrides: Partial<ServerDeps> = {}): ServerDeps => ({
  db: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })), close: vi.fn(), pool: {} } as unknown as Db,
  authProvider: {
    login: vi.fn(),
    verify: vi.fn(async (token: string) => (token === 'valid-token' ? PRINCIPAL : null)),
    listDemoUsers: vi.fn(),
  } as unknown as AuthProvider,
  instanceId: 'test-instance-1',
  availabilityZone: 'test-az-1',
  appVersion: '0.1.0-test',
  authDriverName: 'localJwt',
  identityDriverName: 'local',
  serveStatic: false,
  ...overrides,
});

describe('GET /health', () => {
  it('returns 200 when the database is reachable', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
  });

  it('returns 503 when the database query throws', async () => {
    const app = buildServer(
      buildDeps({ db: { query: vi.fn(async () => { throw new Error('down'); }), close: vi.fn(), pool: {} } as unknown as Db }),
    );
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(503);
  });

  it('returns 503 when forced unhealthy, and recovers when un-forced', async () => {
    const app = buildServer(buildDeps());
    setForcedUnhealthy(true);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(503);
    setForcedUnhealthy(false);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });
});

describe('every response', () => {
  it('carries X-Served-By and X-AZ headers from the resolved instance identity', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-served-by']).toBe('test-instance-1');
    expect(response.headers['x-az']).toBe('test-az-1');
  });
});

describe('GET /api/meta', () => {
  it('requires authentication', async () => {
    const app = buildServer(buildDeps());
    expect((await app.inject({ method: 'GET', url: '/api/meta' })).statusCode).toBe(401);
  });

  it('reports instance identity, version and active adapters when authenticated', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({
      method: 'GET',
      url: '/api/meta',
      headers: { authorization: 'Bearer valid-token' },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      instanceId: 'test-instance-1',
      availabilityZone: 'test-az-1',
      version: '0.1.0-test',
      adapters: { db: 'postgres', auth: 'localJwt', identity: 'local' },
    });
    expect(typeof body.uptimeSeconds).toBe('number');
  });
});

describe('error translation', () => {
  it('returns 404 with a machine-readable code for an unknown route', async () => {
    const app = buildServer(buildDeps());
    const response = await app.inject({ method: 'GET', url: '/does-not-exist' });
    expect(response.statusCode).toBe(404);
  });
});
