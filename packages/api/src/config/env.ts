import { z } from 'zod';

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  APP_VERSION: z.string().min(1).default('0.0.0'),
  SERVE_STATIC: z.coerce.boolean().default(false),

  DATABASE_URL: z.string().min(1).optional(),
  DB_HOST: z.string().min(1).optional(),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1).optional(),
  DB_USER: z.string().min(1).optional(),
  DB_PASSWORD: z.string().min(1).optional(),

  AUTH_DRIVER: z.enum(['localJwt']).default('localJwt'),
  JWT_SECRET: z.string().min(8),

  IDENTITY_DRIVER: z.enum(['local', 'ecs']).default('local'),
});

export type AppConfig = {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  logLevel: string;
  appVersion: string;
  serveStatic: boolean;
  databaseUrl: string;
  authDriver: 'localJwt';
  jwtSecret: string;
  identityDriver: 'local' | 'ecs';
};

/**
 * The single place a database's connection details are resolved into one
 * connection string. Everything downstream (pool.ts, migrator.ts, every
 * repository) sees only the returned string — never a host, never a flag
 * saying "this is Aurora". That is what makes swapping RDS single-AZ, RDS
 * Multi-AZ, or Aurora PostgreSQL a deploy-time config change instead of an
 * application code change.
 */
const resolveDatabaseUrl = (env: z.infer<typeof rawEnvSchema>): string => {
  if (env.DATABASE_URL !== undefined) {
    return env.DATABASE_URL;
  }
  if (
    env.DB_HOST !== undefined &&
    env.DB_NAME !== undefined &&
    env.DB_USER !== undefined &&
    env.DB_PASSWORD !== undefined
  ) {
    const user = encodeURIComponent(env.DB_USER);
    const password = encodeURIComponent(env.DB_PASSWORD);
    return `postgresql://${user}:${password}@${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}`;
  }
  throw new Error(
    'Set DATABASE_URL, or all of DB_HOST/DB_NAME/DB_USER/DB_PASSWORD (DB_PORT optional, defaults to 5432).',
  );
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const parsed = rawEnvSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    appVersion: parsed.APP_VERSION,
    serveStatic: parsed.SERVE_STATIC,
    databaseUrl: resolveDatabaseUrl(parsed),
    authDriver: parsed.AUTH_DRIVER,
    jwtSecret: parsed.JWT_SECRET,
    identityDriver: parsed.IDENTITY_DRIVER,
  };
};
