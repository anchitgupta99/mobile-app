import type { Agent, CallRecord, Campaign, Contact, DispositionConfig, ServerConfig, Task, TimelineEvent } from '@/domain/types';

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const agent: Agent = {
  id: 'ag_1',
  name: 'Priya Sharma',
  loginId: 'priya.sharma',
  email: 'priya.sharma@claritel.ai',
  phone: '+919820012210',
  extension: 'BF68C2S5EPTC3Q',
  team: 'Field Sales · West',
  campaignId: 'cmp_home_loans',
  campaignName: 'Home Loans Q4',
  verifiedNumber: '+919820012210',
  companyCallerId: '+912261234500',
};

export const campaigns: Campaign[] = [
  { id: 'cmp_home_loans', name: 'Home Loans Q4', kind: 'auto', listName: 'List 2' },
  { id: 'cmp_lap', name: 'Loan Against Property', kind: 'auto', listName: 'List 1' },
  { id: 'cmp_renewals', name: 'Renewals · West', kind: 'manual', listName: 'Renewals Oct' },
  { id: 'cmp_inbound', name: 'Inbound Support', kind: 'manual', listName: 'Inbound' },
];

/** Colleagues that can take a transfer or join a conference */
export type Colleague = { id: string; name: string; team: string; ext: string; presence: 'available' | 'away' | 'busy' };

export const colleagues: Colleague[] = [
  { id: 'ag_devin', name: 'Devin Alonzo', team: 'Support', ext: 'x2041', presence: 'available' },
  { id: 'ag_priya', name: 'Priya Raman', team: 'Sales', ext: 'x2088', presence: 'available' },
  { id: 'ag_marcus', name: 'Marcus Webb', team: 'Billing', ext: 'x2130', presence: 'away' },
  { id: 'ag_sana', name: 'Sana Qureshi', team: 'Credit', ext: 'x2154', presence: 'busy' },
  { id: 'ag_leo', name: 'Leo Fernandes', team: 'Support', ext: 'x2077', presence: 'available' },
];

const people: [string, string, string, string][] = [
  ['Rohan Mehta', 'Mehta Builders', 'Mumbai', '+919821045678'],
  ['Ananya Iyer', 'Iyer & Co', 'Pune', '+919845011223'],
  ['Vikram Singh', 'Singh Logistics', 'Delhi', '+919811234987'],
  ['Kavya Reddy', 'Reddy Textiles', 'Hyderabad', '+919849076543'],
  ['Arjun Nair', 'Nair Foods', 'Kochi', '+919847012876'],
  ['Meera Joshi', 'Joshi Pharma', 'Ahmedabad', '+919824056731'],
  ['Siddharth Rao', 'Rao Motors', 'Bengaluru', '+919880045612'],
  ['Neha Kapoor', 'Kapoor Interiors', 'Delhi', '+919810098765'],
  ['Aditya Kulkarni', 'Kulkarni Agro', 'Nashik', '+919822067894'],
  ['Ishita Banerjee', 'Banerjee Media', 'Kolkata', '+919830054321'],
  ['Karan Malhotra', 'Malhotra Steel', 'Ludhiana', '+919814023456'],
  ['Pooja Desai', 'Desai Jewellers', 'Surat', '+919825078123'],
  ['Rahul Verma', 'Verma Electricals', 'Lucknow', '+919839012345'],
  ['Sneha Pillai', 'Pillai Exports', 'Chennai', '+919840067812'],
  ['Amit Chatterjee', 'Chatterjee Tea', 'Siliguri', '+919832011987'],
  ['Divya Menon', 'Menon Clinics', 'Thrissur', '+919846034567'],
];

const dispoLabels = ['Interested', 'Callback', 'Not interested', 'Sale', 'Wrong number', 'No answer'];

