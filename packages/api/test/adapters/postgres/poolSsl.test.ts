import { describe, expect, it } from 'vitest';
import { resolveSsl } from '../../../src/adapters/persistence/postgres/pool.js';

describe('resolveSsl', () => {
  it('disables TLS for a direct localhost connection', () => {
    expect(resolveSsl('postgresql://aethelgard:pw@localhost:5432/aethelgard')).toBeUndefined();
  });

  it('disables TLS for the Compose "postgres" service hostname', () => {
    expect(resolveSsl('postgresql://aethelgard:pw@postgres:5432/aethelgard')).toBeUndefined();
  });

  it('enables TLS with rejectUnauthorized: false for an RDS endpoint', () => {
    expect(
      resolveSsl('postgresql://aethelgard:pw@aethelgard-demo.abc123.us-east-1.rds.amazonaws.com:5432/aethelgard'),
    ).toEqual({ rejectUnauthorized: false });
  });

  it('enables TLS for any other non-local hostname', () => {
    expect(resolveSsl('postgresql://user:pw@10.0.1.42:5432/aethelgard')).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('fails toward requiring TLS on a malformed connection string', () => {
    expect(resolveSsl('not-a-valid-url')).toEqual({ rejectUnauthorized: false });
  });
});
