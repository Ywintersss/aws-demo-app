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
});
