import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';

const BASE_ENV = {
  JWT_SECRET: 'dev-only-secret-change-me',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
};

describe('loadConfig', () => {
  it('applies documented defaults', () => {
    const config = loadConfig(BASE_ENV);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.authDriver).toBe('localJwt');
    expect(config.identityDriver).toBe('local');
    expect(config.serveStatic).toBe(false);
  });

  it('uses DATABASE_URL verbatim when provided', () => {
    const config = loadConfig(BASE_ENV);
    expect(config.databaseUrl).toBe('postgresql://u:p@localhost:5432/db');
  });

  it('assembles the same shape of connection string from split DB_* vars, regardless of host format', () => {
    const rdsShape = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'aethelgard.abc123xyz.us-east-1.rds.amazonaws.com',
      DB_NAME: 'aethelgard',
      DB_USER: 'aethelgard_app',
      DB_PASSWORD: 'swap-me',
    });
    const auroraShape = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'aethelgard.cluster-abc123xyz.us-east-1.rds.amazonaws.com',
      DB_NAME: 'aethelgard',
      DB_USER: 'aethelgard_app',
      DB_PASSWORD: 'swap-me',
    });
    expect(rdsShape.databaseUrl).toBe(
      'postgresql://aethelgard_app:swap-me@aethelgard.abc123xyz.us-east-1.rds.amazonaws.com:5432/aethelgard',
    );
    expect(auroraShape.databaseUrl).toBe(
      'postgresql://aethelgard_app:swap-me@aethelgard.cluster-abc123xyz.us-east-1.rds.amazonaws.com:5432/aethelgard',
    );
    // Same construction logic produced both — the only difference is the hostname
    // Terraform handed it. No branch in this code ever asks "is this Aurora?".
  });

  it('URI-encodes special characters in a split-var password', () => {
    const config = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'localhost',
      DB_NAME: 'db',
      DB_USER: 'u',
      DB_PASSWORD: 'p@ss/word?',
    });
    expect(config.databaseUrl).toBe('postgresql://u:p%40ss%2Fword%3F@localhost:5432/db');
  });

  it('respects a custom DB_PORT', () => {
    const config = loadConfig({
      JWT_SECRET: 'dev-only-secret-change-me',
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_NAME: 'db',
      DB_USER: 'u',
      DB_PASSWORD: 'p',
    });
    expect(config.databaseUrl).toContain(':5433/db');
  });

  it('throws a descriptive error when neither DATABASE_URL nor the full split set is given', () => {
    expect(() => loadConfig({ JWT_SECRET: 'dev-only-secret-change-me' })).toThrow(
      /DATABASE_URL.*DB_HOST/s,
    );
  });

  it('throws when JWT_SECRET is missing or too short', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://u:p@h:5432/d' })).toThrow();
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgresql://u:p@h:5432/d', JWT_SECRET: 'short' }),
    ).toThrow();
  });
});
