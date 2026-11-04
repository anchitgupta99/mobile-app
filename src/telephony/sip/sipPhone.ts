import { UA, WebSocketInterface } from 'jssip';
import type { RTCSession } from 'jssip/lib/RTCSession';
import { create } from 'zustand';
import { api, type WebphoneConfig } from '@/api/client';
import { iceServersFor } from './iceServers';
import { loadWebRTC } from './webrtc';

/**
 * The in-app webphone: a JsSIP user agent registered to the agent's extension on FreeSWITCH, set up
 * the same way as the web agent app's (SIPContext.tsx). The server puts every call through by calling
 * this extension (headers like X-Real-Phone say what it is); the phone answers the ones the call store
 * is waiting for and carries the audio. The agent's own controls (hang up, mute, keypad) act on that
 * one SIP call.
 */
export type SipStatus = 'idle' | 'unsupported' | 'connecting' | 'registered' | 'failed' | 'disconnected';

type SipPhoneState = {
  status: SipStatus;
  /** Why the phone isn't registered, for the Webphone check */
  detail: string | null;
  extension: string | null;
  start: () => Promise<void>;
  stop: () => void;
  /** Drops the user agent and registers again (Re-run checks, back from the background after a failure) */
  retry: () => Promise<void>;
};

/** What the server's INVITE says about the call it's putting through to this webphone (the web's headers) */
export type IncomingSipCall = {
  /** The customer's number (X-Real-Phone / X-Customer-Number); set on calls with a customer on the other end */
  customerNumber: string | null;
  /** X-Call-Type: MANUAL, PREVIEW, PROGRESSIVE, PREDICTIVE, Inbound, … */
  callType: string | null;
  autoAnswer: boolean;
  transfer: boolean;
  conference: boolean;
  /** A supervisor listening, whispering or barging in */
  intervention: boolean;
  /** Inbound campaign with accept/reject: answered at once, but the customer is only connected on Accept */
  acceptReject: boolean;
  /** The customer leg's UUID (X-Master-Call-Id / X-Call-Id): the call's id on the server */
  callUuid: string | null;
  /** X-Agent-Call-Id, sent with accept/reject */
  agentCallUuid: string | null;
  leadId: string | null;
  campaignId: string | null;
};

type CallHandlers = {
  /** Whether to answer: the call store only takes a call it is waiting for */
  accept: (call: IncomingSipCall) => boolean;
  /** The webphone's call ended, from either side */
  ended: () => void;
};

let handlers: CallHandlers = { accept: () => false, ended: () => undefined };

/** The call store registers how calls are taken and finished */
export function setSipCallHandlers(h: CallHandlers) {
  handlers = h;
}

let ua: UA | null = null;
// Bumped by every start and stop: a start still waiting on the config must not register after a logout
let generation = 0;
let session: RTCSession | null = null;
let micStream: MediaStream | null = null;
let iceServers: RTCIceServer[] = [];

// Shows up in the `npx expo start` terminal and React Native DevTools
const log = (...args: unknown[]) => {
  if (__DEV__) console.log('[SIP]', ...args);
};

/** The microphone, kept for the whole login so each call doesn't ask Android for it again */
async function getMic() {
  if (micStream) {
    micStream.getAudioTracks().forEach((t) => (t.enabled = true));
    return micStream;
  }
  const webrtc = loadWebRTC();
  if (!webrtc) throw new Error('WebRTC is not available');
  micStream = (await webrtc.mediaDevices.getUserMedia({ audio: true, video: false })) as unknown as MediaStream;
  return micStream;
}

// candidate:<foundation> <component> <transport> <priority> <address> <port> typ <type> …
const candidateType = (c: string) => c.split(' ')[7];
const isPublic = (c: string) => ['srflx', 'relay'].includes(candidateType(c));

/**
 * Makes sure every gathered ICE candidate is in the answer and points its c= line and m= port at the best
 * one (server-reflexive, then relay, then host; IPv4 first), as a browser's answer has. On Android,
 * react-native-webrtc can replace the description with an older copy when its setLocalDescription call
 * returns, losing candidates gathered meanwhile; FreeSWITCH rejects an answer it can't reach with 488
 * INCOMPATIBLE_DESTINATION.
 */
