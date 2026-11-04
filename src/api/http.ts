import { ApiError } from './errors';

/** Backend base URL from EXPO_PUBLIC_API_URL (e.g. http://192.168.1.38:4000); unset keeps the in-app mock API */
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || null;
export const USE_BACKEND = API_URL !== null;

/** Every agent mobile app route on the backend lives under this prefix */
const MOBILE_PREFIX = '/v1/api/agent/mobile';

const TIMEOUT_MS = 15000;

let authToken: string | null = null;

/** The session store keeps this in step with the signed-in agent's token */
export function setAuthToken(token: string | null) {
  authToken = token;
}

function errorFor(status: number, message: string, reason?: string) {
  if (status === 401) return new ApiError('unauthorized', message, reason);
  if (status >= 500) return new ApiError('server', message, reason);
  return new ApiError('validation', message, reason);
}

/** Calls a mobile route, e.g. `mobileRequest('POST', '/auth/login', body)`. Backend errors become an ApiError with its message. */
export async function mobileRequest<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new ApiError('server', 'The server address is not set (EXPO_PUBLIC_API_URL)');
  // Read the token before any await so a logout that clears it right after still sends it
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${MOBILE_PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('server', "Can't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  if (!res.ok || data?.success === false) {
    // Some backend controllers answer { error }, others (the call ones) { message }
    const message =
      typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : 'Something went wrong. Please try again.';
    throw errorFor(res.status, message, typeof data?.code === 'string' ? data.code : undefined);
  }
  return data as T;
}
