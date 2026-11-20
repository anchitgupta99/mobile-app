export type AgentStatus = 'available' | 'break' | 'offline';

export type CallMode = 'voip' | 'bridge';

export type CallDirection = 'inbound' | 'outbound';
export type CallOutcome = 'answered' | 'missed' | 'no-answer' | 'busy' | 'failed';

export type CallState = 'idle' | 'checking' | 'dialing' | 'ringing' | 'connected' | 'held' | 'ended';

export type LoginMode = 'webrtc' | 'mobile';

export type Agent = {
  id: string;
  name: string;
  loginId: string;
  email: string;
  phone: string;
  extension: string;
  team: string;
  campaignId: string;
  campaignName: string;
  verifiedNumber: string | null;
  companyCallerId: string;
  /** Backend: whether the dialer sends this agent calls by itself (users.auto_call_enabled) */
  autoCallEnabled?: boolean;
  /** Backend: whether the agent may switch auto-call themselves (users.can_manage_auto_call) */
  canManageAutoCall?: boolean;
};

export type Contact = {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  city: string;
  timezone: string;
  tags: string[];
  owner: string;
  lastDisposition: string | null;
  lastContactAt: string | null;
  dnc: boolean;
  updatedAt: string;
};

export type DisconnectedBy = 'customer' | 'agent';

export type Campaign = {
  id: string;
  name: string;
  kind: 'auto' | 'manual';
  listName: string;
  /** Backend: the campaign's wrap-up time (campaigns.wrap_up_time), after which the disposition is sent as it is */
  wrapUpSeconds?: number;
  /** Backend: the campaign's dial type as the server has it (MANUAL, PREDICTIVE, PROGRESSIVE, PREVIEW…) */
  dialType?: string;
  /** Backend: whether agents may dial numbers themselves in this campaign (campaigns.allow_manual_calls) */
  allowManualCalls?: boolean;
};

export type CallRecord = {
  id: string;
  contactId: string | null;
  number: string;
  direction: CallDirection;
  outcome: CallOutcome;
  mode: CallMode;
  startedAt: string;
  /** Total time on the line, including ringing */
  durationSec: number;
  /** Connected talk time */
  talkSec?: number;
  disconnectedBy?: DisconnectedBy;
  uuid?: string;
  disposition: string | null;
  notes: string;
  hasRecording: boolean;
  campaignId: string;
  /** Backend: the lead the call was for (X-Lead-ID / manual-call), sent with its disposition */
  leadId?: string | null;
  /** Backend: the lead's name as the server shows it (masked when the campaign masks it) */
  customerName?: string;
  /** Backend: the number as the server shows it, masked per the campaign's CRM template; `number` is the real one */
  displayNumber?: string;
  /** Backend: the lead's list and the campaign's prefix (call context), sent with the disposition */
  listId?: string | null;
  campaignPrefix?: string | null;
  campaignName?: string;
  recordingUrl?: string | null;
  updatedAt: string;
};

export type TaskKind = 'callback' | 'reminder' | 'missed';

export type Task = {
  id: string;
  kind: TaskKind;
  title: string;
  contactId: string | null;
  number: string | null;
  dueAt: string;
  slaDueAt: string | null;
  notes: string;
  done: boolean;
  createdFromCallId: string | null;
  updatedAt: string;
  /** Backend: a scheduled callback's lead name and campaign, from the server */
  name?: string;
  /** Backend: the number as the server shows it, masked per campaign; `number` is the real one, for dialing */
  displayNumber?: string;
  campaignId?: string;
  leadId?: string | null;
};

export type TimelineEvent = {
  id: string;
  contactId: string;
  kind: 'call' | 'note' | 'task' | 'field';
  at: string;
  title: string;
  detail: string;
};

export type DispositionField =
  | { kind: 'datetime'; key: string; label: string; required: boolean; createsTask: boolean }
  | { kind: 'text'; key: string; label: string; required: boolean }
  | { kind: 'select'; key: string; label: string; required: boolean; options: string[] };

export type Disposition = {
  code: string;
  label: string;
  /** Sub-dispositions inherit the tone of their top-level outcome when unset */
  tone?: 'success' | 'error' | 'warning' | 'info' | 'purple' | 'neutral';
  fields: DispositionField[];
  /** When present the agent must keep drilling down; only a node without children can be submitted */
  children?: Disposition[];
  /** Demo: this outcome needs a note */
  requiresNotes?: boolean;
  /** Backend: with children, whether one must be picked (sub_disposition_required); false lets the agent stop here */
  subRequired?: boolean;
  /** Backend: picking it makes a callback required (requires_callback) */
  requiresCallback?: boolean;
  /** Backend: a do-not-call outcome (is_do_not_call); the server adds the number to DNC itself */
  doNotCall?: boolean;
  /**
   * Backend: what kind of outcome it is. Only "connected" outcomes need the call's required details; no answer,
   * wrong number, busy and DNC don't, so agents never have to make data up to get past them. Sub-dispositions
   * inherit their parent's when unset.
   */
  category?: DispositionCategory;
};

export type DispositionCategory = 'connected' | 'not_connected' | 'dnc' | 'callback';

/** The kinds of input a required detail can take */
export type CaptureFieldType = 'text' | 'email' | 'phone' | 'dropdown' | 'date';

/**
 * One detail the admin wants captured on every call in a campaign ("Required details"): set per campaign in the
 * admin app, sent with the call's context, shown to the agent in the call screen's details panel.
 */
export type CaptureField = {
  /** The CRM field it's saved to, e.g. "email_id" */
  key: string;
  label: string;
  type: CaptureFieldType;
  required: boolean;
  order: number;
  /** What the agent is told to ask, e.g. "Ask for their email ID" */
  prompt?: string;
  /** For dropdowns */
  options?: string[];
  /** Offer "Customer declined to share" (counts as captured) */
  allowDeclined: boolean;
};

/** Backend: the disposition template's switches (disposition_categories), as the web reads them */
export type DispositionPrefs = {
  callbackEnabled: boolean;
  dncEnabled: boolean;
  notesEnabled: boolean;
  notesRequired: boolean;
};

export type DispositionConfig = {
  campaignId: string;
  mandatory: boolean;
  acwSeconds: number;
  /** Demo: every disposition needs a note */
  notesRequired?: boolean;
  /** Backend: the template's switches for notes, callbacks and DND */
  prefs?: DispositionPrefs;
  dispositions: Disposition[];
};

export type BreakType = {
  code: string;
  label: string;
  icon: string;
  limitMinutes: number | null;
};

/** What the app loads from the server besides the lists: the tenant's break types */
export type ServerConfig = {
  breakTypes: BreakType[];
};

export type DispositionPayload = {
  callId: string;
  code: string;
  notes: string;
  fields: Record<string, string>;
  submittedAt: string;
  /** Backend: the body for POST /dispositions, built at submit time (the web's /api/leads/disposition body) */
  server?: Record<string, unknown>;
};

/** What a call shows on its screens; the caller's name and masked number come from the server (call context) */
export type ScreenPop = {
  number: string;
  /** The agent's campaign, shown on the incoming call screen */
  queue: string;
};
