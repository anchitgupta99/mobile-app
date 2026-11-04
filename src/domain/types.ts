export type AgentStatus = 'available' | 'break' | 'offline';

export type CallMode = 'voip' | 'bridge';
export type CallModePreference = 'auto' | 'voip' | 'bridge';
export type RingDevice = 'auto' | 'app' | 'phone';

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
  /** Backend: from the server's call history, for calls whose lead isn't a contact in the app */
  customerName?: string;
  campaignName?: string;
  recordingUrl?: string | null;
  fallbackUsed: boolean;
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
  /** Backend: this outcome needs a note (dispositions.requires_notes) */
  requiresNotes?: boolean;
};

export type DispositionConfig = {
  campaignId: string;
  mandatory: boolean;
  acwSeconds: number;
  /** Backend: every disposition in this campaign needs a note (additional_notes_required) */
  notesRequired?: boolean;
  dispositions: Disposition[];
  script: string[];
};

export type BreakType = {
  code: string;
  label: string;
  icon: string;
  limitMinutes: number | null;
};

export type ServerConfig = {
  breakTypes: BreakType[];
  modeThresholds: { maxLatencyMs: number; maxLossPct: number; maxJitterMs: number };
  inboundFallbackSeconds: number;
  featureFlags: Record<string, boolean>;
};

export type NetworkSample = {
  type: 'wifi' | '4g' | '3g' | 'none';
  latencyMs: number;
  lossPct: number;
  jitterMs: number;
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

export type ScreenPop = {
  contact: Contact | null;
  number: string;
  openTasks: Task[];
  likelyReason: string;
  lastDisposition: string | null;
  queue: string;
};
