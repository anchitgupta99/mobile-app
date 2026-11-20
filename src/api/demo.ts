import { buildSeed } from '@/mocks/seed';

/**
 * Demo backend: answers the app's server calls on the phone itself, so the app can be signed into and clicked
 * through with no server (EXPO_PUBLIC_API_URL unset). Any login ID and password work. Calls "connect" a few
 * seconds after dialling; there's no audio. Everything resets when the app reloads.
 */

const seed = buildSeed();
const people = seed.contacts;
const LIST = 'Sample leads';

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

const CAMPAIGNS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Home Loans', dial_type: 'MANUAL', wrap_up_time: 60, allow_manual_calls: true },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Card Renewals',
    dial_type: 'PREDICTIVE',
    wrap_up_time: 45,
    allow_manual_calls: false,
  },
  { id: '33333333-3333-4333-8333-333333333333', name: 'Customer Support', dial_type: 'MANUAL', wrap_up_time: 60, allow_manual_calls: true },
];

const BREAK_TYPES = [
  { id: 'brk-lunch', name: 'Lunch Break', code: 'lunch', max_duration_min: 30 },
  { id: 'brk-tea', name: 'Tea Break', code: 'tea', max_duration_min: 15 },
  { id: 'brk-bio', name: 'Bio Break', code: 'bio', max_duration_min: 10 },
  { id: 'brk-meeting', name: 'Meeting Break', code: 'meeting', max_duration_min: null },
];

const prefs = { callback_enabled: true, dnc_enabled: true, additional_notes_enabled: true, additional_notes_required: false };
const dispo = (id: string, name: string, parent: string | null, extra: Record<string, unknown> = {}) => ({
  disposition_id: id,
  disposition_name: name,
  parent_id: parent,
  requires_callback: false,
  sub_disposition_required: true,
  is_do_not_call: false,
  field_type: null,
  ...prefs,
  ...extra,
});
/**
 * What the admin would set per campaign under "Required details" (there's no admin app here, so this stands in).
 * Card Renewals has none, to show a call without the panel.
 */
const CAPTURE_FIELDS = [
  { key: 'name', label: 'Name', type: 'text', required: true, order: 1, prompt: 'Confirm the customer’s full name' },
  { key: 'email_id', label: 'Email', type: 'email', required: true, order: 2, prompt: 'Ask for their email ID' },
  {
    key: 'alternate_number',
    label: 'Alternate number',
    type: 'phone',
    required: false,
    order: 3,
    prompt: 'Ask for another number to reach them on',
  },
  {
    key: 'city',
    label: 'City',
    type: 'dropdown',
    required: false,
    order: 4,
    prompt: 'Which city are they in?',
    options: ['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Chennai', 'Other'],
  },
];
const captureFieldsFor = (campaignId: string | null) => (campaignId === CAMPAIGNS[1].id ? [] : CAPTURE_FIELDS);
/** Saved details per lead, so a later call to the same lead comes prefilled */
const leadValues = new Map<string, Record<string, string | null>>();

const DISPOSITIONS = [
  dispo('d-connected', 'Connected', null, { category: 'connected' }),
  dispo('d-interested', 'Interested', 'd-connected'),
  dispo('d-not-interested', 'Not interested', 'd-connected'),
  dispo('d-callback', 'Call back later', 'd-connected', { requires_callback: true }),
  dispo('d-not-connected', 'Not connected', null, { category: 'not_connected' }),
  dispo('d-no-answer', 'No answer', 'd-not-connected'),
  dispo('d-busy', 'Busy', 'd-not-connected'),
  dispo('d-wrong', 'Wrong number', 'd-not-connected'),
  dispo('d-dnc', 'Do not call', null, { is_do_not_call: true, sub_disposition_required: false, category: 'dnc' }),
];

const pad = (n: number) => String(n).padStart(2, '0');
const hms = (sec: number) => `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}`;
const nameFor = (number: string) => {
  const digits = number.replace(/\D/g, '').slice(-10);
  return people.find((p) => p.phone.replace(/\D/g, '').slice(-10) === digits)?.name ?? null;
};

