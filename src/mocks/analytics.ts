import type { Analytics, CustomRange, DateRange } from '@/domain/analytics';

const hours = ['09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'];

// Today matches the web dashboard reference; other ranges scale it so the numbers stay internally consistent.
const today: Analytics = {
  inbound: { total: 45, answered: 41, abandoned: 4 },
  outbound: { total: 40, answered: 31, missed: 9 },
  shift: { login: 30769, idle: 2400, brk: 4800, call: 23569 },
  callTime: { ringing: 1120, talk: 19269, hold: 1260, wrap: 1920 },
  breaks: [
    { label: 'Bio Break', seconds: 720 },
    { label: 'Meeting Break', seconds: 1800 },
    { label: 'Lunch Break', seconds: 1800 },
    { label: 'Tea Break', seconds: 480 },
  ],
  hours,
  hourly: {
    outbound: [3, 5, 6, 4, 1, 3, 5, 4, 4, 3, 2, 0],
    inbound: [2, 4, 5, 5, 2, 3, 4, 5, 4, 3, 3, 1],
    busy: [1, 0, 1, 2, 0, 1, 1, 0, 1, 1, 0, 0],
    abandoned: [0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
  },
  aht: {
    inbound: [420, 465, 510, 560, 480, 455, 530, 575, 520, 470, 440, 400],
    outbound: [380, 430, 470, 505, 450, 415, 490, 540, 500, 445, 410, 360],
    overall: 503,
  },
};

function scale(a: Analytics, k: number, wobble: number): Analytics {
  const n = (x: number) => Math.round(x * k);
  const w = (arr: number[]) => arr.map((x, i) => Math.max(0, Math.round(x * k * (1 + (((i * 7 + wobble) % 5) - 2) * 0.08))));
  const inbound = { total: n(a.inbound.total), answered: n(a.inbound.answered), abandoned: 0 };
  inbound.abandoned = inbound.total - inbound.answered;
  const outbound = { total: n(a.outbound.total), answered: n(a.outbound.answered), missed: 0 };
  outbound.missed = outbound.total - outbound.answered;
  const callTime = { ringing: n(a.callTime.ringing), talk: n(a.callTime.talk), hold: n(a.callTime.hold), wrap: n(a.callTime.wrap) };
  const breaks = a.breaks.map((b) => ({ ...b, seconds: n(b.seconds) }));
  const call = callTime.ringing + callTime.talk + callTime.hold + callTime.wrap;
  const brk = breaks.reduce((t, b) => t + b.seconds, 0);
  const idle = n(a.shift.idle);
  return {
    inbound,
    outbound,
    shift: { login: call + brk + idle, idle, brk, call },
    callTime,
    breaks,
    hours,
    hourly: { outbound: w(a.hourly.outbound), inbound: w(a.hourly.inbound), busy: w(a.hourly.busy), abandoned: w(a.hourly.abandoned) },
    aht: {
      inbound: a.aht.inbound.map((x, i) => x + (((i + wobble) % 3) - 1) * 25),
      outbound: a.aht.outbound.map((x, i) => x + (((i + wobble) % 3) - 1) * 20),
      overall: a.aht.overall + wobble * 6,
    },
  };
}

export function analyticsFor(range: DateRange, custom?: CustomRange): Analytics {
  if (range === 'today') return today;
  if (range === 'yesterday') return scale(today, 1.12, 2);
  return scale(today, Math.max(1, (custom?.days ?? 7) * 0.92), 3);
}
