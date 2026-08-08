import { describe, expect, it } from 'vitest';
import { buildTestServer, TEST_PRINCIPAL, AUTH_HEADER } from './testServer.js';

describe('POST /api/auth/login', () => {
  it('returns a token and principal for a known demo user', async () => {
    const { app } = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: TEST_PRINCIPAL.email, password: 'demo1234' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ token: 'valid-token', principal: { email: TEST_PRINCIPAL.email } });
  });

  it('returns 403 for unknown credentials', async () => {
    const { app } = await buildTestServer();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@aethelgard.demo', password: 'wrongwrong' },
    });
    expect(response.statusCode).toBe(403);
  });

  it('returns 400 for a malformed body', async () => {
    const { app } = await buildTestServer();
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'not-an-email' } });
    expect(response.statusCode).toBe(400);
  });
});

describe('GET /api/auth/demo-users', () => {
  it('lists demo users with no secret', async () => {
    const { app } = await buildTestServer();
    const response = await app.inject({ method: 'GET', url: '/api/auth/demo-users' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      { email: TEST_PRINCIPAL.email, role: 'doctor', branchCode: 'KL', displayName: 'Dr Lim' },
    ]);
  });
});

describe('GET /api/auth/me', () => {
  it('requires authentication and returns the principal when authenticated', async () => {
    const { app } = await buildTestServer();
    expect((await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode).toBe(401);
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers: AUTH_HEADER });
    expect(response.json()).toEqual(TEST_PRINCIPAL);
  });
});
