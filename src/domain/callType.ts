/**
 * The call-type label the web shows on its call page (pages/agent/call/callTypeLabel.ts), copied as is: the
 * server's call type (the SIP X-Call-Type header, or "transfer" / "conference"), else the call's direction, else
 * the campaign's dial type, else "Manual".
 */
const LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  INBOUND: 'Inbound',
  INCOMING: 'Inbound',
  PREDICTIVE: 'Predictive',
  PROGRESSIVE: 'Progressive',
  PREVIEW: 'Preview',
  AUTO: 'Preview',
  CALLBACK: 'Callback',
  // Callbacks split by origin; exact keys come before the "CALLBACK" / "INBOUND" substring fallback so they win
  INBOUND_CALLBACK: 'Inbound Callback',
  CAMPAIGN_CALLBACK: 'Campaign Callback',
  TRANSFER: 'Transfer',
  CONFERENCE: 'Conference',
  OBD: 'OBD',
};

const normalise = (v?: string | null) => (v || '').trim().toUpperCase();

/** One raw value to a label, tolerating variants like "call_back" */
const labelFor = (v?: string | null): string | undefined => {
  const key = normalise(v);
  if (!key) return undefined;
  if (LABELS[key]) return LABELS[key];
  const hit = Object.keys(LABELS).find((k) => key.includes(k));
  return hit ? LABELS[hit] : undefined;
};

export type CallTypeSignals = {
  /** The server's type for the call: X-Call-Type, or TRANSFER / CONFERENCE / CALLBACK / MANUAL */
  callType?: string | null;
  /** "inbound" / "outbound" */
  direction?: string;
  /** The campaign's dial type (MANUAL, PREDICTIVE, PROGRESSIVE, PREVIEW…) */
  dialType?: string | null;
};

export function resolveCallTypeLabel({ callType, direction, dialType }: CallTypeSignals): string {
  // The explicit type wins: dialer calls also arrive as an incoming SIP call, so direction alone can't say "Inbound"
  const explicit = labelFor(callType);
  if (explicit) return explicit;
  if (/in(bound|coming)/i.test(direction || '')) return 'Inbound';
  return labelFor(dialType) ?? 'Manual';
}
