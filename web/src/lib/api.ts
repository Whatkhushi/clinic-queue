import type { User } from './types';

/**
 * Small fetch wrapper.
 * - The access token lives only in memory (not localStorage) so XSS can't read it from storage.
 * - On a 401 it calls /auth/refresh once (the httpOnly cookie is sent automatically)
 *   and retries the original request.
 */
let accessToken: string | null = null;
let refreshing: Promise<User | null> | null = null;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

async function raw(path: string, method: string, body?: unknown) {
  return fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? `Request failed (${res.status})`, e.details);
  }
  return data as T;
}

/** Exchange the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<User | null> {
  refreshing ??= (async () => {
    try {
      const res = await raw('/auth/refresh', 'POST');
      if (!res.ok) {
        accessToken = null;
        return null;
      }
      const data = (await res.json()) as { accessToken: string; user: User };
      accessToken = data.accessToken;
      return data.user;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = options.method ?? 'GET';
  let res = await raw(path, method, options.body);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await raw(path, method, options.body);
  }
  return parse<T>(res);
}