function withCandidates(sdp: string, candidates: string[]) {
  const lines = sdp.split(/\r?\n/).filter((l) => l !== '');
  // The same candidate can differ in trailing extensions (the event's copy adds "ufrag …"), so it's
  // matched on foundation, component, transport, address and port
  const key = (c: string) => c.replace(/^a=/, '').split(' ').slice(0, 6).filter((_, i) => i !== 3).join(' ');
  const inSdp = lines.filter((l) => l.startsWith('a=candidate:')).map((l) => l.slice(2));
  const present = new Set(inSdp.map(key));
  const all = candidates.map((c) => (c.startsWith('candidate:') ? c : `candidate:${c}`));
  const missing = all.filter((c) => !present.has(key(c))).map((c) => `a=${c}`);
  const parsed = [...inSdp, ...all].map((c) => c.split(' ')).map((f) => ({ ip: f[4], port: f[5], type: f[7] }));
  const rank = (p: { ip: string; type: string }) =>
    ['srflx', 'relay', 'host'].indexOf(p.type) + (p.ip.includes(':') ? 3 : 0);
  const best = parsed.filter((p) => p.ip && p.port).sort((a, b) => rank(a) - rank(b))[0];

  const audio = lines.findIndex((l) => l.startsWith('m=audio'));
  const next = lines.findIndex((l, i) => i > audio && l.startsWith('m='));
  const end = next === -1 ? lines.length : next;
  const out = lines.map((l, i) => {
    if (!best || i < audio || i >= end) return l;
    if (i === audio) return l.replace(/^m=audio \d+/, `m=audio ${best.port}`);
    if (l.startsWith('c=IN IP')) return `c=IN ${best.ip.includes(':') ? 'IP6' : 'IP4'} ${best.ip}`;
    return l;
  });
  out.splice(end, 0, ...missing);
  return `${out.join('\r\n')}\r\n`;
}

// What JsSIP reads and listens to on the peer connection while it waits for ICE
type GatheringPc = {
  iceGatheringState: string;
  addEventListener: (type: string, listener: (ev: unknown) => void, opts?: unknown) => void;
};

/** Longest the answer waits for a public (STUN or TURN) address before it goes out with what there is */
const PUBLIC_ADDRESS_WAIT_MS = 4000;

