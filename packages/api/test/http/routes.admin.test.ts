import { describe, expect, it } from 'vitest';
import { buildTestServer, AUTH_HEADER } from './testServer.js';
import { setForcedUnhealthy } from '../../src/http/healthState.js';

describe('admin routes', () => {
  it('POST /api/admin/health/fail then /recover flips the /health status', async () => {
    const { app } = await buildTestServer();
    setForcedUnhealthy(false);
    await app.inject({ method: 'POST', url: '/api/admin/health/fail', headers: AUTH_HEADER });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(503);
    await app.inject({ method: 'POST', url: '/api/admin/health/recover', headers: AUTH_HEADER });
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });

  it('POST /api/admin/load/burn requires auth and returns quickly with a duration', async () => {
    const { app } = await buildTestServer();
    expect((await app.inject({ method: 'POST', url: '/api/admin/load/burn' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'POST', url: '/api/admin/load/burn', headers: AUTH_HEADER });
    expect(response.statusCode).toBe(200);
    expect(response.json().burnedMs).toBeGreaterThan(0);
  });

  it('POST /api/admin/load/burn honours an explicit durationMs', async () => {
    const { app } = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/load/burn',
      headers: AUTH_HEADER,
      payload: { durationMs: 150 },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().burnedMs).toBe(150);
  });

  it('POST /api/admin/load/burn rejects a durationMs beyond the health-check-safe ceiling', async () => {
    const { app } = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/load/burn',
      headers: AUTH_HEADER,
      payload: { durationMs: 60_000 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/admin/load/burn rejects a non-positive durationMs', async () => {
    const { app } = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/load/burn',
      headers: AUTH_HEADER,
      payload: { durationMs: 0 },
    });
    expect(response.statusCode).toBe(400);
  });
});
