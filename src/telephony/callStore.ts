import { create } from 'zustand';
import { api } from '@/api/client';
import { ApiError, webText } from '@/api/errors';
import { USE_BACKEND } from '@/api/http';
import { notify } from '@/components/feedback';
import { realtime } from '@/api/realtime';
import { sampleNetwork } from '@/api/network';
import type { CallDirection, CallMode, CallRecord, CallState, NetworkSample, ScreenPop, Task } from '@/domain/types';
import { uid } from '@/domain/format';
import { contactById, findContactByNumber, useData } from '@/store/data';
import { useSession } from '@/store/session';
import { useSettings, type AudioRoute } from '@/store/settings';
import { findCampaign } from '@/store/campaigns';
import type { CallAdapter } from './adapter';
import { bridgeAdapter } from './bridge';
import { checkBeforeDial } from './compliance';
import { runNetworkCheck, type NetworkVerdict } from './networkCheck';
import { voipAdapter } from './voip';
import { nativeCall } from './nativeCall';
import { setCallAudioRoute, startCallAudio, stopCallAudio } from './sip/audioRoute';
import { setSipCallHandlers, type IncomingSipCall } from './sip/sipPhone';
import type { InboundEnded, InboundRing } from '@/api/socket';
import { MASK_CHAR, maskPhoneForDisplay, maskPhoneFully, type PhoneMaskRule } from '@/domain/phoneMask';

export type DialSource = 'keypad' | 'contact' | 'history' | 'task';

export type ActiveCall = {
  id: string;
  direction: CallDirection;
  mode: CallMode;
  state: CallState;
  number: string;
  contactId: string | null;
  pop: ScreenPop;
  source: DialSource | 'inbound';
  taskId: string | null;
  createdAt: number;
  connectedAt: number | null;
  endedAt: number | null;
  muted: boolean;
  held: boolean;
  /** Backend: a hold / resume is on its way to the server; the button waits for it, as on the web */
  holdPending?: boolean;
  /** Backend: the server's INVITE for this dialed call reached the webphone, which answered it */
  onWebphone?: boolean;
  /** Backend: the manual-call request is still with the server, so End waits (as the web's dial button does) */
  dialPending?: boolean;
  /** Backend: the last hold / resume failed; the Hold button reads "Failed" as on the web */
  holdFailed?: boolean;
  /** Backend: Accept on an accept/reject inbound call is with the server; it keeps ringing until it's accepted */
  accepting?: boolean;
  route: AudioRoute;
  dtmf: string;
  quality: NetworkSample | null;
  verdict: NetworkVerdict | null;
  fallback: boolean;
  modeOverridden: boolean;
  error: string | null;
  /** Telephony call UUID, shown on the call screen and kept on the call record */
  uuid: string;
  campaignName: string;
  listName: string;
  dialMode: DialMode;
  /** Backend: the call's own campaign (an inbound or auto-dial-group call can differ from the agent's) */
  campaignId?: string;
  /** Backend: the lead the server dialed or matched, sent with the disposition */
  leadId?: string | null;
  /** Backend: inbound accept/reject needs the agent leg's UUID too */
  agentCallUuid?: string | null;
  /** Backend: the customer as the server shows them (call context): the lead's name and the number, masked per campaign */
  customerName?: string;
  displayNumber?: string;
  /** Backend: the lead's list and the campaign's prefix (call context), sent with the disposition */
  listId?: string | null;
  campaignPrefix?: string | null;
  /** Backend: the campaign the context was asked for, so it's asked again only when that changes */
  contextCampaign?: string;
};

export type DialMode = 'Manual' | 'Auto' | 'Inbound';

export type Leg = {
  id: string;
  name: string;
  /** "Customer", a team name, or "External" */
  role: string;
  kind: 'customer' | 'agent' | 'external';
  muted: boolean;
  /** Backend: what the server dials for this target, an agent's extension or an external number */
  dial?: string;
};

export type ConsultState = 'calling' | 'answered' | 'busy' | 'no-answer' | 'declined' | 'merging';

export type Consult = {
  kind: 'transfer' | 'conference';
  target: Leg;
  state: ConsultState;
  startedAt: number;
  answeredAt: number | null;
  /** The agent had the customer on hold before consulting; don't resume them when the consult ends */
  heldBefore: boolean;
  /** Backend: why the server couldn't reach the target */
  error?: string | null;
};

export type Conference = { startedAt: number; legs: Leg[] };

/** `toast`: shown as a toast like the web's "Call Failed" rather than a dialog */
export type DialResult = { ok: true } | { ok: false; title: string; message: string; toast?: boolean };

type CallStore = {
  call: ActiveCall | null;
  wrapUpCallId: string | null;
  notes: Record<string, string>;
  taskLinks: Record<string, string>;
  consult: Consult | null;
  conference: Conference | null;
  startConsult: (kind: Consult['kind'], target: Omit<Leg, 'muted'>, presence?: 'available' | 'away' | 'busy') => void;
  setConsultState: (state: ConsultState) => void;
  cancelConsult: () => void;
  completeTransfer: () => void;
  mergeConsult: () => void;
  toggleLegMute: (id: string) => void;
  removeLeg: (id: string) => void;
  setNote: (callId: string, text: string) => void;
  startOutbound: (input: {
    number: string;
    contactId?: string | null;
    source: DialSource;
    taskId?: string | null;
    mode?: CallMode;
    dialMode?: DialMode;
    /** Backend: a due "For Me" callback the server asked the app to dial (the web's type CALLBACK) */
    callback?: boolean;
  }) => Promise<DialResult>;
  receiveIncoming: (pop: ScreenPop, mode: CallMode, fallback: boolean) => void;
  answer: () => Promise<void>;
  decline: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  setRoute: (r: AudioRoute) => void;
  sendDigit: (d: string) => void;
  end: () => void;
  /** The webphone's call ended from the other side: the customer hung up, didn't answer, or the server cleared it */
  remoteEnded: () => void;
  /** Socket inbound:incoming: the ring time of an accept/reject inbound call */
  inboundIncoming: (data: InboundRing) => void;
  /** Socket inbound:ended: the server ended that ring; tells the agent why, as the web's "Inbound call" toast */
  inboundEnded: (data: InboundEnded) => void;
  /** Backend: whether the webphone should answer the server's INVITE, setting up the call it brings */
  takeSipCall: (info: IncomingSipCall) => boolean;
  finishWrapUp: () => void;
  /** Drop any call, consult, conference and pending wrap-up without recording them (logout / revoke) */
  reset: () => void;
};

