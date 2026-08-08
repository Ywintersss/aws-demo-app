export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let lastServedBy: string | null = null;
let lastAz: string | null = null;

export const getLastResponseMeta = (): { servedBy: string | null; az: string | null } => ({
  servedBy: lastServedBy,
  az: lastAz,
});

const TOKEN_KEY = 'aethelgard.token';

export const getStoredToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setStoredToken = (token: string | null): void => {
  if (token === null) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
};

export const apiFetch = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getStoredToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token !== null ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  lastServedBy = response.headers.get('x-served-by');
  lastAz = response.headers.get('x-az');

  if (response.status === 204) {
    return undefined as T;
  }

  const body = (await response.json().catch(() => null)) as
    | (T & { code?: string; message?: string })
    | null;

  if (!response.ok) {
    throw new ApiError(response.status, body?.code ?? 'UNKNOWN', body?.message ?? response.statusText);
  }
  return body as T;
};
