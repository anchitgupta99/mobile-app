import { create } from 'zustand';
import { api } from '@/api/client';
import { USE_BACKEND } from '@/api/http';
import { realtime } from '@/api/realtime';
import { sampleNetwork } from '@/api/network';
import type { CallDirection, CallMode, CallRecord, CallState, NetworkSample, ScreenPop, Task } from '@/domain/types';
import { uid } from '@/domain/format';
import { contactById, findContactByNumber, useData } from '@/store/data';
import { useSession } from '@/store/session';
import { useSettings, type AudioRoute } from '@/store/settings';
import { reasons } from '@/mocks/seed';
import { findCampaign } from '@/store/campaigns';
import type { CallAdapter } from './adapter';
import { bridgeAdapter } from './bridge';
import { checkBeforeDial } from './compliance';
import { runNetworkCheck, type NetworkVerdict } from './networkCheck';
import { voipAdapter } from './voip';
import { nativeCall } from './nativeCall';
import { setCallAudioRoute, startCallAudio, stopCallAudio } from './sip/audioRoute';
import { setSipCallHandlers, type IncomingSipCall } from './sip/sipPhone';

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

export type DialResult = { ok: true } | { ok: false; title: string; message: string };

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

function clearTimers() {
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

export function buildPop(number: string, contactId?: string | null): ScreenPop {
  const contact = contactById(contactId) ?? findContactByNumber(number);
  const openTasks = contact ? useData.getState().tasks.filter((t) => t.contactId === contact.id && !t.done) : [];
  return {
    contact,
    number,
    openTasks,
    lastDisposition: contact?.lastDisposition ?? null,
    likelyReason: openTasks[0]?.title ?? reasons[Math.floor(Math.random() * reasons.length)],
    queue: useSession.getState().agent?.campaignName ?? 'Default queue',
  };
}

export const useCall = create<CallStore>((set, get) => {
  const patch = (p: Partial<ActiveCall>) => {
    const c = get().call;
    if (c) set({ call: { ...c, ...p } });
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

  // Like the web after a manual call: the server's session turns INCALL once the customer answers
  const connectWhenAnswered = (id: string) => {
    if (statusPoll) clearInterval(statusPoll);
    statusPoll = setInterval(() => {
      api.liveCalls
        .status()
        .then((status) => {
          if (get().call?.id !== id) {
            if (statusPoll) clearInterval(statusPoll);
            statusPoll = null;
          } else if (status === 'INCALL') {
            if (statusPoll) clearInterval(statusPoll);
            statusPoll = null;
            connect(id);
          }
        })
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
    const contact = findContactByNumber(number);
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
        campaignName: findCampaign(info.campaignId ?? undefined)?.name ?? meta.campaignName,
        campaignId: info.campaignId ?? undefined,
        leadId: info.leadId,
        agentCallUuid: info.agentCallUuid,
      },
    });
    if (live) {
      nativeCall.reportConnected(id);
      startQuality();
    } else if (info.acceptReject) {
      nativeCall.reportIncoming(id, contact?.name ?? number);
    } else {
      nativeCall.reportOutgoing(id, number);
      connectWhenAnswered(id);
    }
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
              name: p.name || p.roleLabel,
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
      if (kind === 'conference' && get().call?.id === c.id) {
        set({ conference: get().conference ?? { startedAt: Date.now(), legs: [] } });
        watchConference(c.id, c.uuid);
      }
    } catch (e) {
      if (kind === 'transfer') transferredTo = null;
      const x = get().consult;
      if (!x || x.startedAt !== startedAt) return;
      const message = e instanceof Error ? e.message : 'Could not reach them';
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
      number: c.number,
      dueAt: new Date(now).toISOString(),
      slaDueAt: new Date(now + 2 * 3600000).toISOString(),
      notes: c.pop.likelyReason ? `Likely reason: ${c.pop.likelyReason}` : '',
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
          name: c.pop.contact?.name ?? c.number,
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
      if (USE_BACKEND && leg && c) void api.liveCalls.conferenceMute(c.uuid, id, !leg.muted).catch(() => undefined);
    },

    removeLeg: (id) => {
      const conf = get().conference;
      if (!conf) return;
      const legs = conf.legs.filter((l) => l.id !== id);
      if (USE_BACKEND) {
        // Out of the conference room on the server. The call stays in the room with whoever is left (the
        // web ends the whole conference instead once one participant is left); the next poll shows it.
        const c = get().call;
        if (c) void api.liveCalls.conferenceKick(c.uuid, id).catch(() => undefined);
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

    startOutbound: async ({ number, contactId = null, source, taskId = null, mode, dialMode = 'Manual' }) => {
      if (get().call) return { ok: false, title: 'Already on a call', message: 'End the current call first.' };
      const wrap = get().wrapUpCallId;
      if (wrap) {
        return { ok: false, title: 'Finish wrap-up first', message: 'Your last call needs a disposition before the next one.' };
      }
      const contact = contactById(contactId) ?? findContactByNumber(number);
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

      let resolved: CallMode;
      if (USE_BACKEND) resolved = 'voip';
      else if (mode) resolved = mode;
      else if (pref === 'auto') {
        const verdict = await runNetworkCheck(data.server.modeThresholds);
        patch({ verdict });
        resolved = verdict.mode;
      } else resolved = pref;

      if (get().call?.id !== id) return { ok: true };
      patch({ mode: resolved, state: 'dialing' });
      let dialed: Awaited<ReturnType<CallAdapter['dial']>>;
      try {
        dialed = await adapterFor(resolved).dial({ number, contactId: contact?.id ?? null });
      } catch (e) {
        clearTimers();
        if (get().call?.id === id) set({ call: null });
        return {
          ok: false,
          title: 'Call could not start',
          // The backend's reason (DNC, outside calling hours, …) reads as it is
          message: e instanceof Error ? (USE_BACKEND ? e.message : `${e.message}. Try again when you have signal.`) : 'Try again.',
        };
      }
      nativeCall.reportOutgoing(id, number);
      if (USE_BACKEND) {
        // The server is dialing the customer now; its INVITE to the webphone may already have come in
        const current = get().call;
        if (current?.id === id) {
          patch({
            uuid: dialed.callId,
            leadId: dialed.leadId ?? current.leadId ?? null,
            campaignId: dialed.campaignId ?? current.campaignId,
            ...(current.state === 'dialing' && { state: 'ringing' as const }),
          });
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
      clearTimers();
      patch({ state: 'dialing' });
      if (USE_BACKEND) {
        // Accept/reject inbound: the webphone already answered, the server connects the customer on Accept
        try {
          await api.liveCalls.acceptInbound(c.uuid, c.agentCallUuid ?? null);
          connectWhenAnswered(c.id);
        } catch (e) {
          patch({ error: e instanceof Error ? e.message : 'Could not take the call' });
        }
        return;
      }
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
        return;
      }
      recordCall(ended, c.connectedAt ? 'answered' : 'no-answer', 'customer');
      set({ call: null, wrapUpCallId: c.id, consult: null, conference: null });
      transferredTo = null;
      reportEnded();
    },

    takeSipCall: (info) => {
      const c = get().call;
      // The call the agent just dialed from here: the server's INVITE carries its customer's number
      if (c) {
        const sameNumber = !!info.customerNumber && digits(c.number).endsWith(digits(info.customerNumber).slice(-10));
        if (c.direction !== 'outbound' || (c.state !== 'dialing' && c.state !== 'ringing') || !sameNumber) return false;
        patch({ leadId: c.leadId ?? info.leadId, campaignId: c.campaignId ?? info.campaignId ?? undefined });
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