let transferredTo: string | null = null;
const timers = new Set<ReturnType<typeof setTimeout>>();
let qualityTimer: ReturnType<typeof setInterval> | null = null;
let statusPoll: ReturnType<typeof setInterval> | null = null;
let conferencePoll: ReturnType<typeof setInterval> | null = null;

const digits = (s: string) => s.replace(/\D/g, '');

function later(ms: number, fn: () => void) {
  const t = setTimeout(() => {
    timers.delete(t);
    fn();
  }, ms);
  timers.add(t);
}

// Accept/reject inbound, as the web's incoming panel: the ring time the server sent with the call (socket
// inbound:incoming), the timer that declines it once that time is up, and the last ring the server ended itself
// (the reason for it can arrive just after the webphone's hang-up has already cleared the call)
let ringInfo: InboundRing | null = null;
let ringTimer: ReturnType<typeof setTimeout> | null = null;
let serverEndedRing: { agentCallUuid?: string | null; at: number } | null = null;
const DEFAULT_RING_SEC = 30;

function clearRingTimer() {
  if (ringTimer) clearTimeout(ringTimer);
  ringTimer = null;
}

function clearTimers() {
  clearRingTimer();
  timers.forEach(clearTimeout);
  timers.clear();
  if (qualityTimer) clearInterval(qualityTimer);
  qualityTimer = null;
  if (statusPoll) clearInterval(statusPoll);
  statusPoll = null;
  if (conferencePoll) clearInterval(conferencePoll);
  conferencePoll = null;
}

function adapterFor(mode: CallMode): CallAdapter {
  return mode === 'voip' ? voipAdapter : bridgeAdapter;
}

function callMeta(dialMode: DialMode) {
  const agent = useSession.getState().agent;
  const campaign = findCampaign(agent?.campaignId);
  return {
    uuid: newCallUuid(),
    campaignName: campaign?.name ?? agent?.campaignName ?? 'No campaign',
    listName: campaign?.listName ?? '—',
    dialMode,
  };
}

