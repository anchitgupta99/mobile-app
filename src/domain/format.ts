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

export function formatDialed(s: string): string {
  const d = s.replace(/\D/g, '');
  if (s.startsWith('+91') && d.length > 2) {
    const rest = d.slice(2);
    return `+91 ${rest.slice(0, 5)}${rest.length > 5 ? ' ' + rest.slice(5, 10) : ''}`.trim();
  }
  if (d.length === 10) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return s;
}
