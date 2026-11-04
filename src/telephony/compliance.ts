import type { Contact } from '@/domain/types';

const DEFAULT_TZ = 'Asia/Kolkata';

/** Hour of day (0-23) in the contact's time zone; a bad or unknown zone falls back to the default */
export function localHour(at: Date, timezone: string | null | undefined): number {
  for (const tz of [timezone, DEFAULT_TZ]) {
    if (!tz) continue;
    try {
      // hourCycle h23 so midnight is "0", never "24" as hour12:false can give
      const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(at));
      if (Number.isFinite(h)) return h % 24;
    } catch {
      // RangeError for an unrecognised time zone: try the default
    }
  }
  return at.getHours();
}

export type ComplianceResult = { ok: true } | { ok: false; title: string; message: string; overridable: boolean };

export function checkBeforeDial(contact: Contact | null, enforceHours: boolean, at = new Date()): ComplianceResult {
  if (contact?.dnc) {
    return {
      ok: false,
      title: 'On the do-not-call list',
      message: `${contact.name} asked not to be called. This call is blocked.`,
      overridable: false,
    };
  }
  const hour = localHour(at, contact?.timezone);
  if (enforceHours && (hour < 9 || hour >= 21)) {
    return {
      ok: false,
      title: 'Outside calling hours',
      message: `It is ${hour}:00 for this customer. Calls are allowed 9:00–21:00 in their time zone.`,
      overridable: false,
    };
  }
  return { ok: true };
}
