import { demoRequest } from './demo';
import { ApiError } from './errors';

/**
 * Backend base URL from EXPO_PUBLIC_API_URL: a PC's backend in development (http://192.168.1.38:4000) or the
 * deployed one (https://dialer.claritel.ai/backend, set per build profile in eas.json). The app needs it: without
 * it every request fails with "The server address is not set".
 */
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '') || null;
/**
 * Demo mode: no server address set, so requests are answered on the phone with sample data (api/demo.ts) and
 * any login works. Set EXPO_PUBLIC_API_URL to talk to a real backend again. Fails closed: only in a development
 * build or with EXPO_PUBLIC_DEMO=1, so a release built without the URL shows "The server address is not set"
 * instead of quietly accepting any login and showing sample data.
 */
export const DEMO = !API_URL && (__DEV__ || process.env.EXPO_PUBLIC_DEMO === '1');
/**
 * The live socket's server. The socket lives at the domain root (/ws) while a deployed API sits under a path
 * (https://domain/backend), so by default it is the API URL's scheme + host + port, like the web's fallback to
 * window.location.origin: http://192.168.1.34:4000 stays as is, https://domain/backend becomes https://domain.
 * EXPO_PUBLIC_SOCKET_URL overrides it only if the socket is ever on a different domain.
 */
export const SOCKET_URL =
  process.env.EXPO_PUBLIC_SOCKET_URL?.trim().replace(/\/+$/, '') || (API_URL && (/^[a-z][a-z0-9+.-]*:\/\/[^/?#]+/i.exec(API_URL)?.[0] ?? API_URL));

/** Every agent mobile app route on the backend lives under this prefix */
export const MOBILE_PREFIX = '/v1/api/agent/mobile';

const TIMEOUT_MS = 15000;

/**
 * Every change (POST / PUT / PATCH / DELETE: a call action, a disposition, a callback, a status change, …) gets
 * longer than a list, as the server may take a while to do it, but not forever: on a half-open connection the
 * request would otherwise never end and its spinner (Log In, Save) would turn until the app is killed. A cut-off
 * one fails with reason TIMED_OUT, so a screen can say it timed out (the server may still have done it) rather
 * than that it couldn't be reached. Lists and status checks (GET) keep the shorter limit.
 */
const CHANGE_TIMEOUT_MS = 20000;

let authToken: string | null = null;

/** The session store keeps this in step with the signed-in agent's token */
export function setAuthToken(token: string | null) {
  authToken = token;
}

let onSessionExpired: (() => void) | null = null;
/** The session store's logout for a 401: as on the web, an expired or invalid login signs the agent out */
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

function errorFor(status: number, message: string, reason: string | undefined, server: ApiError['server']) {
  if (status === 401) return new ApiError('unauthorized', message, reason, server);
  if (status >= 500) return new ApiError('server', message, reason, server);
  return new ApiError('validation', message, reason, server);
}

/** The reason on an ApiError for a request cut off by its time limit (not one that never reached the server) */
export const TIMED_OUT = 'TIMED_OUT';

/**
 * Calls a mobile route, e.g. `mobileRequest('POST', '/auth/login', body)`. Backend errors become an ApiError with its
 * message; no answer at all is code 'offline' (reason TIMED_OUT if it was our time limit that cut it off).
 * `timeoutMs` replaces the default time limit (15 s for a GET, 20 s for a change).
 */
export async function mobileRequest<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  opts?: { timeoutMs?: number },
): Promise<T> {
  // Read the token before any await so a logout that clears it right after still sends it
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const sentToken = authToken;
  if (DEMO) {
    try {
      return (await demoRequest(method, path, body)) as T;
    } catch (e) {
      throw new ApiError('server', e instanceof Error ? e.message : 'Demo request failed');
    }
  }
  if (!API_URL) throw new ApiError('server', 'The server address is not set (EXPO_PUBLIC_API_URL)');

  const controller = new AbortController();
  const limit = opts?.timeoutMs ?? (method === 'GET' ? TIMEOUT_MS : CHANGE_TIMEOUT_MS);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, limit);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${MOBILE_PREFIX}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // No answer at all: no network, the server unreachable, or our time limit. Code 'offline' so callers can tell
    // it from a server error; the timeout keeps its own reason (and words), as the server may have got it.
    if (timedOut) throw new ApiError('offline', 'The request timed out. Please try again.', TIMED_OUT);
    throw new ApiError('offline', "Can't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const data = await res.json().catch(() => null);
  // The web's 401 handling (api/axios.ts): the login has expired or was revoked, so sign out. Only for the login
  // still in use (not a late answer to an older one), and not for the sign-in / sign-out requests themselves.
  if (res.status === 401 && sentToken && sentToken === authToken && !path.startsWith('/auth/')) onSessionExpired?.();
  if (!res.ok || data?.success === false) {
    // Some backend controllers answer { error }, others (the call ones) { message }
    const message =
      typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : 'Something went wrong. Please try again.';
    throw errorFor(res.status, message, typeof data?.code === 'string' ? data.code : undefined, {
      status: res.status,
      message: typeof data?.message === 'string' ? data.message : undefined,
      error: typeof data?.error === 'string' ? data.error : undefined,
      body: data,
    });
  }
  return data as T;
}
