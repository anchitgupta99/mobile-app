import type { CallRecord, Contact, Task, TimelineEvent } from '@/domain/types';

const MIN = 60000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** The sample contacts' owner and campaign, for the timeline only */
const OWNER = 'Priya Sharma';
const CAMPAIGN = 'cmp_home_loans';

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

/**
 * The Contacts tab's sample data, the only part of the app not on the server yet: contacts and, for their
 * activity timeline, some made-up calls and callbacks.
 */
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
    owner: OWNER,
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
      campaignId: i % 5 === 3 ? 'cmp_lap' : CAMPAIGN,
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
      detail: `Owner set to ${OWNER}`,
    });
  });

  return { contacts, calls, tasks, timeline };
}