function watchSession(s: RTCSession) {
  const t0 = Date.now();
  const at = () => `+${Date.now() - t0}ms`;

  // The answer waits for a public address (STUN srflx or TURN relay), as Chrome's does: FreeSWITCH can't
  // reach the phone's local Wi-Fi or mobile-network address. On Android, react-native-webrtc reports
  // gathering in a way that makes JsSIP send the answer straight away with only those local addresses.
  let released = false;
  let jssipReady: (() => void) | null = null;
  let quietTimer: ReturnType<typeof setTimeout> | null = null;
  let capTimer: ReturnType<typeof setTimeout> | null = null;
  const gatheringListeners: (() => void)[] = [];
  const tryReady = () => {
    if (released && jssipReady) jssipReady();
  };
  const release = (why: string) => {
    if (released) return;
    released = true;
    if (capTimer) clearTimeout(capTimer);
    log(at(), 'sending the answer:', why);
    // JsSIP may be waiting on a gathering this hid as unfinished, or on the quiet rule below
    gatheringListeners.forEach((fn) => fn());
    setTimeout(tryReady, 300);
  };

  // Like the web: send the answer once candidates stop arriving for 1.2 s, but not before release()
  s.on('icecandidate', (ev) => {
    jssipReady = ev.ready;
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(tryReady, 1200);
  });

  const gathered: string[] = [];
  s.on('peerconnection', ({ peerconnection }) => {
    const pc = peerconnection as unknown as GatheringPc;
    // Until release(), report a finished gathering as still running so JsSIP doesn't send the answer yet
    let real = pc.iceGatheringState;
    Object.defineProperty(pc, 'iceGatheringState', {
      configurable: true,
      enumerable: true,
      get: () => (real === 'complete' && !released ? 'gathering' : real),
      set: (v: string) => {
        real = v;
        log(at(), 'ice gathering', v);
      },
    });
    const addListener = pc.addEventListener.bind(pc);
    pc.addEventListener = (type, listener, opts) => {
      if (type === 'icegatheringstatechange') gatheringListeners.push(() => listener({ type }));
      addListener(type, listener, opts);
    };
    // Every candidate the phone finds, so the answer can carry them all (see withCandidates)
    addListener('icecandidate', (ev) => {
      const c = (ev as RTCPeerConnectionIceEvent).candidate?.candidate;
      if (!c) return;
      gathered.push(c);
      log(at(), 'ice candidate', candidateType(c), c.split(' ')[4]);
      if (isPublic(c)) release(`${candidateType(c)} address found`);
    });
    capTimer = setTimeout(() => release(`no public address after ${PUBLIC_ADDRESS_WAIT_MS / 1000} s`), PUBLIC_ADDRESS_WAIT_MS);
  });

  s.on('confirmed', () => log(at(), 'call answered, audio up'));
  // FreeSWITCH's offer and the phone's answer, for when the two can't agree on the audio (e.g. a 488
  // INCOMPATIBLE_DESTINATION hang-up straight after answering). JsSIP sends the answer as this event leaves it.
  s.on('sdp', (e) => {
    if (e.originator === 'local' && gathered.length) e.sdp = withCandidates(e.sdp, gathered);
    log(at(), `${e.originator} ${e.type} SDP:\n${e.sdp}`);
  });
  const finish = (cause: string) => {
    if (quietTimer) clearTimeout(quietTimer);
    if (capTimer) clearTimeout(capTimer);
    if (session !== s) return;
    session = null;
    log('call ended', cause);
    // The call store reports the end to the server (call-ended) when the call goes on to wrap-up
    handlers.ended();
  };
  // The BYE's Reason header carries FreeSWITCH's own hang-up cause (Q.850, e.g. cause=88 INCOMPATIBLE_DESTINATION)
  const reasonOf = (e: { message?: unknown }) => {
    const m = e.message as { getHeader?: (h: string) => string } | undefined;
    return m?.getHeader?.('Reason') ?? '';
  };
  s.on('ended', (e) => finish(`${e.cause} ${reasonOf(e)}`));
  s.on('failed', (e) => finish(`${e.cause} ${reasonOf(e)}`));
}

async function answer(s: RTCSession) {
  try {
    const stream = await getMic();
    if (s.isEnded()) return;
    s.answer({ mediaStream: stream, pcConfig: { iceServers }, rtcAnswerConstraints: { offerToReceiveAudio: true } });
  } catch (err) {
    log('answer failed', err);
    if (!s.isEnded()) s.terminate();
  }
}

