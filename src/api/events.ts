import EventSource from 'react-native-sse';
import { API_URL, MOBILE_PREFIX } from './http';

/**
 * The agent's live event stream from the server (GET /v1/api/agent/mobile/events), the same stream the web
 * agent app reads (GET /v2/sse/event, hooks/useCallEvents.ts). It is the only place the server says why a
 * call failed (CALL_FAILURE). The library reconnects by itself 5 s after the connection drops.
 */
type EventHandlers = {
  /** A call failed: the web's friendly text for the server's hang-up cause */
  callFailure: (message: string) => void;
};

let stream: EventSource | null = null;

// Shows up in the `npx expo start` terminal and React Native DevTools
const log = (...args: unknown[]) => {
  if (__DEV__) console.log('[Events]', ...args);
};

/** The web's getFriendlyMessage (hooks/useCallEvents.ts), word for word */
export function callFailureText(cause: string): string {
  switch (cause) {
    case 'UNALLOCATED_NUMBER':
      return 'Number does not exist.';
    case 'USER_BUSY':
      return 'Customer is currently busy.';
    case 'NO_USER_RESPONSE':
    case 'NO_ANSWER':
      return 'Customer did not answer.';
    case 'ALLOT_SLOT_FAIL':
    case 'NORMAL_TEMPORARY_FAILURE':
      return 'Temporary network failure.';
    case 'CALL_REJECTED':
      return 'Call was declined.';
    case 'INVALID_GATEWAY':
      return 'Gateway connectivity issue.';
    case 'INCOMPATIBLE_DESTINATION':
      return 'Incompatible call destination.';
    default:
      return `Connection ended (${cause.replace(/_/g, ' ').toLowerCase()}).`;
  }
}

/** Causes the web doesn't report: the agent's own cancel, a normal hang-up, no answer, a picked-up leg */
const NOT_SHOWN = new Set(['ORIGINATOR_CANCEL', 'NORMAL_CLEARING', 'NO_ANSWER', 'PICKED_OFF']);

export function connectAgentEvents(token: string, handlers: EventHandlers) {
  disconnectAgentEvents();
  if (!API_URL) return;
  const s = new EventSource(`${API_URL}${MOBILE_PREFIX}/events`, { headers: { Authorization: `Bearer ${token}` } });
  stream = s;
  s.addEventListener('open', () => log('connected'));
  s.addEventListener('error', (e) => log('error', 'message' in e ? e.message : e.type));
  s.addEventListener('message', (e) => {
    let data: { type?: string; payload?: { hangup_cause?: unknown } } | null = null;
    try {
      data = e.data ? JSON.parse(e.data) : null;
    } catch {
      return;
    }
    if (data?.type !== 'CALL_FAILURE') return;
    const cause = data.payload?.hangup_cause;
    log('call failure', cause);
    if (typeof cause === 'string' && cause && !NOT_SHOWN.has(cause)) handlers.callFailure(callFailureText(cause));
  });
}

export function disconnectAgentEvents() {
  if (!stream) return;
  stream.removeAllEventListeners();
  stream.close();
  stream = null;
}
