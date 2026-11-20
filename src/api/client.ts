import type {
  Agent,
  AgentStatus,
  CallRecord,
  CaptureField,
  Campaign,
  Contact,
  Disposition,
  DispositionCategory,
  DispositionConfig,
  DispositionField,
  DispositionPayload,
  DispositionPrefs,
  LoginMode,
  ServerConfig,
  Task,
  TimelineEvent,
} from '@/domain/types';
import type { Analytics } from '@/domain/analytics';
import { findPhoneMaskRule, type PhoneMaskRule } from '@/domain/phoneMask';
// The Contacts tab's sample data: the only part of the app not on the server yet
import { buildSeed } from '@/mocks/seed';
import { ApiError } from './errors';
import { DEMO, mobileRequest } from './http';

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
/** The server's password rules, sent with a reset token; the "Create new password" checklist is built from them */
export type PasswordRules = {
  minLength: number;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  symbol: boolean;
  historyDepth: number;
};

/** The web's time limit on the forgot-password requests */
const RESET_TIMEOUT_MS = 20000;

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
  campaigns: { id: string; name: string; dial_type: string; wrap_up_time: number | null; allow_manual_calls?: boolean | null }[];
  pred_groups?: { title: string; campaigns: { id: string; allow_manual_calls?: boolean | null }[] };
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
  requires_callback: boolean | null;
  sub_disposition_required: boolean | null;
  is_do_not_call: boolean | null;
  field_type: string | null;
  // The template's switches, the same on every row
  callback_enabled: boolean | null;
  dnc_enabled: boolean | null;
  additional_notes_enabled: boolean | null;
  additional_notes_required: boolean | null;
  /** Proposed: connected / not_connected / dnc / callback, so only connected outcomes need the required details */
  category?: string | null;
};

const CATEGORIES = new Set<DispositionCategory>(['connected', 'not_connected', 'dnc', 'callback']);