function createUA(cfg: WebphoneConfig, set: (p: Partial<SipPhoneState>) => void) {
  log(`connecting to ${cfg.wsServer} as ${cfg.extension}@${cfg.sipDomain}`);
  iceServers = iceServersFor(cfg.sipDomain);
  const socket = new WebSocketInterface(cfg.wsServer);
  socket.via_transport = 'WSS';

  const next = new UA({
    uri: `sip:${cfg.extension}@${cfg.sipDomain}`,
    sockets: [socket],
    authorization_user: cfg.extension,
    password: cfg.password,
    register: true,
    session_timers: false,
    register_expires: 3600,
    connection_recovery_min_interval: 2,
    connection_recovery_max_interval: 30,
    extra_headers: [`X-Tenant-ID: ${cfg.tenantId}`, `X-Agent-ID: ${cfg.agentId}`],
  });

  next.on('connected', () => log('websocket connected'));
  // JsSIP fires "registered" on every refresh too, and after it reconnects on its own
  next.on('registered', () => {
    log('registered');
    set({ status: 'registered', detail: null, extension: cfg.extension });
  });
  next.on('registrationFailed', (e) => {
    log('registration failed', e.cause, e.response?.status_code, e.response?.reason_phrase);
    set({ status: 'failed', detail: `Extension ${cfg.extension} couldn't register${e.cause ? ` (${e.cause})` : ''}` });
  });
  next.on('disconnected', (e) => {
    log('websocket disconnected', { error: e.error, code: e.code, reason: e.reason });
    set({
      status: 'disconnected',
      detail: `Can't reach the phone server${e.code ? ` (code ${e.code})` : ''}. Retrying…`,
    });
  });

  next.on('newRTCSession', (e) => {
    if (e.originator !== 'remote') return;
    const incoming = e.session;
    const header = (...names: string[]) => names.map((n) => e.request.getHeader(n)).find((v) => !!v) || null;
    const flag = (name: string) => e.request.getHeader(name) === 'true';
    const call: IncomingSipCall = {
      customerNumber: header('X-Real-Phone', 'X-Customer-Number'),
      callType: header('X-Call-Type'),
      autoAnswer: flag('X-Auto-Answer'),
      transfer: flag('X-Transfer'),
      conference: flag('X-Conference'),
      intervention: flag('X-Is-Whisper') || flag('X-Is-BargeIn') || flag('X-Is-Monitor'),
      acceptReject: flag('X-Accept-Reject'),
      callUuid: header('X-Master-Call-Id', 'X-Call-Id'),
      agentCallUuid: header('X-Agent-Call-Id'),
      leadId: header('X-Lead-ID', 'X-Lead ID'),
      campaignId: header('X-Campaign-ID'),
    };
    log('incoming call', call);
    // One call at a time, as on the web: a second one is left for the server to time out
    if (session && !session.isEnded()) return log('already on a call, ignoring it');
    // The web's filter: a call without a customer, a transfer, a conference, auto-answer or a supervisor
    // isn't one the server put through for the agent, so it's left unanswered
    if (!call.customerNumber && !call.transfer && !call.conference && !call.autoAnswer && !call.intervention) {
      return log('not a call for the agent, ignoring it');
    }
    if (!handlers.accept(call)) {
      log('not expecting this call, declining');
      incoming.terminate({ status_code: 486, reason_phrase: 'Busy Here' });
      return;
    }
    session = incoming;
    watchSession(incoming);
    void answer(incoming);
  });
  return next;
}

/** Hangs up the webphone's call, if there is one; its "ended" event finishes the call */
export function hangupSip() {
  if (session && !session.isEnded()) session.terminate();
}

/** Mutes the microphone on the live call, the web's way: the outgoing audio tracks go silent */
export function setSipMuted(on: boolean) {
  const pc = session?.connection as unknown as RTCPeerConnection | undefined;
  pc?.getSenders().forEach((sender) => {
    if (sender.track?.kind === 'audio') sender.track.enabled = !on;
  });
  micStream?.getAudioTracks().forEach((t) => (t.enabled = !on));
}

export function sendSipDtmf(digit: string) {
  try {
    session?.sendDTMF(digit);
  } catch (err) {
    log('dtmf failed', err);
  }
}

export const useSipPhone = create<SipPhoneState>((set, get) => ({
  status: 'idle',
  detail: null,
  extension: null,
  start: async () => {
    if (ua || get().status === 'connecting') return;
    if (!loadWebRTC()) {
      log('react-native-webrtc not available (Expo Go or web)');
      set({ status: 'unsupported', detail: "The webphone needs the Claritel app build; it can't run in Expo Go." });
      return;
    }
    const gen = ++generation;
    set({ status: 'connecting', detail: null });
    let cfg: WebphoneConfig;
    try {
      cfg = await api.webphone.config();
    } catch (e) {
      log('webphone config failed', e);
      if (gen === generation) set({ status: 'failed', detail: e instanceof Error ? e.message : 'Could not load the webphone settings' });
      return;
    }
    if (gen !== generation) return;
    ua = createUA(cfg, set);
    ua.start();
  },
  stop: () => {
    generation++;
    hangupSip();
    const current = ua;
    ua = null;
    if (current) {
      current.removeAllListeners();
      // Unregisters and closes the socket
      current.stop();
    }
    micStream?.getTracks().forEach((t) => t.stop());
    micStream = null;
    set({ status: 'idle', detail: null, extension: null });
  },
  retry: async () => {
    get().stop();
    await get().start();
  },
}));
