import { describe, expect, it } from 'vitest';
import type { AuthProvider } from '../../src/ports/index.js';
import { ForbiddenError } from '../../src/domain/errors.js';
import { createAuthService } from '../../src/services/authService.js';

const PRINCIPAL = {
  userId: 'user-1',
  email: 'doctor.kl@aethelgard.demo',
  role: 'doctor' as const,
  branchId: 'branch-1',
};

const fakeAuthProvider = (overrides: Partial<AuthProvider> = {}): AuthProvider => ({
  login: async (email) =>
    email === PRINCIPAL.email ? { principal: PRINCIPAL, token: 'valid-token' } : null,
  verify: async (token) => (token === 'valid-token' ? PRINCIPAL : null),
  listDemoUsers: async () => [
    { email: PRINCIPAL.email, role: 'doctor', branchCode: 'KL', displayName: 'Dr Lim' },
  ],
  ...overrides,
});

describe('authService', () => {
  it('logs in a known user', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    const result = await service.login({ email: PRINCIPAL.email, password: 'demo1234' });
    expect(result.token).toBe('valid-token');
  });

  it('throws ForbiddenError for unknown credentials, without saying which field was wrong', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    await expect(
      service.login({ email: 'nobody@aethelgard.demo', password: 'wrong1234' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('resolves the principal for a valid token and rejects an invalid one', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    expect(await service.me('valid-token')).toEqual(PRINCIPAL);
    await expect(service.me('garbage')).rejects.toThrow(ForbiddenError);
  });

  it('lists demo users', async () => {
    const service = createAuthService({ authProvider: fakeAuthProvider() });
    expect(await service.demoUsers()).toHaveLength(1);
  });
});