const history = people.slice(0, 10).map((p, i) => {
  const start = Date.now() - (i * 5 + 1) * 3600_000;
  const answered = i % 3 !== 2;
  const talk = answered ? 60 + i * 37 : 0;
  return {
    call_uuid: uuid(),
    customer_name: p.name,
    customer_mobile: p.phone,
    dial_number: p.phone,
    initiated_at: new Date(start).toISOString(),
    answered_at: answered ? new Date(start + 8000).toISOString() : null,
    ended_at: new Date(start + 8000 + talk * 1000).toISOString(),
    talk_duration: talk,
    duration: talk + 8,
    call_type: i % 4 === 1 ? 'INBOUND' : 'OUTBOUND',
    disconnected_by: i % 2 ? 'agent' : 'customer',
    recording_url: null,
    campaign_id: CAMPAIGNS[0].id,
    campaign_name: CAMPAIGNS[0].name,
    disposition: answered
      ? { name: i % 2 ? 'Interested' : 'Not interested', path: ['Connected', i % 2 ? 'Interested' : 'Not interested'], notes: '' }
      : { name: 'No answer', path: ['Not connected', 'No answer'], notes: '' },
    leadId: `lead-${i}`,
  };
});

type DemoCallback = {
  id: string;
  lead_id: string | null;
  phone_number: string;
  dial_number: string;
  customer_name: string;
  campaign_id: string;
  callback_at: string;
  updated_at: string;
  created_at: string;
  disposition: null;
};
const callbackAt = (date: string, time: string) => new Date(`${date}T${time}:00`).toISOString();
let callbacks: DemoCallback[] = people.slice(10, 13).map((p, i) => ({
  id: uuid(),
  lead_id: `lead-${10 + i}`,
  phone_number: p.phone,
  dial_number: p.phone,
  customer_name: p.name,
  campaign_id: CAMPAIGNS[0].id,
  callback_at: new Date(Date.now() + (i - 1) * 2 * 3600_000).toISOString(),
  updated_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  disposition: null,
}));

let profile = {
  fullName: 'Demo Agent',
  email: 'agent@example.com',
  mobile: '',
  role: 'Agent',
  supervisorName: 'Demo Supervisor',
  createdAt: '2026-01-05T09:00:00Z',
};
let autoCall = true;
/** The live demo call: answers 4 s after dialling */
let dialledAt: number | null = null;

const ANSWER_AFTER_MS = 4000;
const LATENCY_MS = 250;

