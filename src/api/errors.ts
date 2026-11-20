export class ApiError extends Error {
  /**
   * The main thing asked for went through, only a step after it failed (switched campaign, but couldn't go
   * online): a screen can show it as done, with this error's message as a warning
   */
  partial?: boolean;
  constructor(
    public code: 'offline' | 'unauthorized' | 'validation' | 'server',
    message: string,
    /** The backend's own error code when it sends one, e.g. TWO_STEP_NOT_SUPPORTED */
    public reason?: string,
    /**
     * What the backend answered, kept as it came: its `message` and `error` fields (each screen shows them in the
     * same order as the web's matching screen), the HTTP status and the whole body. Unset when the request never
     * got an answer (no network).
     */
    public server?: { status: number; message?: string; error?: string; body?: unknown },
  ) {
    super(message);
  }
}

/**
 * The text the web shows for a failed request: the backend's fields in that screen's order, else the web's own
 * fallback (also when there was no answer at all), e.g. a manual call: `webText(e, ['message', 'error'], 'Unable to start call')`.
 */
export function webText(e: unknown, order: ('message' | 'error')[], fallback: string): string {
  const server = e instanceof ApiError ? e.server : undefined;
  for (const field of order) {
    const v = server?.[field];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return fallback;
}
