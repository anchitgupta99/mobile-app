import type {
  Agent,
  AgentStatus,
  CallMode,
  CallModePreference,
  CallRecord,
  Campaign,
  Contact,
  Disposition,
  DispositionConfig,
  DispositionField,
  DispositionPayload,
  LoginMode,
  NetworkSample,
  ServerConfig,
  Task,
  TimelineEvent,
} from '@/domain/types';
import type { Analytics } from '@/domain/analytics';
import { findPath, pathLabel } from '@/domain/dispositions';
import { agent, buildSeed, campaigns as demoCampaigns, dispositionConfig, serverConfig } from '@/mocks/seed';
import { ApiError } from './errors';
import { mobileRequest, USE_BACKEND } from './http';
import { isOnline, useNetwork } from './network';

export { ApiError };

/** What POST /v1/api/agent/mobile/auth/login returns (the web sign-in's response); only the fields the app reads */
type BackendLogin = {
  token: string;
  user: {
    id: string;
    fullName: string | null;
    username: string;
    email: string | null;
    extension: string | null;
    auto_call_enabled?: boolean | null;
    can_manage_auto_call?: boolean | null;
  };
};

/** GET /v1/api/agent/mobile/webphone/config: what the in-app SIP phone needs to register */
export type WebphoneConfig = {
  extension: string;
  password: string;
  sipDomain: string;
  wsServer: string;
  tenantId: string;
  agentId: string;
};

/** GET /v1/api/agent/mobile/campaigns (the web's /api/tenant/agent/campaigns); only the fields the app reads */
type BackendCampaigns = {
  campaigns: { id: string; name: string; dial_type: string; wrap_up_time: number | null }[];
  pred_groups?: { title: string; campaigns: { id: string }[] };
  default_campaign_id: string | null;
  allow_campaign_selection: boolean | null;
};

/** The agent's auto-dial group: picked like a campaign, the server resolves it to the group's campaigns */
export const PREDICTIVE_GROUP = 'PREDICTIVE_GROUP';

// The campaign is chosen after login, the way the web does it (see useSession.syncCampaign)
function toAgent(user: BackendLogin['user']): Agent {
  return {
    id: user.id,
    name: user.fullName || user.username,
    loginId: user.username,
    email: user.email ?? '',
    phone: '',
    extension: user.extension ?? '',
    team: '',
    campaignId: '',
    campaignName: '',
    verifiedNumber: null,
    companyCallerId: '',
    // The web's defaults: auto-call on unless the admin turned it off, and switchable unless forbidden
    autoCallEnabled: user.auto_call_enabled !== false,
    canManageAutoCall: user.can_manage_auto_call !== false,
  };
}