export function buildSeed(now = Date.now()) {
  const contacts: Contact[] = people.map(([name, company, city, phone], i) => ({
    id: `ct_${i + 1}`,
    name,
    company,
    phone,
    email: `${name.split(' ')[0].toLowerCase()}@${company.split(' ')[0].toLowerCase()}.in`,
    city,
    timezone: 'Asia/Kolkata',
    tags: i % 3 === 0 ? ['Hot lead'] : i % 4 === 0 ? ['Renewal'] : [],
    owner: agent.name,
    lastDisposition: i < 10 ? dispoLabels[i % dispoLabels.length] : null,
    lastContactAt: i < 10 ? new Date(now - (i + 1) * 5 * HOUR).toISOString() : null,
    dnc: i === 12,
    updatedAt: new Date(now - i * HOUR).toISOString(),
  }));

  const calls: CallRecord[] = [];
  for (let i = 0; i < 22; i++) {
    const c = contacts[i % contacts.length];
    const missed = i === 1 || i === 6 || i === 13;
    const inbound = missed || i % 3 === 0;
    const notDispositioned = i === 2 || i === 9;
    const answered = !missed && i % 7 !== 5;
    const talk = missed || !answered ? 0 : 45 + ((i * 97) % 520);
    calls.push({
      id: `cl_${i + 1}`,
      contactId: i === 17 ? null : c.id,
      number: i === 17 ? '+919999012345' : c.phone,
      direction: inbound ? 'inbound' : 'outbound',
      outcome: missed ? 'missed' : answered ? 'answered' : 'no-answer',
      mode: i % 4 === 1 ? 'bridge' : 'voip',
      startedAt: new Date(now - (i * 2.3 + 0.4) * HOUR).toISOString(),
      durationSec: talk ? talk + 8 + (i % 5) * 3 : missed ? 0 : 20 + (i % 4) * 6,
      talkSec: talk,
      disconnectedBy: i % 3 === 1 ? 'agent' : 'customer',
      uuid: `c0a8${(4096 + i * 977).toString(16)}-5f2e-4b7a-9${(i * 31).toString(16).padStart(3, '0')}-${(0xa1b2c3 + i * 7919).toString(16)}e4d2`,
      disposition: missed || notDispositioned ? null : answered ? dispoLabels[i % 4] : 'No answer',
      notes: answered && !notDispositioned && i % 2 === 0 ? 'Asked for rate sheet on WhatsApp. Spouse is co-applicant.' : '',
      hasRecording: answered && !missed,
      campaignId: i % 5 === 3 ? 'cmp_lap' : agent.campaignId,
      fallbackUsed: i === 5,
      updatedAt: new Date(now - i * HOUR).toISOString(),
    });
  }

  const tasks: Task[] = [
    {
      id: 'tk_1',
      kind: 'missed',
      title: 'Call back missed call',
      contactId: contacts[1].id,
      number: contacts[1].phone,
      dueAt: new Date(now - 2.7 * HOUR).toISOString(),
      slaDueAt: new Date(now - 0.7 * HOUR).toISOString(),
      notes: '',
      done: false,
      createdFromCallId: 'cl_2',
      updatedAt: new Date(now - 2.7 * HOUR).toISOString(),
    },
    {
      id: 'tk_2',
      kind: 'callback',
      title: 'Share revised EMI options',
      contactId: contacts[0].id,
      number: contacts[0].phone,
      dueAt: new Date(now - 25 * MIN).toISOString(),
      slaDueAt: null,
      notes: 'Wants 20-year tenure. Compare with SBI offer he mentioned.',
      done: false,
      createdFromCallId: 'cl_1',
      updatedAt: new Date(now - DAY).toISOString(),
    },
    {
      id: 'tk_3',
      kind: 'callback',
      title: 'Confirm document pickup',
      contactId: contacts[3].id,
      number: contacts[3].phone,
      dueAt: new Date(now + 40 * MIN).toISOString(),
      slaDueAt: null,
      notes: 'Salary slips (3 months) and Form 16.',
      done: false,
      createdFromCallId: null,
      updatedAt: new Date(now - 3 * HOUR).toISOString(),
    },
    {
      id: 'tk_4',
      kind: 'missed',
      title: 'Call back missed call',
      contactId: contacts[6].id,
      number: contacts[6].phone,
      dueAt: new Date(now - 14 * HOUR).toISOString(),
      slaDueAt: new Date(now + 1.5 * HOUR).toISOString(),
      notes: '',
      done: false,
      createdFromCallId: 'cl_7',
      updatedAt: new Date(now - 14 * HOUR).toISOString(),
    },
    {
      id: 'tk_5',
      kind: 'reminder',
      title: 'Send sanction letter template',
      contactId: contacts[5].id,
      number: contacts[5].phone,
      dueAt: new Date(now + 3 * HOUR).toISOString(),
      slaDueAt: null,
      notes: '',
      done: false,
      createdFromCallId: null,
      updatedAt: new Date(now - 5 * HOUR).toISOString(),
    },
    {
      id: 'tk_6',
      kind: 'callback',
      title: 'Follow up on site visit',
      contactId: contacts[8].id,
      number: contacts[8].phone,
      dueAt: new Date(now + 26 * HOUR).toISOString(),
      slaDueAt: null,
      notes: 'Visit planned for Saturday morning.',
      done: false,
      createdFromCallId: null,
      updatedAt: new Date(now - 6 * HOUR).toISOString(),
    },
    {
      id: 'tk_7',
      kind: 'callback',
      title: 'Discuss balance transfer',
      contactId: contacts[10].id,
      number: contacts[10].phone,
      dueAt: new Date(now + 2 * DAY).toISOString(),
      slaDueAt: null,
      notes: '',
      done: false,
      createdFromCallId: null,
      updatedAt: new Date(now - 6 * HOUR).toISOString(),
    },
    {
      id: 'tk_8',
      kind: 'reminder',
      title: 'Collect cheque',
      contactId: contacts[4].id,
      number: contacts[4].phone,
      dueAt: new Date(now - 5 * HOUR).toISOString(),
      slaDueAt: null,
      notes: '',
      done: true,
      createdFromCallId: null,
      updatedAt: new Date(now - 4 * HOUR).toISOString(),
    },
  ];

  const timeline: TimelineEvent[] = [];
  contacts.forEach((c) => {
    calls
      .filter((cl) => cl.contactId === c.id)
      .forEach((cl) =>
        timeline.push({
          id: `tl_${cl.id}`,
          contactId: c.id,
          kind: 'call',
          at: cl.startedAt,
          title: `${cl.direction === 'inbound' ? 'Inbound' : 'Outbound'} call · ${cl.outcome === 'answered' ? (cl.disposition ?? 'Not dispositioned') : cl.outcome === 'missed' ? 'Missed' : 'No answer'}`,
          detail: cl.notes,
        }),
      );
    tasks
      .filter((t) => t.contactId === c.id)
      .forEach((t) =>
        timeline.push({
          id: `tl_${t.id}`,
          contactId: c.id,
          kind: 'task',
          at: t.updatedAt,
          title: `Task created · ${t.title}`,
          detail: t.notes,
        }),
      );
    timeline.push({
      id: `tl_f_${c.id}`,
      contactId: c.id,
      kind: 'field',
      at: new Date(now - 4 * DAY).toISOString(),
      title: 'Lead assigned',
      detail: `Owner set to ${agent.name}`,
    });
  });

  return { contacts, calls, tasks, timeline };
}

