import type { DemoUser, LoginInput, Principal } from '@aethelgard/shared';
import { ForbiddenError } from '../domain/errors.js';
import type { AuthProvider, LoginResult } from '../ports/index.js';

export type AuthServiceDeps = { authProvider: AuthProvider };

export const createAuthService = (deps: AuthServiceDeps) => ({
  login: async (input: LoginInput): Promise<LoginResult> => {
    const result = await deps.authProvider.login(input.email.toLowerCase(), input.password);
    if (result === null) {
      throw new ForbiddenError('Invalid email or password');
    }
    return result;
  },

  me: async (token: string): Promise<Principal> => {
    const principal = await deps.authProvider.verify(token);
    if (principal === null) {
      throw new ForbiddenError('Invalid or expired token');
    }
    return principal;
  },

  demoUsers: async (): Promise<DemoUser[]> => deps.authProvider.listDemoUsers(),
});

export type AuthService = ReturnType<typeof createAuthService>;
