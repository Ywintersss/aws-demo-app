import type { DemoUser, Principal } from '@aethelgard/shared';

export type LoginResult = { principal: Principal; token: string };

export type AuthProvider = {
  login(email: string, password: string): Promise<LoginResult | null>;
  verify(token: string): Promise<Principal | null>;
  listDemoUsers(): Promise<DemoUser[]>;
};