export const dispositionConfig: DispositionConfig = {
  campaignId: agent.campaignId,
  mandatory: true,
  acwSeconds: 30,
  dispositions: [
    {
      code: 'interested',
      label: 'Interested',
      tone: 'success',
      fields: [],
      children: [
        { code: 'int_quote', label: 'Wants a quote', fields: [] },
        { code: 'int_docs', label: 'Sent document list', fields: [] },
        {
          code: 'int_visit',
          label: 'Site visit planned',
          fields: [{ kind: 'datetime', key: 'callbackAt', label: 'Visit at', required: true, createsTask: true }],
        },
      ],
    },
    {
      code: 'callback',
      label: 'Callback',
      tone: 'info',
      fields: [{ kind: 'datetime', key: 'callbackAt', label: 'Call back at', required: true, createsTask: true }],
    },
    {
      code: 'sale',
      label: 'Sale',
      tone: 'purple',
      fields: [{ kind: 'text', key: 'amount', label: 'Loan amount (₹)', required: true }],
      children: [
        { code: 'sale_home', label: 'Home loan', fields: [] },
        { code: 'sale_lap', label: 'Loan against property', fields: [] },
        {
          code: 'sale_bt',
          label: 'Balance transfer',
          fields: [],
          children: [
            { code: 'sale_bt_only', label: 'Transfer only', fields: [] },
            { code: 'sale_bt_topup', label: 'With top-up', fields: [] },
          ],
        },
      ],
    },
    {
      code: 'not_interested',
      label: 'Not interested',
      tone: 'neutral',
      fields: [],
      children: [
        { code: 'ni_rate', label: 'Rate too high', fields: [] },
        {
          code: 'ni_has_loan',
          label: 'Already has loan',
          fields: [],
          children: [
            { code: 'ni_has_bank', label: 'From a bank', fields: [] },
            { code: 'ni_has_nbfc', label: 'From an NBFC', fields: [] },
          ],
        },
        { code: 'ni_eligible', label: 'Not eligible', fields: [] },
        {
          code: 'ni_other',
          label: 'Other reason',
          fields: [{ kind: 'text', key: 'reason', label: 'Reason', required: true }],
        },
      ],
    },
    { code: 'no_answer', label: 'No answer', tone: 'warning', fields: [] },
    { code: 'busy', label: 'Busy, call later', tone: 'warning', fields: [] },
    { code: 'wrong_number', label: 'Wrong number', tone: 'error', fields: [] },
    {
      code: 'complaint',
      label: 'Complaint',
      tone: 'error',
      fields: [],
      children: [
        { code: 'cmp_service', label: 'Service', fields: [] },
        { code: 'cmp_billing', label: 'Billing', fields: [] },
        { code: 'cmp_agent', label: 'Earlier agent', fields: [] },
      ],
    },
    { code: 'language', label: 'Language barrier', tone: 'neutral', fields: [] },
    { code: 'dnc', label: 'Do not call', tone: 'error', fields: [] },
  ],
  script: [
    'Greet by name and introduce yourself from Claritel Home Loans.',
    'This call is recorded for quality. Is now a good time?',
    'Confirm loan amount, tenure and property city.',
    'Check income type: salaried or self-employed.',
    'Agree the next step and a callback time.',
  ],
};

export const serverConfig: ServerConfig = {
  breakTypes: [
    { code: 'bio', label: 'Bio Break', icon: 'wc', limitMinutes: 10 },
    { code: 'meeting', label: 'Meeting Break', icon: 'groups', limitMinutes: null },
    { code: 'lunch', label: 'Lunch Break', icon: 'restaurant', limitMinutes: 30 },
    { code: 'tea', label: 'Tea Break', icon: 'local-cafe', limitMinutes: 15 },
  ],
  modeThresholds: { maxLatencyMs: 300, maxLossPct: 3, maxJitterMs: 40 },
  inboundFallbackSeconds: 5,
  featureFlags: { aiSummary: false, transcripts: false, moveToPstn: false, callingHours: true },
};