function newCallUuid() {
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  // RFC 4122 v4: version nibble 4, variant nibble 8-b
  const variant = '89ab'[Math.floor(Math.random() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

/** The app's sample contacts are the demo's only: against the backend the caller is who the server says (call context) */
function sampleContact(number: string, contactId?: string | null) {
  if (USE_BACKEND) return null;
  return contactById(contactId) ?? findContactByNumber(number);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Each campaign's phone masking rule once the server has said it (null: not masked), as the web keeps it */
const maskRules = new Map<string, PhoneMaskRule | null>();

/** A name the server masked isn't sent back to it as the lead's or callback's name */
export function sendableName(name: string | null | undefined) {
  return name && !name.includes(MASK_CHAR) ? name : '';
}

/**
 * The web's maskCustomerParticipantName: in the conference's member list the customer is named by their number,
 * so when the campaign masks the number that row shows the masked one too
 */
function customerLegName(name: string, role: string | null | undefined, call: ActiveCall | null) {
  const masked = call?.displayNumber && call.displayNumber !== call.number ? call.displayNumber : undefined;
  if (!masked || role !== 'customer') return name;
  return /^[+\d\s()-]+$/.test(String(name ?? '').trim()) ? masked : name;
}

export function buildPop(number: string, contactId?: string | null): ScreenPop {
  const contact = sampleContact(number, contactId);
  const openTasks = contact ? useData.getState().tasks.filter((t) => t.contactId === contact.id && !t.done) : [];
  return {
    contact,
    number,
    openTasks,
    lastDisposition: contact?.lastDisposition ?? null,
    queue: useSession.getState().agent?.campaignName ?? 'Default queue',
  };
}

export const useCall = create<CallStore>((set, get) => {
  const patch = (p: Partial<ActiveCall>) => {
    const c = get().call;
    if (c) set({ call: { ...c, ...p } });
  };

  /**
   * Backend: who the customer is, as the web's call page asks it (call-context, also its usePhoneMask): the
   * lead's name, ids, list and prefix, and the campaign's masking rule for the number. Until the rule is known
   * the number is fully masked; without a usable campaign, or for a campaign without a CRM template, it is shown
   * as it is. An answer that comes after the call ended goes onto its record, which the wrap-up reads.
   */
  const loadContext = (id: string) => {
    if (!USE_BACKEND) return;
    const c = get().call;
    if (!c || c.id !== id || !c.number) return;
    const campaignId = c.campaignId ?? useSession.getState().agent?.campaignId;
    if (!campaignId || !UUID_RE.test(campaignId)) {
      if (!c.displayNumber) patch({ displayNumber: c.number });
      return;
    }
    if (c.contextCampaign === campaignId) return;
    const known = maskRules.get(campaignId);
    patch({
      contextCampaign: campaignId,
      displayNumber: maskRules.has(campaignId) ? maskPhoneForDisplay(c.number, known) : maskPhoneFully(c.number),
    });
    const apply = (p: Partial<ActiveCall>) => {
      const cur = get().call;
      if (cur?.id === id) {
        // A newer context (the call's campaign changed meanwhile) wins
        if (cur.contextCampaign === campaignId) patch(p);
        return;
      }
      const { displayNumber, customerName, leadId, listId, campaignPrefix } = p;
      useData.setState((s) => ({
        calls: s.calls.map((r) =>
          r.id === id
            ? {
                ...r,
                ...(displayNumber !== undefined && { displayNumber }),
                ...(customerName !== undefined && { customerName }),
                ...(leadId && !r.leadId ? { leadId } : {}),
                ...(listId !== undefined && { listId }),
                ...(campaignPrefix !== undefined && { campaignPrefix }),
              }
            : r,
        ),
        // The missed-call reminder made for it shows the same name and number
        tasks: s.tasks.map((t) =>
          t.createdFromCallId === id && t.kind === 'missed'
            ? {
                ...t,
                ...(displayNumber !== undefined && { displayNumber }),
                ...(customerName !== undefined && { name: customerName }),
              }
            : t,
        ),
      }));
    };
    api.liveCalls
      .context(c.number, campaignId, c.leadId)
      .then((ctx) => {
        maskRules.set(campaignId, ctx.maskRule);
        const cur = get().call;
        apply({
          displayNumber: maskPhoneForDisplay(c.number, ctx.maskRule),
          customerName: ctx.name || undefined,
          leadId: (cur?.id === id ? cur.leadId : null) ?? ctx.leadId,
          listId: ctx.listId,
          campaignPrefix: ctx.prefix,
        });
      })
      // As the web: the last rule known for this campaign, else the number as it is
      .catch(() => apply({ displayNumber: maskPhoneForDisplay(c.number, maskRules.get(campaignId) ?? null) }));
  };

  const startQuality = () => {
    if (qualityTimer) clearInterval(qualityTimer);
    patch({ quality: sampleNetwork() });
    qualityTimer = setInterval(() => patch({ quality: sampleNetwork() }), 2000);
  };

  // Bound to a call id: the ring/answer timers that schedule it must not connect a newer call
  const connect = (id: string) => {
    const c = get().call;
    if (!c || c.id !== id || c.state === 'ended') return;
    patch({ state: 'connected', connectedAt: Date.now() });
    nativeCall.reportConnected(c.id);
    if (c.mode === 'voip') startQuality();
  };

  // Like the web after a manual call (startCallStatusPolling): the server's session turns INCALL once the
  // customer answers, and the polling stops there, or on READY / DISPO, when the server is done with the call
  const connectWhenAnswered = (id: string) => {
    const stop = () => {
      if (statusPoll) clearInterval(statusPoll);
      statusPoll = null;
    };
    stop();
    statusPoll = setInterval(() => {
      api.liveCalls
        .status()
        .then((status) => {
          const c = get().call;
          if (c?.id !== id) return stop();
          if (status === 'INCALL') {
            stop();
            connect(id);
          } else if (status === 'READY' || status === 'DISPO') {
            stop();
            // A call that ended before it ever reached the webphone (once it has, the webphone's own hang-up ends
            // it): on DISPO the server waits for a disposition, so wrap-up; on READY there's nothing to dispose
            if (c.onWebphone || c.connectedAt) return;
            if (status === 'DISPO') return get().remoteEnded();
            clearTimers();
            nativeCall.reportEnded(c.id);
            recordCall({ ...c, state: 'ended', endedAt: Date.now() }, 'failed');
            set({ call: null, consult: null, conference: null });
          }
        })
        // The web stops on the first failed check, but its call also connects on the webphone's answer; here the
        // INCALL check is what connects the call, so a dropped check is simply tried again a second later
        .catch(() => undefined);
    }, 1000);
  };

  // Like the web's resetCall: the call is over, so the server moves the agent on to the disposition (DISPO).
  // Only for a call that goes to wrap-up: otherwise the agent would be left waiting on a disposition.
  const reportEnded = () => {
    if (USE_BACKEND) void api.liveCalls.ended().catch(() => undefined);
  };

  /**
   * A customer the server put through to the webphone by itself: an inbound call, a transfer or conference,
   * or the campaign's dialer (progressive / predictive / preview). As on the web, the webphone answers at
   * once. A predictive customer has already answered and an inbound one is connected as the webphone
   * answers; a progressive or preview customer is still ringing until the server says INCALL. Inbound
   * campaigns with accept/reject ring here until the agent answers or declines.
   */
  const startServerCall = (info: IncomingSipCall) => {
    const type = (info.callType ?? '').toLowerCase();
    const inbound = type === 'inbound' || info.transfer || info.conference;
    const live = !info.acceptReject && (inbound || type === 'predictive');
    const number = info.customerNumber ?? '';
    const contact = sampleContact(number);
    const meta = callMeta(inbound ? 'Inbound' : 'Auto');
    const id = uid('cl');
    set({
      call: {
        id,
        direction: inbound ? 'inbound' : 'outbound',
        mode: 'voip',
        state: live ? 'connected' : 'ringing',
        number,
        contactId: contact?.id ?? null,
        pop: buildPop(number, contact?.id),
        source: inbound ? 'inbound' : 'keypad',
        taskId: null,
        createdAt: Date.now(),
        connectedAt: live ? Date.now() : null,
        endedAt: null,
        muted: false,
        held: false,
        route: useSettings.getState().defaultAudio,
        dtmf: '',
        quality: null,
        verdict: null,
        fallback: false,
        modeOverridden: false,
        error: null,
        ...meta,
        uuid: info.callUuid ?? meta.uuid,
        // It came in as the webphone's call, so the webphone's hang-up is what ends it
        onWebphone: true,
        campaignName: findCampaign(info.campaignId ?? undefined)?.name ?? meta.campaignName,
        campaignId: info.campaignId ?? undefined,
        leadId: info.leadId,
        agentCallUuid: info.agentCallUuid,
      },
    });
    loadContext(id);
    if (live) {
      nativeCall.reportConnected(id);
      startQuality();
    } else if (info.acceptReject) {
      nativeCall.reportIncoming(id, contact?.name ?? number);
      startRingTimer();
    } else {
      nativeCall.reportOutgoing(id, number);
      connectWhenAnswered(id);
    }
  };

  /**
   * The web's ring timer (IncomingCallPanel): an accept/reject call not answered within the ring time the
   * server sent (30 s when it didn't) is declined, as if the agent pressed Decline. Counted from when it rang.
   * As on the web, this happens even while an Accept is still with the server.
   */
  const startRingTimer = () => {
    clearRingTimer();
    const c = get().call;
    if (!c || c.direction !== 'inbound' || c.state !== 'ringing') return;
    const sent = ringInfo && (!ringInfo.agentCallUuid || ringInfo.agentCallUuid === c.agentCallUuid) ? ringInfo.ringTimeoutSec : undefined;
    const seconds = typeof sent === 'number' && sent > 0 ? sent : DEFAULT_RING_SEC;
    ringTimer = setTimeout(
      () => {
        ringTimer = null;
        const cur = get().call;
        if (cur?.id === c.id && cur.state === 'ringing') get().decline();
      },
      Math.max(0, seconds * 1000 - (Date.now() - c.createdAt)),
    );
  };

  /** The conference's members as the server has them, every 3 s like the web; this agent isn't listed */
  const watchConference = (id: string, callUuid: string) => {
    if (conferencePoll) clearInterval(conferencePoll);
    const stop = () => {
      if (conferencePoll) clearInterval(conferencePoll);
      conferencePoll = null;
    };
    const load = () =>
      api.liveCalls
        .participants(callUuid)
        .then((parts) => {
          if (get().call?.id !== id) return stop();
          const legs: Leg[] = parts
            .filter((p) => p.role !== 'primary_agent')
            .map((p) => ({
              id: String(p.memberId),
              name: customerLegName(p.name, p.role, get().call) || p.roleLabel,
              role: p.roleLabel,
              kind: p.role === 'customer' ? 'customer' : p.role === 'conference_agent' ? 'agent' : 'external',
              muted: !!p.muted,
            }));
          if (!legs.length) {
            set({ conference: null });
            return stop();
          }
          set({ conference: { startedAt: get().conference?.startedAt ?? Date.now(), legs } });
        })
        .catch(() => undefined);
    void load();
    conferencePoll = setInterval(load, 3000);
  };

  /**
   * Backend transfer or conference, the web's way: blind and on the server. The server rings the target
   * (the request waits up to ~40 s) and bridges them in once they answer. A transfer then hangs up this
   * agent's leg, which ends the call into wrap-up; a conference keeps it and its members are polled.
   */
  const startServerConsult = async (kind: Consult['kind'], target: Omit<Leg, 'muted'>) => {
    const c = get().call;
    if (!c) return;
    const startedAt = Date.now();
    set({
      consult: { kind, target: { ...target, muted: false }, state: 'calling', startedAt, answeredAt: null, heldBefore: false, error: null },
    });
    // Read by recordCall when the server's hang-up ends the call
    if (kind === 'transfer') transferredTo = target.name;
    const body = {
      callUuid: c.uuid,
      phoneNumber: target.dial ?? '',
      isInternal: target.kind === 'agent',
      customerNumber: c.number,
      campaignId: c.campaignId ?? useSession.getState().agent?.campaignId,
    };
    try {
      if (kind === 'transfer') await api.liveCalls.transfer(body);
      else await api.liveCalls.conference(body);
      if (get().consult?.startedAt === startedAt) set({ consult: null });
      // The web's success toasts
      notify(kind === 'transfer' ? 'Call handed over successfully' : 'Conference connected successfully', 'success', undefined, {
        title: kind === 'transfer' ? 'Transfer Done' : 'Joined Up',
      });
      if (kind === 'conference' && get().call?.id === c.id) {
        set({ conference: get().conference ?? { startedAt: Date.now(), legs: [] } });
        watchConference(c.id, c.uuid);
      }
    } catch (e) {
      if (kind === 'transfer') transferredTo = null;
      const x = get().consult;
      if (!x || x.startedAt !== startedAt) return;
      // The web's texts: an answer of { success:false } shows its message or "Target did not answer or was busy";
      // any other failure the server's message or "Failed. Please try again." (shown under "Call Failed")
      const ok200 = e instanceof ApiError && e.server?.status !== undefined && e.server.status < 400;
      const message = ok200 ? webText(e, ['message'], 'Target did not answer or was busy') : webText(e, ['message'], 'Failed. Please try again.');
      set({ consult: { ...x, state: /time ?out|no answer|not answer/i.test(message) ? 'no-answer' : 'declined', error: message } });
    }
  };

  const recordCall = (c: ActiveCall, outcome: CallRecord['outcome'], by: CallRecord['disconnectedBy'] = 'customer') => {
    const startedAt = new Date(c.createdAt).toISOString();
    const talkSec = c.connectedAt ? Math.round(((c.endedAt ?? Date.now()) - c.connectedAt) / 1000) : 0;
    const record: CallRecord = {
      id: c.id,
      contactId: c.contactId,
      number: c.number,
      direction: c.direction,
      outcome,
      mode: c.mode,
      startedAt,
      durationSec: Math.round(((c.endedAt ?? Date.now()) - c.createdAt) / 1000),
      talkSec,
      disconnectedBy: by,
      uuid: c.uuid,
      disposition: null,
      notes: transferredTo ? `Transferred to ${transferredTo}.` : '',
      hasRecording: outcome === 'answered',
      campaignId: c.campaignId ?? useSession.getState().agent?.campaignId ?? useData.getState().dispositions.campaignId,
      leadId: c.leadId ?? null,
      customerName: c.customerName,
      displayNumber: c.displayNumber,
      listId: c.listId,
      campaignPrefix: c.campaignPrefix,
      fallbackUsed: c.fallback,
      updatedAt: new Date().toISOString(),
    };
    useData.getState().addCall(record);
    return record;
  };

  const createMissedTask = (c: ActiveCall) => {
    const now = Date.now();
    const task: Task = {
      id: uid('tk'),
      kind: 'missed',
      title: 'Call back missed call',
      contactId: c.contactId,
      // The real number to call back on; shown as the campaign's masking says, like the call itself
      number: c.number,
      displayNumber: c.displayNumber,
      name: c.customerName,
      dueAt: new Date(now).toISOString(),
      slaDueAt: new Date(now + 2 * 3600000).toISOString(),
      notes: '',
      done: false,
      createdFromCallId: c.id,
      updatedAt: new Date(now).toISOString(),
    };
    useData.getState().upsertTask(task);
  };

  return {
    call: null,
    wrapUpCallId: null,
    notes: {},
    taskLinks: {},
    consult: null,
    conference: null,

    startConsult: (kind, target, presence = 'available') => {
      const c = get().call;
      if (!c || get().consult) return;
      if (USE_BACKEND) return void startServerConsult(kind, target);
      const heldBefore = c.state === 'held';
      if (c.state === 'connected') get().toggleHold();
      const startedAt = Date.now();
      set({ consult: { kind, target: { ...target, muted: false }, state: 'calling', startedAt, answeredAt: null, heldBefore } });
      // Away agents don't pick up, busy ones bounce; everyone else answers after a couple of rings
      later(presence === 'available' ? 2400 : 3200, () => {
        const x = get().consult;
        if (!x || x.startedAt !== startedAt || x.state !== 'calling') return;
        if (presence === 'available') set({ consult: { ...x, state: 'answered', answeredAt: Date.now() } });
        else set({ consult: { ...x, state: presence === 'busy' ? 'busy' : 'no-answer' } });
      });
    },

    setConsultState: (state) => {
      const x = get().consult;
      if (x) set({ consult: { ...x, state, answeredAt: state === 'answered' ? (x.answeredAt ?? Date.now()) : x.answeredAt } });
    },

    cancelConsult: () => {
      const x = get().consult;
      if (!x) return;
      set({ consult: null });
      if (!x.heldBefore && get().call?.state === 'held') get().toggleHold();
    },

    completeTransfer: () => {
      const x = get().consult;
      if (!x || x.state !== 'answered') return;
      set({ consult: null, conference: null });
      transferredTo = x.target.name;
      get().end();
    },

    mergeConsult: () => {
      const x = get().consult;
      const c = get().call;
      if (!x || !c || x.state !== 'answered') return;
      set({ consult: { ...x, state: 'merging' } });
      later(900, () => {
        const cur = get().consult;
        if (!cur || cur.state !== 'merging') return;
        const conf = get().conference;
        const customer: Leg = {
          id: 'customer',
          name: c.pop.contact?.name ?? c.customerName ?? c.displayNumber ?? c.number,
          role: 'Customer',
          kind: 'customer',
          muted: false,
        };
        set({
          consult: null,
          conference: conf
            ? { ...conf, legs: [...conf.legs.filter((l) => l.id !== cur.target.id), cur.target] }
            : { startedAt: Date.now(), legs: [customer, cur.target] },
        });
        if (!cur.heldBefore && get().call?.state === 'held') get().toggleHold();
      });
    },

    toggleLegMute: (id) => {
      const conf = get().conference;
      if (!conf) return;
      const leg = conf.legs.find((l) => l.id === id);
      set({ conference: { ...conf, legs: conf.legs.map((l) => (l.id === id ? { ...l, muted: !l.muted } : l)) } });
      const c = get().call;
      // The member's mute in the conference room; the next poll shows the server's state either way
      if (USE_BACKEND && leg && c) {
        void api.liveCalls
          .conferenceMute(c.uuid, id, !leg.muted)
          .catch(() => notify(`Couldn't ${leg.muted ? 'unmute' : 'mute'} ${leg.name}`, 'error', undefined, { title: 'Action failed' }));
      }
    },

    removeLeg: (id) => {
      const conf = get().conference;
      if (!conf) return;
      const legs = conf.legs.filter((l) => l.id !== id);
      if (USE_BACKEND) {
        // Out of the conference room on the server. The call stays in the room with whoever is left (the
        // web ends the whole conference instead once one participant is left); the next poll shows it.
        const c = get().call;
        const leg = conf.legs.find((l) => l.id === id);
        // The web's toasts: "Removed" on success, "Action failed" otherwise
        if (c && leg) {
          void api.liveCalls.conferenceKick(c.uuid, id).then(
            () => notify(`${leg.name} was removed from the conference`, 'success', undefined, { title: 'Removed' }),
            () => notify(`Couldn't remove ${leg.name}`, 'error', undefined, { title: 'Action failed' }),
          );
        }
        if (!legs.some((l) => l.kind === 'customer')) return get().end();
        set({ conference: { ...conf, legs } });
        return;
      }
      // Without the customer there is no call left to have: agents talking to each other is not a customer call
      if (!legs.some((l) => l.kind === 'customer')) return get().end();
      // Back to a plain two-party call once only the customer is left
      set({ conference: legs.length <= 1 ? null : { ...conf, legs } });
    },

    setNote: (callId, text) => set((s) => ({ notes: { ...s.notes, [callId]: text } })),

    startOutbound: async ({ number, contactId = null, source, taskId = null, mode, dialMode = 'Manual', callback = false }) => {
      if (get().call) return { ok: false, title: 'Already on a call', message: 'End the current call first.' };
      const wrap = get().wrapUpCallId;
      if (wrap) {
        return { ok: false, title: 'Finish wrap-up first', message: 'Your last call needs a disposition before the next one.' };
      }
      const contact = sampleContact(number, contactId);
      const data = useData.getState();
      // Against the backend the server decides, as for the web: DNC and the campaign's own calling hours,
      // days and dates. The app's fixed 9:00–21:00 check is for the demo's mock contacts only.
      if (!USE_BACKEND) {
        const compliance = checkBeforeDial(contact, data.server.featureFlags.callingHours !== false);
        if (!compliance.ok) return { ok: false, title: compliance.title, message: compliance.message };
      }

      const id = uid('cl');
      const pref = useSettings.getState().callMode;
      if (taskId) set((s) => ({ taskLinks: { ...s.taskLinks, [id]: taskId } }));
      set({
        call: {
          id,
          direction: 'outbound',
          // Against the backend every call goes over the app's webphone
          mode: pref === 'bridge' && !USE_BACKEND ? 'bridge' : 'voip',
          state: 'checking',
          number,
          contactId: contact?.id ?? null,
          pop: buildPop(number, contact?.id),
          source,
          taskId,
          createdAt: Date.now(),
          connectedAt: null,
          endedAt: null,
          muted: false,
          held: false,
          route: useSettings.getState().defaultAudio,
          dtmf: '',
          quality: null,
          verdict: null,
          fallback: false,
          modeOverridden: !!mode,
          error: null,
          ...callMeta(dialMode),
        },
      });
      // The agent's campaign, as the web's call page asks it; asked again below if the server dials in another
      loadContext(id);

      let resolved: CallMode;
      if (USE_BACKEND) resolved = 'voip';
      else if (mode) resolved = mode;
      else if (pref === 'auto') {
        const verdict = await runNetworkCheck(data.server.modeThresholds);
        patch({ verdict });
        resolved = verdict.mode;
      } else resolved = pref;

      if (get().call?.id !== id) return { ok: true };
      // Backend: End waits for the server's answer to the dial, as the web's dial button stays busy until then;
      // ending earlier would leave the server dialing a customer the app no longer shows
      patch({ mode: resolved, state: 'dialing', ...(USE_BACKEND && { dialPending: true }) });
      let dialed: Awaited<ReturnType<CallAdapter['dial']>>;
      try {
        dialed = await adapterFor(resolved).dial({ number, contactId: contact?.id ?? null, callback });
        if (get().call?.id === id) patch({ dialPending: false });
      } catch (e) {
        const cur = get().call;
        // A call that is no longer on screen: nothing to report
        if (cur?.id !== id) return { ok: true };
        // The server dialed the customer and its call already reached the webphone (the request failed on the way
        // back, e.g. the connection dropped): the call goes ahead, so no error, as on the web, whose call screen
        // runs on the webphone's call rather than on this request
        if (USE_BACKEND && cur.onWebphone) {
          patch({ dialPending: false });
          nativeCall.reportOutgoing(id, number);
          if (cur.state === 'dialing') patch({ state: 'ringing' });
          connectWhenAnswered(id);
          return { ok: true };
        }
        clearTimers();
        set({ call: null });
        if (USE_BACKEND) {
          // The web's manual call: a "Call Failed" toast with the server's message, else its error, else its fallback
          return { ok: false, toast: true, title: 'Call Failed', message: webText(e, ['message', 'error'], 'Unable to start call') };
        }
        return {
          ok: false,
          title: 'Call could not start',
          message: e instanceof Error ? `${e.message}. Try again when you have signal.` : 'Try again.',
        };
      }
      nativeCall.reportOutgoing(id, number);
      if (USE_BACKEND) {
        // The server is dialing the customer now; its INVITE to the webphone may already have come in
        const current = get().call;
        if (current?.id === id) {
          patch({
            // The INVITE's id wins when it came first (the web keeps the INVITE's too)
            uuid: current.onWebphone ? current.uuid : dialed.callId,
            leadId: dialed.leadId ?? current.leadId ?? null,
            campaignId: dialed.campaignId ?? current.campaignId,
            ...(current.state === 'dialing' && { state: 'ringing' as const }),
          });
          // An auto-dial group resolves to one of its campaigns: its own rules and lead
          loadContext(id);
          connectWhenAnswered(id);
        }
        return { ok: true };
      }
      later(resolved === 'bridge' ? 2600 : 1200, () => patch({ state: 'ringing' }));
      later(resolved === 'bridge' ? 5200 : 3600, () => connect(id));
      return { ok: true };
    },

    receiveIncoming: (pop, mode, fallback) => {
      // A pending wrap-up must get its disposition before another call can take its place
      if (get().call || get().wrapUpCallId) return;
      const id = uid('cl');
      set({
        call: {
          id,
          direction: 'inbound',
          mode,
          state: 'ringing',
          number: pop.number,
          contactId: pop.contact?.id ?? null,
          pop,
          source: 'inbound',
          taskId: null,
          createdAt: Date.now(),
          connectedAt: null,
          endedAt: null,
          muted: false,
          held: false,
          route: useSettings.getState().defaultAudio,
          dtmf: '',
          quality: null,
          verdict: null,
          fallback,
          modeOverridden: false,
          error: null,
          ...callMeta('Inbound'),
        },
      });
      nativeCall.reportIncoming(id, pop.contact?.name ?? pop.number);
      later(25000, () => {
        const c = get().call;
        if (c?.id === id && c.state === 'ringing') get().decline();
      });
    },

    answer: async () => {
      const c = get().call;
      if (!c || c.state !== 'ringing' || c.direction !== 'inbound') return;
      if (USE_BACKEND) {
        // Accept/reject inbound: the webphone already answered, the server connects the customer on Accept. As
        // the web's incoming panel: it keeps ringing while Accept is with the server, and if that fails the
        // agent can press Accept again ("Inbound call" / "Failed to accept call")
        if (c.accepting) return;
        patch({ accepting: true });
        try {
          await api.liveCalls.acceptInbound(c.uuid, c.agentCallUuid ?? null);
        } catch {
          if (get().call?.id === c.id) patch({ accepting: false });
          notify('Failed to accept call', 'error', undefined, { title: 'Inbound call' });
          return;
        }
        if (get().call?.id !== c.id) return;
        clearTimers();
        patch({ accepting: false, state: 'dialing' });
        connectWhenAnswered(c.id);
        return;
      }
      clearTimers();
      patch({ state: 'dialing' });
      await adapterFor(c.mode)
        .answer(c.id)
        .catch(() => undefined);
      later(c.mode === 'bridge' ? 900 : 400, () => connect(c.id));
    },

    decline: () => {
      const c = get().call;
      // Only a ringing inbound call can be declined; anything else goes through end() so the record is right
      if (!c || c.direction !== 'inbound' || c.state !== 'ringing') return;
      clearTimers();
      const ended = { ...c, state: 'ended' as const, endedAt: Date.now() };
      recordCall(ended, 'missed');
      createMissedTask(ended);
      nativeCall.reportEnded(c.id);
      set({ call: null });
      // The server hangs up the agent's leg and offers the customer to the next agent
      if (USE_BACKEND) void api.liveCalls.rejectInbound(c.uuid, c.agentCallUuid ?? null).catch(() => undefined);
    },

    toggleMute: () => {
      const c = get().call;
      if (!c) return;
      patch({ muted: !c.muted });
      void adapterFor(c.mode)
        .mute(c.id, !c.muted)
        .catch(() => patch({ muted: c.muted }));
    },

    toggleHold: () => {
      const c = get().call;
      if (!c || (c.state !== 'connected' && c.state !== 'held')) return;
      const on = c.state === 'connected';
      if (USE_BACKEND) {
        // The web's toggleHold: one request at a time (taps while it runs are ignored), and the call only shows
        // "On hold" once the server has put the customer on hold music; a failure leaves it as it was
        if (c.holdPending) return;
        patch({ holdPending: true, holdFailed: false, error: null });
        const settle = (p: Partial<ActiveCall>) => {
          if (get().call?.id === c.id) patch({ holdPending: false, ...p });
        };
        void adapterFor(c.mode)
          .hold(c.uuid, on)
          .then(
            () => settle({ state: on ? 'held' : 'connected', held: on }),
            // The web's holdError: the server's message, else its error, else "Could not hold/resume the call"
            (e) => settle({ holdFailed: true, error: webText(e, ['message', 'error'], `Could not ${on ? 'hold' : 'resume'} the call`) }),
          );
        return;
      }
      patch({ state: on ? 'held' : 'connected', held: on });
      void adapterFor(c.mode)
        .hold(c.uuid, on)
        .catch(() => patch({ state: c.state, held: c.held, error: 'Hold failed. Check your connection.' }));
    },

    setRoute: (route) => patch({ route }),

    sendDigit: (d) => {
      const c = get().call;
      if (!c) return;
      patch({ dtmf: (c.dtmf + d).slice(-24) });
      void adapterFor(c.mode)
        .dtmf(c.id, d)
        .catch(() => undefined);
    },

    end: () => {
      const c = get().call;
      if (!c) return;
      // As the web's hang-up: a conference is ended for everyone in it, then this agent's leg
      if (USE_BACKEND && get().conference) void api.liveCalls.endConference(c.uuid).catch(() => undefined);
      clearTimers();
      const ended = { ...c, state: 'ended' as const, endedAt: Date.now() };
      nativeCall.reportEnded(c.id);
      // A call cancelled before it ever rang the customer never happened from their side:
      // record it as failed and skip the (mandatory) wrap-up instead of forcing a false disposition.
      const neverRang = !c.connectedAt && (c.state === 'checking' || c.state === 'dialing');
      const outcome: CallRecord['outcome'] = c.connectedAt ? 'answered' : neverRang ? 'failed' : 'no-answer';
      recordCall(ended, outcome, 'agent');
      set({ call: null, wrapUpCallId: neverRang ? null : c.id, consult: null, conference: null });
      transferredTo = null;
      // Only once the call is cleared: hanging up the webphone reports "ended" straight back (remoteEnded),
      // which must find nothing left to end
      void adapterFor(c.mode).end(c.id);
      if (!neverRang) reportEnded();
    },

    remoteEnded: () => {
      const c = get().call;
      if (!c) return;
      clearTimers();
      const ended = { ...c, state: 'ended' as const, endedAt: Date.now() };
      nativeCall.reportEnded(c.id);
      // An accept/reject inbound call that was never accepted (it timed out, or the customer left) is a
      // missed call with nothing to disposition; the server has already moved on
      if (c.direction === 'inbound' && c.state === 'ringing') {
        recordCall(ended, 'missed');
        createMissedTask(ended);
        set({ call: null });
        // Its reason (inbound:ended) can come just after this
        serverEndedRing = { agentCallUuid: c.agentCallUuid, at: Date.now() };
        return;
      }
      recordCall(ended, c.connectedAt ? 'answered' : 'no-answer', 'customer');
      set({ call: null, wrapUpCallId: c.id, consult: null, conference: null });
      transferredTo = null;
      reportEnded();
    },

    inboundIncoming: (data) => {
      ringInfo = data;
      const c = get().call;
      // The ring time can arrive after the call itself: restart the timer with it
      if (c?.direction === 'inbound' && c.state === 'ringing' && (!data.agentCallUuid || data.agentCallUuid === c.agentCallUuid)) {
        startRingTimer();
      }
    },

    inboundEnded: ({ agentCallUuid, reason }) => {
      // As the web's incoming panel (components/analytics/DialpadPanel.tsx): only for the ring still on screen,
      // or one the server just ended; a call the agent declined or accepted has nothing to report
      const c = get().call;
      const ringing = c?.direction === 'inbound' && c.state === 'ringing' && (!agentCallUuid || agentCallUuid === c.agentCallUuid);
      const justEnded =
        !!serverEndedRing && Date.now() - serverEndedRing.at < 15000 && (!agentCallUuid || agentCallUuid === serverEndedRing.agentCallUuid);
      if (!ringing && !justEnded) return;
      serverEndedRing = null;
      if (!reason || reason === 'connected') return;
      // The server has moved on: the ring is over, recorded as a missed call
      if (ringing) get().remoteEnded();
      serverEndedRing = null;
      notify(
        reason === 'timeout'
          ? 'Missed inbound call'
          : reason === 'customer_gone'
            ? 'Caller disconnected'
            : reason === 'preempted'
              ? 'Call was answered by a supervisor'
              : 'Inbound call ended',
        'info',
        undefined,
        { title: 'Inbound call' },
      );
    },

    takeSipCall: (info) => {
      const c = get().call;
      // The call the agent just dialed from here: the server's INVITE carries its customer's number
      if (c) {
        const sameNumber = !!info.customerNumber && digits(c.number).endsWith(digits(info.customerNumber).slice(-10));
        if (c.direction !== 'outbound' || (c.state !== 'dialing' && c.state !== 'ringing') || !sameNumber) return false;
        // Like the web, the INVITE's customer leg (X-Master-Call-Id / X-Call-Id) becomes the call's id for hold etc.
        patch({
          onWebphone: true,
          uuid: info.callUuid ?? c.uuid,
          leadId: c.leadId ?? info.leadId,
          campaignId: c.campaignId ?? info.campaignId ?? undefined,
        });
        return true;
      }
      // A supervisor listening in, whispering or barging in: answered with no call screen, as on the web
      if (info.intervention) return true;
      // Anything else needs a customer, and a pending disposition comes first
      if (!info.customerNumber || get().wrapUpCallId) return false;
      startServerCall(info);
      return true;
    },

    finishWrapUp: () =>
      set((s) => {
        // The wrap-up screen has read its draft note and task link by now; drop them so the maps don't grow per call
        const id = s.wrapUpCallId;
        if (!id) return { wrapUpCallId: null };
        const { [id]: _note, ...notes } = s.notes;
        const { [id]: _link, ...taskLinks } = s.taskLinks;
        return { wrapUpCallId: null, notes, taskLinks };
      }),

    reset: () => {
      const c = get().call;
      clearTimers();
      transferredTo = null;
      set({ call: null, wrapUpCallId: null, consult: null, conference: null, notes: {}, taskLinks: {} });
      // After clearing, so the webphone's "ended" doesn't record the call or open a wrap-up
      if (c) {
        void adapterFor(c.mode).end(c.id);
        nativeCall.reportEnded(c.id);
      }
    },
  };
});

// Module-level subscriptions survive Fast Refresh re-evaluation; unhook the previous ones so an
// incoming call isn't delivered to a store instance that no screen renders any more.
const registry = globalThis as { __claritelCallStoreUnsubscribe?: () => void };
registry.__claritelCallStoreUnsubscribe?.();
const offIncoming = realtime.on('call.incoming', ({ pop, mode, fallback }) => {
  useCall.getState().receiveIncoming(pop, mode, fallback);
});
// Signing out (or a remote revoke) ends whatever call state is left so the auth gate and
// call routing don't fight over the screen, and the next login doesn't inherit a wrap-up.
const offSession = useSession.subscribe((s, prev) => {
  if (prev.token && !s.token) useCall.getState().reset();
});
// The webphone's audio follows the call: call mode (earpiece, proximity sensor) from the moment there is
// a call, the route the agent picks on the call screen, and normal audio again once it's gone
const offAudio = useCall.subscribe((s, prev) => {
  if (!USE_BACKEND) return;
  if (s.call && !prev.call) startCallAudio(s.call.route);
  else if (!s.call && prev.call) stopCallAudio();
  else if (s.call && prev.call && s.call.route !== prev.call.route) setCallAudioRoute(s.call.route);
});
registry.__claritelCallStoreUnsubscribe = () => {
  offIncoming();
  offSession();
  offAudio();
};

// Every call the server puts through to the webphone goes through takeSipCall: the agent's own manual
// call, inbound and auto-dialer customers, transfers, conferences and supervisors
setSipCallHandlers({
  accept: (info) => useCall.getState().takeSipCall(info),
  ended: () => useCall.getState().remoteEnded(),
});
