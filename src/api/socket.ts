import { io, type Socket } from 'socket.io-client';
import { SOCKET_URL } from './http';

/**
 * The agent's live connection to the backend, the same socket.io connection the web agent app opens
 * (socket/appSocket.ts there): path /ws, the login token, a heartbeat every 10 s. While it's connected
 * the server keeps the session alive (active_sessions.last_heartbeat; the clean-up job logs out agents
 * silent for 3 minutes, and a socket gone for 30 s puts the agent on PAUSED) and can end the session
 * from its side.
 */
/** session_update: the agent's status on the server (READY, PAUSED, BREAK, INCALL, DISPO, …) and any running break */
export type SessionUpdate = { status?: string; activeBreak?: { break_type_id?: string | null } | null };

type SocketHandlers = {
  /** The server ended this session: logged in elsewhere, logged out by an admin, or the session expired */
  forcedLogout: (message: string) => void;
  sessionUpdate: (data: SessionUpdate) => void;
  /** The server refused the login token (expired or revoked) */
  sessionExpired: () => void;
  /** An accept/reject inbound call is ringing this agent (the web's inbound:incoming): its ring time */
  inboundIncoming: (data: InboundRing) => void;
  /** That ring is over (the web's inbound:ended): timeout, customer_gone, preempted, connected, … */
  inboundEnded: (data: InboundEnded) => void;
  /**
   * A "For Me" callback is due and the agent is READY (the web's callback_notification). The server has marked
   * it NOTIFIED and won't dial it: from here on only the app places the call, as the web's browser does.
   */
  callbackDue: (data: CallbackDue) => void;
};

/** The scheduled_callbacks row the server sends with callback_notification; phone_number is the real number to dial */
export type CallbackDue = { message?: string; callback?: { id?: string; phone_number?: string | null; name?: string | null } };

export type InboundRing = { agentCallUuid?: string; ringTimeoutSec?: number };
export type InboundEnded = { agentCallUuid?: string; reason?: string };

let socket: Socket | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

// Shows up in the `npx expo start` terminal and React Native DevTools
const log = (...args: unknown[]) => {
  if (__DEV__) console.log('[Socket]', ...args);
};

function stopHeartbeat() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
}

function sendHeartbeat() {
  if (socket?.connected) socket.emit('heartbeat', { timestamp: new Date().toISOString() });
}

export function connectAgentSocket(token: string, handlers: SocketHandlers) {
  disconnectAgentSocket();
  if (!SOCKET_URL) return;
  // Unlike the web's 3 tries, keeps reconnecting: a phone drops and regains signal all day
  const s = io(SOCKET_URL, {
    path: '/ws',
    auth: { token },
    transports: ['websocket'],
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
  });
  socket = s;

  s.on('connect', () => {
    log('connected', s.id);
    stopHeartbeat();
    heartbeat = setInterval(sendHeartbeat, 10000);
  });
  s.on('connect_error', (e) => {
    log('connect error', e.message);
    // The server refused the login itself (expired or revoked): sign out, as a 401 does
    if (e.message === 'INVALID_AUTH_TOKEN') {
      disconnectAgentSocket();
      handlers.sessionExpired();
    }
  });
  s.on('disconnect', (reason) => {
    log('disconnected', reason);
    stopHeartbeat();
    // socket.io doesn't reconnect by itself after the server drops the connection, and without a heartbeat the
    // server pauses the agent after 30 s and logs them out after 3 min. Our own disconnectAgentSocket removes this
    // listener first (and reads as 'io client disconnect'), and a forced logout comes as agent_disconnected.
    if (reason === 'io server disconnect' && socket === s) s.connect();
  });
  s.on('socket_ready', (data) => log('ready', data));
  s.on('agent_disconnected', (data: { message?: string; reason?: string }) => {
    log('session ended by the server', data);
    disconnectAgentSocket();
    handlers.forcedLogout(data?.message || 'Your session was ended. Please log in again.');
  });

  s.on('session_update', (data: SessionUpdate) => {
    log('session update', data?.status, data?.activeBreak?.break_type_id ?? '');
    handlers.sessionUpdate(data ?? {});
  });
  // Accept/reject inbound calls, as the web (socket/appSocket.ts): the ring time, and why a ring ended
  s.on('inbound:incoming', (data: InboundRing) => {
    log('inbound:incoming', data);
    handlers.inboundIncoming(data ?? {});
  });
  s.on('inbound:ended', (data: InboundEnded) => {
    log('inbound:ended', data);
    handlers.inboundEnded(data ?? {});
  });
  // A due "For Me" callback, as the web (socket/appSocket.ts → hooks/useCallbackAutoDial.ts): the app dials it
  s.on('callback_notification', (data: CallbackDue) => {
    log('callback_notification', data?.callback?.id);
    handlers.callbackDue(data ?? {});
  });
  // Calls reach the app as SIP calls to its webphone (see telephony/sip); these are logged for debugging
  for (const event of ['call-event', 'call_status_update', 'call:answered']) {
    s.on(event, (data) => log(event, data));
  }
}

/** Back in the foreground: reconnect if the socket dropped meanwhile, or say "still here" straight away */
export function wakeAgentSocket() {
  if (socket && !socket.connected) socket.connect();
  else sendHeartbeat();
}

export function disconnectAgentSocket() {
  stopHeartbeat();
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}