export async function demoRequest(method: string, fullPath: string, body?: unknown): Promise<unknown> {
  await new Promise((r) => setTimeout(r, LATENCY_MS));
  const [path, query = ''] = fullPath.split('?');
  const q = new URLSearchParams(query);
  const b = (body ?? {}) as Record<string, unknown>;
  const route = `${method} ${path}`;

  switch (route) {
    case 'POST /auth/login': {
      const username = String(b.username ?? b.loginId ?? b.identifier ?? 'demo');
      profile = { ...profile, fullName: username ? `${username} (demo)` : 'Demo Agent' };
      return {
        token: `demo-${uuid()}`,
        user: {
          id: 'demo-agent',
          fullName: profile.fullName,
          username,
          email: profile.email,
          extension: '1001',
          auto_call_enabled: autoCall,
        },
      };
    }
    case 'GET /webphone/config':
      throw new Error('The webphone is off in demo mode');
    case 'GET /campaigns':
      return { campaigns: CAMPAIGNS, default_campaign_id: CAMPAIGNS[0].id, allow_campaign_selection: true };
    case 'PATCH /auto-call':
      autoCall = b.auto_call_enabled === true;
      return { auto_call_enabled: autoCall };
    case 'POST /calls/manual':
      dialledAt = Date.now();
      return { callUuid: uuid(), leadId: null, campaign: { id: String(b.campaignId ?? CAMPAIGNS[0].id) } };
    case 'GET /calls/status':
      if (dialledAt && Date.now() - dialledAt >= ANSWER_AFTER_MS) {
        dialledAt = null;
        return { status: 'INCALL' };
      }
      return { status: dialledAt ? 'RINGING' : 'READY' };
    case 'POST /calls/ended':
      dialledAt = null;
      return {};
    case 'GET /calls/context': {
      const phone = q.get('phone') ?? q.get('phoneNumber') ?? '';
      const name = nameFor(phone);
      // Every number gets a lead here, so details save as they're captured
      const leadId = `lead-${phone.replace(/\D/g, '').slice(-10) || 'new'}`;
      const saved = leadValues.get(leadId) ?? {};
      return {
        exists: !!name,
        leadId,
        listId: 'list-demo',
        listName: LIST,
        prefix: null,
        groups: [],
        values: { ...(name ? { name } : {}), ...saved },
        capture_fields: captureFieldsFor(q.get('campaignId')),
      };
    }
    case 'GET /calls/history':
      return { data: history, pagination: { totalPages: 1 } };
    case 'GET /calls/agents':
      return {
        agents: [
          {
            id: 'ag-2',
            name: 'Priya Nair',
            status: 'READY',
            extension: '1002',
            campaigns: [{ id: CAMPAIGNS[0].id, name: CAMPAIGNS[0].name }],
          },
          {
            id: 'ag-3',
            name: 'Arjun Mehta',
            status: 'INCALL',
            extension: '1003',
            campaigns: [{ id: CAMPAIGNS[0].id, name: CAMPAIGNS[0].name }],
          },
        ],
      };
    case 'GET /calls/conference/participants':
      return { participants: [] };
    case 'GET /dispositions':
      return { data: DISPOSITIONS };
    case 'GET /analytics':
      return {
        call_summary: {
          inbound: 6,
          outbound: 24,
          answered_inbound: 5,
          answered_outbound: 15,
          not_answered_outbound: 9,
          abandon_inbound: 1,
        },
        call_time: { total_ringing: '00:06:40', total_talk: '01:42:15', total_wrap: '00:18:30', total_hold: '00:04:05' },
      };
    case 'GET /shift-summary':
      return {
        shift_summary: {
          total_idle_time: '00:35:00',
          total_break_time: hms(2700),
          total_call_time: '01:52:55',
          total_login_duration: '04:10:00',
        },
        break_time: {
          break_details: [
            { name: 'Lunch Break', duration: '00:30:00' },
            { name: 'Tea Break', duration: '00:15:00' },
          ],
        },
      };
    case 'GET /profile':
      return { profile };
    case 'PUT /profile':
      profile = { ...profile, ...(b as Partial<typeof profile>) };
      return { profile };
    case 'GET /lead-details': {
      const i = Number((q.get('leadId') ?? '').replace('lead-', ''));
      const p = people[Number.isFinite(i) ? i : 0] ?? people[0];
      return { success: true, data: { name: p.name, mobile: p.phone, email_id: p.email, city: p.city, company: p.company } };
    }
    case 'GET /callbacks':
      return { data: callbacks };
    case 'POST /callbacks': {
      const phone = String(b.phoneNumber ?? '');
      callbacks = [
        ...callbacks,
        {
          id: uuid(),
          lead_id: (b.leadId as string | null) ?? null,
          phone_number: phone,
          dial_number: phone,
          customer_name: String(b.name ?? 'Unknown'),
          campaign_id: String(b.campaignId ?? CAMPAIGNS[0].id),
          callback_at: callbackAt(String(b.date), String(b.time)),
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
          disposition: null,
        },
      ];
      return { success: true };
    }
    case 'GET /leads': {
      // One campaign per Contacts state: Home Loans has a lead list, Customer Support has none assigned, and
      // everyone in Card Renewals' list has been called
      const campaignId = q.get('campaignId');
      if (campaignId === CAMPAIGNS[2].id) return { listStatus: 'none', leads: [] };
      if (campaignId === CAMPAIGNS[1].id) return { listStatus: 'exhausted', listName: 'Renewals · November', leads: [] };
      return { listStatus: 'assigned', listName: LIST, leads: people };
    }
    case 'GET /break-types':
      return { breakTypes: BREAK_TYPES };
  }

  // Required details, saved one field at a time during the call
  const lead = /^\/leads\/([^/]+)\/fields$/.exec(path);
  if (lead && method === 'PATCH') {
    const id = decodeURIComponent(lead[1]);
    leadValues.set(id, { ...leadValues.get(id), ...((b.values as Record<string, string | null>) ?? {}) });
    return { success: true };
  }

  // Callbacks by id: reschedule (PUT) and done (DELETE)
  const cb = /^\/callbacks\/([^/]+)$/.exec(path);
  if (cb) {
    if (method === 'DELETE') callbacks = callbacks.filter((x) => x.id !== cb[1]);
    if (method === 'PUT') {
      callbacks = callbacks.map((x) =>
        x.id === cb[1] ? { ...x, callback_at: callbackAt(String(b.date), String(b.time)), updated_at: new Date().toISOString() } : x,
      );
    }
    return { success: true };
  }

  // Everything else (logout, campaign switch, go online, breaks, hold, transfer, dispositions, DNC…) just succeeds
  return { success: true };
}
