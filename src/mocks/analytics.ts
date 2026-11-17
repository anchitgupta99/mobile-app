import type { Analytics, CustomRange, DateRange } from '@/domain/analytics';

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
  aht: { overall: 503 },
};

function scale(a: Analytics, k: number, wobble: number): Analytics {
  const n = (x: number) => Math.round(x * k);
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
    aht: { overall: a.aht.overall + wobble * 6 },
  };
}

export function analyticsFor(range: DateRange, custom?: CustomRange): Analytics {
  if (range === 'today') return today;
  if (range === 'yesterday') return scale(today, 1.12, 2);
  return scale(today, Math.max(1, (custom?.days ?? 7) * 0.92), 3);
}