/** The template's switches as the web reads them (readPreferences): nullable, and on when unknown */
function toPrefs(rows: BackendDisposition[]): DispositionPrefs {
  const row = rows[0];
  const notesEnabled = row?.additional_notes_enabled ?? true;
  return {
    callbackEnabled: row?.callback_enabled ?? true,
    dncEnabled: row?.dnc_enabled ?? true,
    notesEnabled,
    notesRequired: notesEnabled && (row?.additional_notes_required ?? false),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Nests the campaign's dispositions by parent, as the web's disposition panel does (buildTree): one whose parent
 * isn't in the list sits at the top. A text or date disposition asks for its value (sent as fieldValue). Whether a
 * sub-disposition must be picked, a callback is required, or it is a do-not-call outcome comes with each one; the
 * template's switches for notes, callbacks and DND come with the whole list (toPrefs).
 */
function toDispositionTree(rows: BackendDisposition[]): Disposition[] {
  const ids = new Set(rows.map((r) => r.disposition_id));
  const parentOf = (r: BackendDisposition) => (r.parent_id && ids.has(r.parent_id) ? r.parent_id : null);
  const build = (parentId: string | null): Disposition[] =>
    rows
      .filter((r) => parentOf(r) === parentId)
      .map((r) => {
        const children = build(r.disposition_id);
        const fields: DispositionField[] = [];
        if (r.field_type === 'text') fields.push({ kind: 'text', key: 'value', label: r.disposition_name, required: true });
        if (r.field_type === 'date') {
          fields.push({ kind: 'datetime', key: 'value', label: r.disposition_name, required: true, createsTask: false });
        }
        return {
          code: r.disposition_id,
          label: r.disposition_name,
          fields,
          subRequired: r.sub_disposition_required ?? true,
          requiresCallback: r.requires_callback ?? false,
          doNotCall: r.is_do_not_call ?? false,
          ...(CATEGORIES.has(r.category as DispositionCategory) && { category: r.category as DispositionCategory }),
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

/** GET / PUT /v1/api/agent/mobile/profile (the web's /api/tenant/profile/me) */
type BackendProfile = {
  fullName?: string | null;
  email?: string | null;
  mobile?: string | null;
  role?: string | null;
  createdAt?: string | null;
  supervisorName?: string | null;
  roleProfile?: { title?: string | null; supervisor_name?: string | null } | null;
};

/** What the profile screen shows, read as the web's profile window reads it */
export type AgentProfile = {
  fullName: string;
  email: string;
  mobile: string;
  /** The web's role label: the role profile's title, else the role, else "Agent" */
  roleLabel: string;
  /** Empty when the server has none */
  supervisor: string;
  createdAt: string | null;
};

function toProfile(p: BackendProfile): AgentProfile {
  return {
    fullName: p.fullName ?? '',
    email: p.email ?? '',
    mobile: p.mobile ?? '',
    roleLabel: p.roleProfile?.title || p.role || 'Agent',
    supervisor: p.supervisorName || p.roleProfile?.supervisor_name || '',
    createdAt: p.createdAt ?? null,
  };
}

/** GET /v1/api/agent/mobile/calls/context (the web's /api/call/call-context) */
type BackendCallContext = {
  exists?: boolean;
  leadId?: string | null;
  listId?: string | null;
  listName?: string | null;
  prefix?: string | null;
  groups?: { fields?: { field_key?: string; field_type?: string; validation_rules?: unknown }[] | null }[];
  values?: Record<string, unknown>;
  /** Proposed: the campaign's "Required details" set up in the admin app (see docs/UX_CHANGES_PLAN.md §2.2) */
  capture_fields?: BackendCaptureField[] | null;
};

/** One required detail as the server sends it */
type BackendCaptureField = {
  key: string;
  label?: string | null;
  type?: string | null;
  required?: boolean | null;
  order?: number | null;
  prompt?: string | null;
  options?: string[] | null;
  allow_declined?: boolean | null;
};

const CAPTURE_TYPES = new Set<CaptureField['type']>(['text', 'email', 'phone', 'dropdown', 'date']);

function toCaptureFields(rows: BackendCaptureField[] | null | undefined): CaptureField[] {
  return (rows ?? [])
    .filter((r) => !!r?.key)
    .map((r, i) => ({
      key: r.key,
      label: r.label?.trim() || r.key,
      type: CAPTURE_TYPES.has(r.type as CaptureField['type']) ? (r.type as CaptureField['type']) : 'text',
      required: r.required === true,
      order: r.order ?? i,
      prompt: r.prompt?.trim() || undefined,
      options: r.options ?? undefined,
      allowDeclined: r.allow_declined !== false,
    }))
    .sort((a, b) => a.order - b.order);
}

/** A lead's values as text, for prefilling the required details */
function toValues(values: Record<string, unknown> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values ?? {})) if (v != null && typeof v !== 'object') out[k] = String(v);
  return out;
}

/** What the app keeps of a call's context */
export type CallContext = {
  /** A lead for this number in the campaign */
  exists: boolean;
  leadId: string | null;
  listId: string | null;
  /** The lead's list, shown on the call screen as the web's header shows it (empty without a lead in the campaign) */
  listName: string;
  prefix: string | null;
  /** The lead's name as the server shows it (masked when the template masks it); empty without a lead */
  name: string;
  maskRule: PhoneMaskRule | null;
  /** The campaign's required details, in order (empty when the campaign has none) */
  captureFields: CaptureField[];
  /** The lead's current values, to prefill them */
  values: Record<string, string>;
};

/** How many days of history the Calls tab loads (the web pages through the same list) */
const HISTORY_DAYS = 30;
/** The server returns at most 100 rows a page; enough pages for a busy month */
const HISTORY_PAGE_SIZE = 100;
const HISTORY_MAX_PAGES = 10;

/**
 * The history's times come formatted in the tenant's time zone as "05-11-2026 12:22" (day-month-year), which
 * the phone can't read as a date, so they become ISO times here, read as the phone's local time (the same zone
 * for an agent working in the tenant's country). Anything else the phone can read is kept as is.
 */
function historyTime(s: string | null): string | null {
  if (!s) return null;
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s.trim());
  if (m) {
    const [, d, mo, y, h, mi, sec = '0'] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)).toISOString();
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function toCallRecord(r: BackendCallRow): CallRecord {
  const startedAt = historyTime(r.initiated_at) ?? historyTime(r.answered_at) ?? historyTime(r.ended_at) ?? new Date(0).toISOString();
  const inbound = (r.call_type ?? '').toUpperCase() === 'INBOUND';
  const answered = !!r.answered_at;
  const dispo = r.disposition;
  const label = dispo && dispo.name !== 'Not Disposed' ? (dispo.path.length ? dispo.path.join(' › ') : dispo.name) : null;
  return {
    id: r.call_uuid,
    uuid: r.call_uuid,
    contactId: null,
    customerName: r.customer_name ?? undefined,
    // The real number to call back on, and the number as the server shows it (masked per campaign)
    number: r.dial_number || r.customer_mobile || '',
    displayNumber: r.customer_mobile || undefined,
    direction: inbound ? 'inbound' : 'outbound',
    outcome: answered ? 'answered' : inbound ? 'missed' : 'no-answer',
    mode: 'voip',
    startedAt,
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
    updatedAt: historyTime(r.ended_at) ?? startedAt,
  };
}

/**
 * GET /v1/api/agent/mobile/callbacks (the web's /api/agent/callbacks): the agent's scheduled callbacks as the web
 * lists them. The number and name come masked per campaign, with the real number apart for dialing; the time
 * comes formatted in the tenant's zone, like the call history's.
 */
type BackendCallback = {
  id: string;
  lead_id: string | null;
  /** As the server shows it (masked when the campaign masks it) */
  phone_number: string | null;
  /** The real number, to call back on */
  dial_number: string | null;
  customer_name: string | null;
  campaign_id: string | null;
  callback_at: string;
  updated_at: string | null;
  created_at: string | null;
  disposition: { name: string; path: string[]; notes: string } | null;
};

function toTask(r: BackendCallback): Task {
  // "05-11-2026 12:22" in the tenant's zone, read like the history's times
  const dueAt = historyTime(r.callback_at) ?? r.callback_at;
  return {
    id: r.id,
    kind: 'callback',
    title: 'Callback',
    contactId: null,
    // The server's placeholder for a callback without a lead isn't a name
    name: r.customer_name && r.customer_name !== 'Unknown' ? r.customer_name : undefined,
    number: r.dial_number || r.phone_number,
    displayNumber: r.phone_number ?? undefined,
    dueAt,
    slaDueAt: null,
    // The note of the lead's last disposition, which the web shows with the callback
    notes: r.disposition?.notes ?? '',
    done: false,
    createdFromCallId: null,
    campaignId: r.campaign_id ?? undefined,
    leadId: r.lead_id,
    updatedAt: r.updated_at ?? r.created_at ?? dueAt,
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

/** The Contacts tab's sample contacts and their timeline, kept in memory (not on the server yet) */
const db = buildSeed();
const idempotency = new Map<string, unknown>();

async function request<T>(fn: () => T): Promise<T> {
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
      // The backend calls the in-app webphone "web" (and the phone line "mobile")
      const res = await mobileRequest<BackendLogin>('POST', '/auth/login', {
        username: loginId,
        password,
        mode: mode === 'webrtc' ? 'web' : 'mobile',
      });
      return { accessToken: res.token, agent: toAgent(res.user) };
    },
    /** Ends the agent's session on the server; needs the token still set */
    async logout() {
      await mobileRequest('POST', '/auth/logout', {});
    },
    /**
     * Forgot password, as the web (services/auth/forgotPasswordService.ts, 20 s limit): a code to the agent's
     * registered email for their email or username, the code exchanged for a reset token, then the new password.
     */
    requestPasswordReset(identifier: string): Promise<{ maskedEmail: string; resendIn: number }> {
      return mobileRequest('POST', '/auth/forgot-password/request-otp', { identifier }, { timeoutMs: RESET_TIMEOUT_MS });
    },
    verifyResetCode(identifier: string, otp: string): Promise<{ resetToken: string; rules?: PasswordRules }> {
      return mobileRequest('POST', '/auth/forgot-password/verify-otp', { identifier, otp }, { timeoutMs: RESET_TIMEOUT_MS });
    },
    resetPassword(resetToken: string, newPassword: string, confirmPassword: string): Promise<{ success: boolean }> {
      return mobileRequest(
        'POST',
        '/auth/forgot-password/reset',
        { resetToken, newPassword, confirmPassword },
        { timeoutMs: RESET_TIMEOUT_MS },
      );
    },
  },

  webphone: {
    config() {
      return mobileRequest<WebphoneConfig>('GET', '/webphone/config');
    },
  },

  campaigns: {
    async list(): Promise<{ items: Campaign[]; defaultId: string | null; allowSelection: boolean }> {
      const res = await mobileRequest<BackendCampaigns>('GET', '/campaigns');
      const items: Campaign[] = res.campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.dial_type === 'MANUAL' ? 'manual' : 'auto',
        listName: '',
        // The web's fallback when the campaign has none
        wrapUpSeconds: c.wrap_up_time || 30,
        dialType: c.dial_type,
        // As the web: manual calls are allowed unless the campaign turned them off
        allowManualCalls: c.allow_manual_calls !== false,
      }));
      const group = res.pred_groups?.campaigns ?? [];
      if (group.length) {
        items.push({
          id: PREDICTIVE_GROUP,
          name: res.pred_groups!.title,
          kind: 'auto',
          listName: '',
          // As the web's top bar: the group allows manual calls when any of its campaigns does
          allowManualCalls: group.some((c) => c.allow_manual_calls !== false),
        });
      }
      return { items, defaultId: res.default_campaign_id, allowSelection: res.allow_campaign_selection !== false };
    },
    /** Makes it the agent's active campaign on the server, which puts them on pause until they go online */
    async select(campaignId: string, opts: { oldCampaignId?: string; initial?: boolean } = {}) {
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
      // "web" is the backend's name for the webphone login mode
      await mobileRequest('POST', '/go-online', { campaignId, mode: 'web' });
    },
    /**
     * As the web's status menu: Online is go-online in the campaign (which also ends a running break) and a
     * break is break/start with the break type's id. There is no "offline" on the server; signing out is the way off.
     */
    async setStatus(status: AgentStatus, breakCode: string | null = null, campaignId?: string) {
      if (status === 'available' && campaignId) await api.agents.goOnline(campaignId);
      if (status === 'break' && breakCode) await mobileRequest('POST', '/break/start', { breakTypeId: breakCode });
      return { status, breakCode, at: now() };
    },
    /** Whether the dialer sends this agent calls by itself */
    async setAutoCall(enabled: boolean) {
      const res = await mobileRequest<{ auto_call_enabled: boolean }>('PATCH', '/auto-call', { auto_call_enabled: enabled });
      return res.auto_call_enabled;
    },
  },

  /** The webphone's calls: the server dials, rings, holds, transfers and conferences them */
  liveCalls: {
    /** The server dials the number and rings this agent's webphone; returns the call's UUID, lead and actual campaign */
    async manual(number: string, campaignId: string, type: 'MANUAL' | 'CALLBACK' = 'MANUAL') {
      const res = await mobileRequest<{ callUuid: string; leadId?: string | null; campaign?: { id: string } }>('POST', '/calls/manual', {
        leadNumber: number,
        campaignId,
        mode: 'web',
        // CALLBACK: a due "For Me" callback, dialed by the app as the web's browser dials it
        type,
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
    /**
     * The customer behind a call (the web's /api/call/call-context): the lead's name (masked by the server when
     * the template masks it), its ids, list and the campaign's prefix, and the phone field's masking rule. It
     * fails for a campaign without a CRM template; the number is then shown as it is, as on the web.
     */
    async context(phone: string, campaignId: string, leadId?: string | null): Promise<CallContext> {
      const q = `phone=${encodeURIComponent(phone)}&campaignId=${encodeURIComponent(campaignId)}${
        leadId ? `&leadId=${encodeURIComponent(leadId)}` : ''
      }`;
      const res = await mobileRequest<BackendCallContext>('GET', `/calls/context?${q}`);
      const name = res.values?.name;
      return {
        exists: res.exists === true,
        leadId: res.leadId ?? null,
        listId: res.listId ?? null,
        listName: res.listName?.trim() || '',
        prefix: res.prefix ?? null,
        name: typeof name === 'string' ? name.trim() : '',
        maskRule: findPhoneMaskRule(res.groups),
        captureFields: toCaptureFields(res.capture_fields),
        values: toValues(res.values),
      };
    },
    /** The webphone's call is over: the server moves the agent to the disposition step */
    ended() {
      return mobileRequest('POST', '/calls/ended', {});
    },
  },

  calls: {
    async list() {
      // The server's own history (agent_call_history, kept across logins) for the last HISTORY_DAYS days, as the
      // web's History page asks for it: fromDate and toDate together (the server ignores one without the other),
      // page by page. It has no delta, so it's the whole window; the store sorts it newest first.
      const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const fromDate = day(new Date(Date.now() - HISTORY_DAYS * 86400000));
      const toDate = day(new Date());
      const rows: BackendCallRow[] = [];
      for (let page = 1; page <= HISTORY_MAX_PAGES; page++) {
        const res = await mobileRequest<{ data: BackendCallRow[]; pagination?: { totalPages?: number } }>(
          'GET',
          `/calls/history?page=${page}&limit=${HISTORY_PAGE_SIZE}&fromDate=${fromDate}&toDate=${toDate}`,
        );
        rows.push(...(res.data ?? []));
        if (page >= (res.pagination?.totalPages ?? 1) || (res.data ?? []).length < HISTORY_PAGE_SIZE) break;
      }
      return { items: rows.map(toCallRecord), cursor: now() };
    },
    /** The call's recording: the public link the server's history carries */
    async recording(_callId: string, recordingUrl?: string | null) {
      if (!recordingUrl) throw new ApiError('validation', 'No recording for this call');
      return { url: recordingUrl, expiresAt: null as string | null };
    },
    /** Saves it on the server, which also makes the agent READY again (the web's /api/leads/disposition) */
    async disposition(body: DispositionPayload) {
      await mobileRequest('POST', '/dispositions', body.server);
      return { saved: true, callId: body.callId };
    },
  },

  dispositions: {
    /** acwSeconds: the campaign's wrap-up time, which the backend sends with the campaign list */
    async config(campaignId: string, acwSeconds = 30): Promise<DispositionConfig> {
      const empty = { campaignId, mandatory: true, acwSeconds, dispositions: [] };
      // An auto-dial group has no dispositions of its own; each call brings its real campaign
      if (!UUID.test(campaignId)) return empty;
      const res = await mobileRequest<{ data: BackendDisposition[] }>(
        'GET',
        `/dispositions?campaignId=${encodeURIComponent(campaignId)}`,
      );
      const rows = res.data ?? [];
      return { ...empty, dispositions: toDispositionTree(rows), prefs: toPrefs(rows) };
    },
  },

  /**
   * The Home dashboard for a date range (YYYY-MM-DD, the tenant's days), from the same two endpoints as the
   * web's agent analytics. AHT is the handling time (talk, hold and wrap) over the answered calls.
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
        aht: { overall: answered ? Math.round((callTime.talk + callTime.hold + callTime.wrap) / answered) : 0 },
      };
    },
  },

  /** The agent's own profile, as the web's profile window reads, saves and changes it (/api/tenant/profile/...) */
  profile: {
    /** campaignId: the agent's campaign, which the server reads the supervisor from */
    async get(campaignId?: string): Promise<AgentProfile> {
      const q = campaignId && UUID.test(campaignId) ? `?campaignId=${encodeURIComponent(campaignId)}` : '';
      const res = await mobileRequest<{ profile: BackendProfile }>('GET', `/profile${q}`);
      return toProfile(res.profile);
    },
    /** Name, email and mobile, as the web sends them (the server saves the name and mobile) */
    async update(body: { fullName: string; email: string; mobile: string }): Promise<AgentProfile> {
      const res = await mobileRequest<{ profile: BackendProfile }>('PUT', '/profile', body);
      return toProfile(res.profile);
    },
    changePassword(body: { currentPassword: string; newPassword: string; confirmPassword: string }) {
      return mobileRequest('POST', '/profile/change-password', body);
    },
  },

  /** A lead's fields for the call history's "Lead details", as the web's "View Lead Profile" loads them */
  leads: {
    /**
     * Proposed (docs/UX_CHANGES_PLAN.md §2.2): saves required details as the agent captures them, one field at a
     * time, so nothing is lost if the call drops. `declined` lists the fields the customer wouldn't share.
     */
    async saveFields(leadId: string, body: { callUuid: string | null; values: Record<string, string | null>; declined: string[] }) {
      await mobileRequest('PATCH', `/leads/${encodeURIComponent(leadId)}/fields`, body);
    },
    async details(leadId: string): Promise<Record<string, unknown> | null> {
      const res = await mobileRequest<{ success?: boolean; data?: Record<string, unknown> | null }>(
        'GET',
        `/lead-details?leadId=${encodeURIComponent(leadId)}`,
      );
      return res.data ?? null;
    },
  },

  /**
   * A callback scheduled from the disposition, like the web's: routeToAgent true routes it back to this agent
   * ("For Me"), false gives it to any available agent in the campaign ("Campaign")
   */
  callbacks: {
    create(body: {
      leadId: string | null;
      campaignId: string;
      name: string;
      phoneNumber: string;
      at: Date;
      remarks: string;
      routeToAgent: boolean;
    }) {
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
        routeToAgent: body.routeToAgent,
      });
    },
  },

  /** "Mark DND" on the disposition: the number onto the campaign's do-not-call list for good, as the web sends it */
  dnc: {
    add(body: { phoneNumber: string; leadName: string; campaignId: string }) {
      return mobileRequest('POST', '/dnc', {
        phone_number: body.phoneNumber,
        lead_name: body.leadName,
        is_permanent: true,
        expiry_days: 0,
        campaign_id: body.campaignId,
      });
    },
  },

  config: {
    async get(): Promise<ServerConfig> {
      // The tenant's break types; a break type's id is what break/start takes
      const res = await mobileRequest<{ breakTypes: BackendBreakType[] }>('GET', '/break-types');
      return {
        breakTypes: (res.breakTypes ?? []).map((b) => ({
          code: b.id,
          label: b.name,
          icon: breakIcon(b.name),
          limitMinutes: b.max_duration_min ?? null,
        })),
      };
    },
  },

  contacts: {
    /**
     * Sample data for now. The backend will serve the agent's leads per campaign as
     * GET /v1/api/agent/mobile/leads?campaignId=… → { listStatus, listName?, leads } (docs/UX_CHANGES_PLAN.md §5.1).
     */
    async list(
      updatedSince?: string,
      campaignId?: string,
    ): Promise<{ listStatus: 'assigned' | 'none' | 'exhausted'; listName?: string; items: Contact[]; cursor: string }> {
      // Demo mode answers it per campaign, so each empty state can be seen (api/demo.ts)
      if (DEMO) {
        const res = await mobileRequest<{ listStatus: 'assigned' | 'none' | 'exhausted'; listName?: string; leads: Contact[] }>(
          'GET',
          `/leads?campaignId=${encodeURIComponent(campaignId ?? '')}`,
        );
        return { listStatus: res.listStatus, listName: res.listName, items: res.leads, cursor: now() };
      }
      return request(() => ({
        listStatus: 'assigned' as const,
        listName: 'Sample leads',
        items: since(db.contacts, updatedSince),
        cursor: now(),
      }));
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
   * The Callbacks tab: the agent's scheduled callbacks, open ones only (overdue included); done means removed as
   * the web does once one is called back, and snoozing reschedules it. One made with the tab's "New" button isn't on
   * the server and stays on this phone.
   */
  tasks: {
    async list() {
      const res = await mobileRequest<{ data: BackendCallback[] }>('GET', '/callbacks?status=SCHEDULED&limit=100');
      return { items: (res.data ?? []).map(toTask), cursor: now() };
    },
    async upsert(_idemKey: string, task: Task) {
      // Made on this phone (the tab's "New" button): not on the server
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
        // No remarks, as the web's reschedule sends none: the callback's own stay as they are on the server
      });
      return task;
    },
  },

  timeline: {
    seed(): TimelineEvent[] {
      return structuredCloneSafe(db.timeline);
    },
  },
};