/** GET /v1/api/agent/mobile/dispositions (the web's /api/crm/dispositions): one flat row per disposition */
type BackendDisposition = {
  disposition_id: string;
  disposition_name: string;
  parent_id: string | null;
  requires_notes: boolean | null;
  requires_callback: boolean;
  field_type: string | null;
  callback_enabled: boolean;
  additional_notes_required: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nests the campaign's dispositions by parent, as the web's disposition panel does. A text or date
 * disposition asks for its value (sent as fieldValue); "requires callback" makes the callback date
 * required, and the template's callback switch offers it on every outcome.
 */
function toDispositionTree(rows: BackendDisposition[]): Disposition[] {
  const build = (parentId: string | null): Disposition[] =>
    rows
      .filter((r) => (r.parent_id ?? null) === parentId)
      .map((r) => {
        const children = build(r.disposition_id);
        const fields: DispositionField[] = [];
        if (r.field_type === 'text') fields.push({ kind: 'text', key: 'value', label: r.disposition_name, required: true });
        if (r.field_type === 'date') {
          fields.push({ kind: 'datetime', key: 'value', label: r.disposition_name, required: true, createsTask: false });
        }
        if (!children.length && (r.requires_callback || r.callback_enabled)) {
          fields.push({
            kind: 'datetime',
            key: 'callback',
            label: r.requires_callback ? 'Callback date & time' : 'Schedule a callback (optional)',
            required: !!r.requires_callback,
            createsTask: true,
          });
        }
        return {
          code: r.disposition_id,
          label: r.disposition_name,
          fields,
          requiresNotes: !!r.requires_notes,
          ...(children.length && { children }),
        };
      });
  return build(null);
}

/** GET /v1/api/agent/mobile/calls/history (the web's /api/agent/call-history): one row per call */
type BackendCallRow = {
  call_uuid: string;
  customer_name: string | null;
  customer_mobile: string | null;
  dial_number: string | null;
  initiated_at: string;
  answered_at: string | null;
  ended_at: string | null;
  talk_duration: number | null;
  duration: number | null;
  call_type: string | null;
  disconnected_by: string | null;
  recording_url: string | null;
  campaign_id: string;
  campaign_name: string | null;
  disposition: { name: string; path: string[]; notes: string } | null;
  leadId: string | null;
};

/** How many days of history the Calls tab loads (the web pages through the same list) */
const HISTORY_DAYS = 30;

function toCallRecord(r: BackendCallRow): CallRecord {
  const inbound = (r.call_type ?? '').toUpperCase() === 'INBOUND';
  const answered = !!r.answered_at;
  const dispo = r.disposition;
  const label = dispo && dispo.name !== 'Not Disposed' ? (dispo.path.length ? dispo.path.join(' › ') : dispo.name) : null;
  return {
    id: r.call_uuid,
    uuid: r.call_uuid,
    contactId: null,
    customerName: r.customer_name ?? undefined,
    number: r.customer_mobile || r.dial_number || '',
    direction: inbound ? 'inbound' : 'outbound',
    outcome: answered ? 'answered' : inbound ? 'missed' : 'no-answer',
    mode: 'voip',
    startedAt: r.initiated_at,
    durationSec: r.duration ?? 0,
    talkSec: r.talk_duration ?? 0,
    disconnectedBy: (r.disconnected_by ?? '').toLowerCase().includes('agent') ? 'agent' : 'customer',
    disposition: label,
    notes: dispo?.notes ?? '',
    hasRecording: !!r.recording_url,
    recordingUrl: r.recording_url,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name ?? undefined,
    leadId: r.leadId,
    fallbackUsed: false,
    updatedAt: r.ended_at ?? r.initiated_at,
  };
}

/** GET /v1/api/agent/mobile/callbacks (the web's /api/agent/callbacks): scheduled_callbacks rows */
type BackendCallback = {
  id: string;
  name: string | null;
  phone_number: string | null;
  callback_at: string;
  remarks: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

function toTask(r: BackendCallback): Task {
  return {
    id: r.id,
    kind: 'callback',
    title: r.remarks?.split('\n')[0]?.slice(0, 60) || 'Callback',
    contactId: null,
    name: r.name ?? undefined,
    number: r.phone_number,
    dueAt: r.callback_at,
    slaDueAt: null,
    notes: r.remarks ?? '',
    done: false,
    createdFromCallId: null,
    campaignId: r.campaign_id ?? undefined,
    leadId: r.lead_id,
    updatedAt: r.updated_at ?? r.created_at ?? r.callback_at,
  };
}

/** GET /v1/api/agent/mobile/analytics and /shift-summary (the web's /api/tenant/agent/…); times are "HH:MM:SS" or "MM:SS" */
type BackendAnalytics = {
  call_summary: {
    inbound: number;
    outbound: number;
    answered_inbound: number;
    answered_outbound: number;
    not_answered_outbound: number;
    abandon_inbound: number;
  };
  call_time: { total_ringing: string; total_talk: string; total_wrap: string; total_hold: string };
};
type BackendShiftSummary = {
  shift_summary: { total_idle_time: string; total_break_time: string; total_call_time: string; total_login_duration: string };
  break_time: { break_details: { name: string; duration: string }[] };
};

const seconds = (hms: string | null | undefined) =>
  (hms ?? '').split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0);

/** GET /v1/api/agent/mobile/calls/agents (the web's /api/agent/search-agents) */
export type BackendAgent = {
  id: string;
  name: string;
  /** The session status: READY, INCALL, DISPO, PAUSED, BREAK, … Only READY can take a transfer */
  status: string;
  extension: string | null;
  campaigns: { id: string; name: string }[];
};

/** The body of /calls/transfer and /calls/conference, as the web sends it */
type ServerTransferBody = {
  callUuid: string;
  /** An agent's extension (isInternal) or an external number */
  phoneNumber: string;
  isInternal: boolean;
  customerNumber: string;
  campaignId?: string;
};

/** GET /v1/api/agent/mobile/calls/conference/participants */
type BackendParticipant = {
  memberId: string | number;
  name: string;
  role: 'customer' | 'primary_agent' | 'conference_agent' | 'external_participant' | '';
  roleLabel: string;
  muted: boolean;
};

/** GET /v1/api/agent/mobile/break-types (the web's /api/break-types) */
type BackendBreakType = { id: string; name: string; code: string | null; max_duration_min: number | null };

function breakIcon(name: string) {
  const n = name.toLowerCase();
  if (/lunch|dinner|meal|food/.test(n)) return 'restaurant';
  if (/tea|coffee|snack/.test(n)) return 'local-cafe';
  if (/bio|wash|rest ?room|toilet/.test(n)) return 'wc';
  if (/meet|training|brief/.test(n)) return 'groups';
  return 'free-breakfast';
}

const db = buildSeed();
const idempotency = new Map<string, unknown>();

function latency() {
  const weak = useNetwork.getState().quality === 'weak';
  return (weak ? 600 : 150) + Math.random() * (weak ? 900 : 250);
}

async function request<T>(fn: () => T): Promise<T> {
  if (!isOnline()) throw new ApiError('offline', 'No network connection');
  await new Promise((r) => setTimeout(r, latency()));
  if (!isOnline()) throw new ApiError('offline', 'No network connection');
  return structuredCloneSafe(fn());
}

function structuredCloneSafe<T>(v: T): T {
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
}

function once<T>(key: string, fn: () => T): T {
  if (idempotency.has(key)) return idempotency.get(key) as T;
  const out = fn();
  idempotency.set(key, out);
  return out;
}

function since<T extends { updatedAt: string }>(rows: T[], updatedSince?: string) {
  return updatedSince ? rows.filter((r) => r.updatedAt > updatedSince) : rows;
}

const now = () => new Date().toISOString();

export const api = {
  auth: {
    async login(loginId: string, password: string, mode: LoginMode) {
      if (USE_BACKEND) {
        // The backend calls the in-app webphone "web" (and the phone line "mobile")
        const res = await mobileRequest<BackendLogin>('POST', '/auth/login', {
          username: loginId,
          password,
          mode: mode === 'webrtc' ? 'web' : 'mobile',
        });
        return { accessToken: res.token, agent: toAgent(res.user) };
      }
      return request(() => {
        if (loginId.length < 3 || password.length < 4) {
          throw new ApiError('unauthorized', 'Login ID or password is incorrect');
        }
        return { accessToken: `at_${Date.now()}`, agent: { ...agent, loginId } };
      });
    },
    /** Ends the agent's session on the server; needs the token still set */
    async logout() {
      if (USE_BACKEND) await mobileRequest('POST', '/auth/logout', {});
    },
    requestPasswordReset(email: string) {
      return request(() => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new ApiError('validation', 'Enter a valid email address');
        return { requestId: `pwr_${Date.now()}` };
      });
    },
    verifyResetCode(requestId: string, code: string) {
      return request(() => {
        if (!/^\d{6}$/.test(code)) throw new ApiError('validation', 'Enter the 6-digit code');
        return { resetToken: `rst_${requestId}` };
      });
    },
    resetPassword(resetToken: string, password: string) {
      return request(() => {
        if (password.length < 8) throw new ApiError('validation', 'Use at least 8 characters');
        return { ok: true, resetToken };
      });
    },
  },

  webphone: {
    config() {
      return mobileRequest<WebphoneConfig>('GET', '/webphone/config');
    },
  },

  devices: {
    register(body: { platform: string; fcmToken: string; voipToken: string | null }) {
      return request(() => ({ deviceId: `dev_${body.platform}_${Date.now().toString(36)}` }));
    },
  },

  campaigns: {
    async list(): Promise<{ items: Campaign[]; defaultId: string | null; allowSelection: boolean }> {
      if (!USE_BACKEND) return { items: demoCampaigns, defaultId: null, allowSelection: true };
      const res = await mobileRequest<BackendCampaigns>('GET', '/campaigns');
      const items: Campaign[] = res.campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.dial_type === 'MANUAL' ? 'manual' : 'auto',
        listName: '',
        // The web's fallback when the campaign has none
        wrapUpSeconds: c.wrap_up_time || 30,
      }));
      if (res.pred_groups?.campaigns.length) items.push({ id: PREDICTIVE_GROUP, name: res.pred_groups.title, kind: 'auto', listName: '' });
      return { items, defaultId: res.default_campaign_id, allowSelection: res.allow_campaign_selection !== false };
    },
    /** Makes it the agent's active campaign on the server, which puts them on pause until they go online */
    async select(campaignId: string, opts: { oldCampaignId?: string; initial?: boolean } = {}) {
      if (!USE_BACKEND) return;
      await mobileRequest('POST', '/campaign', {
        campaign_id: campaignId,
        old_campaign_id: opts.oldCampaignId || undefined,
        hint: opts.initial ? 'initial' : undefined,
      });
    },
  },

  agents: {
    /** READY in the campaign: the server starts routing its calls to this agent's webphone */
    async goOnline(campaignId: string) {
      if (!USE_BACKEND) return;
      // "web" is the backend's name for the webphone login mode
      await mobileRequest('POST', '/go-online', { campaignId, mode: 'web' });
    },
    /**
     * Against the backend, as the web's status menu: Online is go-online in the campaign (which also ends a
     * running break) and a break is break/start with the break type's id. There is no "offline" on the
     * server; signing out is the way off.
     */
    async setStatus(status: AgentStatus, breakCode: string | null = null, campaignId?: string) {
      if (USE_BACKEND) {
        if (status === 'available' && campaignId) await api.agents.goOnline(campaignId);
        if (status === 'break' && breakCode) await mobileRequest('POST', '/break/start', { breakTypeId: breakCode });
        return { status, breakCode, at: now() };
      }
      return request(() => ({ status, breakCode, at: now() }));
    },
    /** Whether the dialer sends this agent calls by itself */
    async setAutoCall(enabled: boolean) {
      const res = await mobileRequest<{ auto_call_enabled: boolean }>('PATCH', '/auto-call', { auto_call_enabled: enabled });
      return res.auto_call_enabled;
    },
    heartbeat(sample: NetworkSample) {
      return request(() => ({ ok: true, sample }));
    },
  },

  /** The webphone's real calls (backend only); the mock `calls` below keeps the demo's history and controls */
  liveCalls: {
    /** The server dials the number and rings this agent's webphone; returns the call's UUID, lead and actual campaign */
    async manual(number: string, campaignId: string) {
      const res = await mobileRequest<{ callUuid: string; leadId?: string | null; campaign?: { id: string } }>('POST', '/calls/manual', {
        leadNumber: number,
        campaignId,
        mode: 'web',
        type: 'MANUAL',
      });
      // An auto-dial group resolves to one of its campaigns on the server
      return { callUuid: res.callUuid, leadId: res.leadId ?? null, campaignId: res.campaign?.id ?? campaignId };
    },
    /** Inbound campaigns with accept/reject: the customer waits on hold until the agent answers */
    acceptInbound(callUuid: string, agentCallUuid: string | null) {
      return mobileRequest('POST', '/calls/inbound/accept', { callUuid, agentCallUuid });
    },
    rejectInbound(callUuid: string, agentCallUuid: string | null) {
      return mobileRequest('POST', '/calls/inbound/reject', { callUuid, agentCallUuid });
    },
    /** Colleagues signed in as agents, READY first (search by name, extension or mobile) */
    async searchAgents(query: string) {
      const res = await mobileRequest<{ agents: BackendAgent[] }>('GET', `/calls/agents?query=${encodeURIComponent(query)}`);
      return res.agents ?? [];
    },
    /** Blind transfer; resolves once the target has answered and has the customer */
    transfer(body: ServerTransferBody) {
      return mobileRequest('POST', '/calls/transfer', body);
    },
    /** Adds the target to the call as a conference; resolves once they have answered and joined */
    conference(body: ServerTransferBody) {
      return mobileRequest('POST', '/calls/conference', body);
    },
    async participants(callUuid: string) {
      const res = await mobileRequest<{ participants: BackendParticipant[] }>(
        'GET',
        `/calls/conference/participants?callUuid=${encodeURIComponent(callUuid)}`,
      );
      return res.participants ?? [];
    },
    conferenceMute(callUuid: string, memberId: string, mute: boolean) {
      return mobileRequest('POST', '/calls/conference/mute', { callUuid, memberId, mute });
    },
    conferenceKick(callUuid: string, memberId: string) {
      return mobileRequest('POST', '/calls/conference/kick', { callUuid, memberId });
    },
    endConference(callUuid: string) {
      return mobileRequest('POST', '/calls/conference/end', { callUuid });
    },
    /** The agent's session status on the server: INCALL once the customer has answered */
    async status() {
      const res = await mobileRequest<{ status: string }>('GET', '/calls/status');
      return res.status;
    },
    hold(callUuid: string, on: boolean) {
      return mobileRequest('POST', '/calls/hold', { uuid: callUuid, status: on ? 'hold' : 'unhold', timestamp: new Date().toISOString() });
    },
    /** The webphone's call is over: the server moves the agent to the disposition step */
    ended() {
      return mobileRequest('POST', '/calls/ended', {});
    },
  },

  calls: {
    async list(updatedSince?: string) {
      if (USE_BACKEND) {
        // The server's own history for the last HISTORY_DAYS days, newest first; it has no delta, so it's the whole window
        const from = new Date(Date.now() - HISTORY_DAYS * 86400000);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fromDate = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
        const res = await mobileRequest<{ data: BackendCallRow[] }>('GET', `/calls/history?page=1&limit=200&fromDate=${fromDate}`);
        return { items: (res.data ?? []).map(toCallRecord), cursor: now() };
      }
      return request(() => ({ items: since(db.calls, updatedSince), cursor: now() }));
    },
    start(body: { number: string; mode: CallModePreference; contactId: string | null; resolvedMode: CallMode }) {
      return request(() => ({ callId: `cl_${Date.now().toString(36)}`, mode: body.resolvedMode }));
    },
    control(callId: string, action: 'hold' | 'unhold' | 'mute' | 'unmute' | 'end' | 'dtmf', value?: string) {
      return request(() => ({ callId, action, value, ok: true }));
    },
    async recording(callId: string, recordingUrl?: string | null) {
      if (USE_BACKEND) {
        if (!recordingUrl) throw new ApiError('validation', 'No recording for this call');
        return { url: recordingUrl, expiresAt: null as string | null };
      }
      return request(() => ({
        url: `https://media.claritel.ai/rec/${callId}.opus?sig=${Math.random().toString(36).slice(2)}&exp=${Date.now() + 300000}`,
        expiresAt: new Date(Date.now() + 300000).toISOString(),
      }));
    },
    async upsert(idemKey: string, call: CallRecord) {
      // The server writes its own call history as calls end
      if (USE_BACKEND) return call;
      return request(() =>
        once(idemKey, () => {
          const i = db.calls.findIndex((c) => c.id === call.id);
          const row = { ...call, updatedAt: now() };
          if (i >= 0) db.calls[i] = row;
          else db.calls.unshift(row);
          return row;
        }),
      );
    },
    async disposition(idemKey: string, body: DispositionPayload) {
      // Saves it on the server, which also makes the agent READY again (the web's /api/leads/disposition)
      if (USE_BACKEND && body.server) {
        await mobileRequest('POST', '/dispositions', body.server);
        return { saved: true, callId: body.callId };
      }
      return request(() =>
        once(idemKey, () => {
          const c = db.calls.find((x) => x.id === body.callId);
          if (c) {
            // Store the readable path like the app does, so a sync never swaps the label for the code
            const path = findPath(dispositionConfig.dispositions, body.code);
            c.disposition = path ? pathLabel(path) : body.code;
            c.notes = body.notes;
            c.updatedAt = now();
          }
          return { saved: true, callId: body.callId };
        }),
      );
    },
  },

  dispositions: {
    /** acwSeconds: the campaign's wrap-up time, which the backend sends with the campaign list */
    async config(campaignId: string, acwSeconds = 30): Promise<DispositionConfig> {
      if (USE_BACKEND) {
        const empty = { campaignId, mandatory: true, acwSeconds, dispositions: [], script: [] };
        // An auto-dial group has no dispositions of its own; each call brings its real campaign
        if (!UUID.test(campaignId)) return empty;
        const res = await mobileRequest<{ data: BackendDisposition[] }>(
          'GET',
          `/dispositions?campaignId=${encodeURIComponent(campaignId)}`,
        );
        const rows = res.data ?? [];
        return { ...empty, dispositions: toDispositionTree(rows), notesRequired: !!rows[0]?.additional_notes_required };
      }
      // One tree for every campaign in the mock; the id is echoed so the app can tell which campaign it holds
      return request(() => ({ ...dispositionConfig, campaignId }));
    },
  },

  /**
   * The Home dashboard for a date range (YYYY-MM-DD, the tenant's days), from the same two endpoints as the
   * web's agent analytics. The server has no per-hour figures, so those charts stay empty; AHT is the
   * handling time (talk, hold and wrap) over the answered calls.
   */
  analytics: {
    async get(fromDate: string, toDate: string): Promise<Analytics> {
      const q = `fromDate=${fromDate}&toDate=${toDate}`;
      const [calls, shift] = await Promise.all([
        mobileRequest<BackendAnalytics>('GET', `/analytics?${q}`),
        mobileRequest<BackendShiftSummary>('GET', `/shift-summary?${q}`),
      ]);
      const cs = calls.call_summary;
      const callTime = {
        ringing: seconds(calls.call_time.total_ringing),
        talk: seconds(calls.call_time.total_talk),
        hold: seconds(calls.call_time.total_hold),
        wrap: seconds(calls.call_time.total_wrap),
      };
      const answered = cs.answered_inbound + cs.answered_outbound;
      return {
        inbound: { total: cs.inbound, answered: cs.answered_inbound, abandoned: cs.abandon_inbound },
        outbound: { total: cs.outbound, answered: cs.answered_outbound, missed: cs.not_answered_outbound },
        shift: {
          login: seconds(shift.shift_summary.total_login_duration),
          idle: seconds(shift.shift_summary.total_idle_time),
          brk: seconds(shift.shift_summary.total_break_time),
          call: seconds(shift.shift_summary.total_call_time),
        },
        callTime,
        breaks: (shift.break_time.break_details ?? []).map((b) => ({ label: b.name, seconds: seconds(b.duration) })),
        hours: [],
        hourly: { outbound: [], inbound: [], busy: [], abandoned: [] },
        aht: {
          inbound: [],
          outbound: [],
          overall: answered ? Math.round((callTime.talk + callTime.hold + callTime.wrap) / answered) : 0,
        },
      };
    },
  },

  /** A callback scheduled from the disposition, like the web's (routed back to this agent) */
  callbacks: {
    create(body: { leadId: string | null; campaignId: string; name: string; phoneNumber: string; at: Date; remarks: string }) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const { at } = body;
      return mobileRequest('POST', '/callbacks', {
        leadId: body.leadId,
        campaignId: body.campaignId,
        name: body.name || 'Unknown',
        phoneNumber: body.phoneNumber,
        date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
        time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
        remarks: body.remarks || undefined,
        routeToAgent: true,
      });
    },
  },

  config: {
    async get(): Promise<ServerConfig> {
      if (USE_BACKEND) {
        // The tenant's break types; a break type's id is what break/start takes
        const res = await mobileRequest<{ breakTypes: BackendBreakType[] }>('GET', '/break-types');
        return {
          ...serverConfig,
          breakTypes: (res.breakTypes ?? []).map((b) => ({
            code: b.id,
            label: b.name,
            icon: breakIcon(b.name),
            limitMinutes: b.max_duration_min ?? null,
          })),
        };
      }
      return request(() => serverConfig);
    },
  },

  contacts: {
    list(updatedSince?: string) {
      return request(() => ({ items: since(db.contacts, updatedSince), cursor: now() }));
    },
    timeline(contactId: string): Promise<TimelineEvent[]> {
      return request(() => db.timeline.filter((t) => t.contactId === contactId));
    },
    update(idemKey: string, id: string, patch: Partial<Contact>) {
      return request(() =>
        once(idemKey, () => {
          const c = db.contacts.find((x) => x.id === id);
          if (!c) throw new ApiError('validation', 'Contact not found');
          Object.assign(c, patch, { updatedAt: now() });
          return c;
        }),
      );
    },
  },

  /**
   * The Callbacks tab. Against the backend these are the agent's scheduled callbacks: open ones only (overdue
   * included), done means removed as the web does once one is called back, and snoozing reschedules it.
   * Reminders made on this phone (say for a missed inbound call) aren't on the server and stay here.
   */
  tasks: {
    async list(updatedSince?: string) {
      if (USE_BACKEND) {
        const res = await mobileRequest<{ data: BackendCallback[] }>('GET', '/callbacks?status=SCHEDULED&limit=100');
        return { items: (res.data ?? []).map(toTask), cursor: now() };
      }
      return request(() => ({ items: since(db.tasks, updatedSince), cursor: now() }));
    },
    async upsert(idemKey: string, task: Task) {
      if (USE_BACKEND) {
        if (!UUID.test(task.id)) return task;
        if (task.done) {
          await mobileRequest('DELETE', `/callbacks/${task.id}`);
          return task;
        }
        const at = new Date(task.dueAt);
        const pad = (n: number) => String(n).padStart(2, '0');
        await mobileRequest('PUT', `/callbacks/${task.id}`, {
          date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`,
          time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
          remarks: task.notes || undefined,
        });
        return task;
      }
      return request(() =>
        once(idemKey, () => {
          const i = db.tasks.findIndex((t) => t.id === task.id);
          const row = { ...task, updatedAt: now() };
          if (i >= 0) db.tasks[i] = row;
          else db.tasks.unshift(row);
          return row;
        }),
      );
    },
  },

  timeline: {
    seed(): TimelineEvent[] {
      return structuredCloneSafe(db.timeline);
    },
  },
};
