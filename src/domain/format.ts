export function maskNumber(n: string): string {
  const digits = n.replace(/\D/g, '');
  if (digits.length < 4) return n;
  return `••••• ••${digits.slice(-3)}`;
}

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const base = `${mm}:${String(sec).padStart(2, '0')}`;
  return h > 0 ? `${h}:${base}` : base;
}

const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short' });

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** `hour`:00 tomorrow, local time — the "Tomorrow" snooze lands here whatever the task's due time was */
export function tomorrowAt(hour: number, now = new Date()): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() + 1);
  d.setHours(hour);
  return d;
}

/**
 * Minutes to pass to `snoozeTask` so the task lands exactly on `target`. `snoozeTask` adds the minutes to the later of
 * now and the due time, not to now, so a plain "24 h" would push an overdue-tomorrow task out a day too far.
 */
export function snoozeMinutesTo(target: Date, dueAt: string, now = Date.now()): number {
  const base = Math.max(now, new Date(dueAt).getTime());
  return (target.getTime() - base) / 60000;
}

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatDay(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return weekdayFmt.format(d);
  return dayFmt.format(d);
}

export function formatWhen(iso: string, now = new Date()): string {
  return `${formatDay(iso, now)}, ${formatTime(iso)}`;
}

export function formatRelative(iso: string, now = new Date()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now.getTime()) / 60000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return 'now';
  // Pick the unit from the rounded value so 1439 min reads "1 d", never "24 h"
  const hours = Math.round(abs / 60);
  const unit = abs < 60 ? `${abs} min` : hours < 24 ? `${hours} h` : `${Math.round(abs / 1440)} d`;
  return diffMin < 0 ? `${unit} ago` : `in ${unit}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '#';
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function digitsOnly(s: string): string {
  return s.replace(/[^\d+*#]/g, '');
}

/** Groups a complete number for display; anything else (partial, longer, with * or #) is shown as typed */
export function formatDialed(s: string): string {
  const intl = /^\+91(\d{10})$/.exec(s);
  if (intl) return `+91 ${intl[1].slice(0, 5)} ${intl[1].slice(5)}`;
  if (/^\d{10}$/.test(s)) return `${s.slice(0, 5)} ${s.slice(5)}`;
  return s;
}
