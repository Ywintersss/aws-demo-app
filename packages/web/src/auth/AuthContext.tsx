import { createContext, useContext, useState, type JSX, type ReactNode } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../api/client.js';

export type Principal = { userId: string; email: string; role: string; branchId: string };
type LoginResult = { principal: Principal; token: string };

type AuthContextValue = {
  principal: Principal | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }): JSX.Element => {
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [principal, setPrincipal] = useState<Principal | null>(null);

  const login = async (email: string, password: string): Promise<void> => {
    const result = await apiFetch<LoginResult>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(result.token);
    setToken(result.token);
    setPrincipal(result.principal);
  };

  const logout = (): void => {
    setStoredToken(null);
    setToken(null);
    setPrincipal(null);
  };

  return (
    <AuthContext.Provider value={{ principal, token, login, logout }}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
