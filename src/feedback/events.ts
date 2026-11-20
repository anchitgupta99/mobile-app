export type HapticKind = 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error';

export type SoundName =
  | 'dtmf_0'
  | 'dtmf_1'
  | 'dtmf_2'
  | 'dtmf_3'
  | 'dtmf_4'
  | 'dtmf_5'
  | 'dtmf_6'
  | 'dtmf_7'
  | 'dtmf_8'
  | 'dtmf_9'
  | 'dtmf_star'
  | 'dtmf_hash'
  | 'connect'
  | 'end'
  | 'saved'
  | 'complete'
  | 'error';

export type FeedbackEvent =
  | 'press'
  | 'select'
  | 'toggle'
  | 'dial.key'
  | 'swipe.threshold'
  | 'sheet.snap'
  | 'status.changed'
  | 'call.answered'
  | 'call.connected'
  | 'call.ended'
  | 'disposition.saved'
  | 'task.completed'
  | 'toast.success'
  | 'toast.warning'
  | 'toast.error';

type Entry = { haptic?: HapticKind; sound?: SoundName | 'dtmf'; critical?: boolean };

/** The single tuning table. Change how the app feels here. */
export const events: Record<FeedbackEvent, Entry> = {
  press: { haptic: 'light' },
  select: { haptic: 'selection' },
  toggle: { haptic: 'light' },
  'dial.key': { haptic: 'selection', sound: 'dtmf', critical: true },
  'swipe.threshold': { haptic: 'light' },
  'sheet.snap': { haptic: 'light' },
  'status.changed': { haptic: 'medium' },
  'call.answered': { haptic: 'success' },
  'call.connected': { haptic: 'light', sound: 'connect', critical: true },
  'call.ended': { haptic: 'medium', sound: 'end', critical: true },
  'disposition.saved': { haptic: 'success', sound: 'saved' },
  'task.completed': { haptic: 'success', sound: 'complete' },
  'toast.success': { haptic: 'success' },
  'toast.warning': { haptic: 'warning' },
  'toast.error': { haptic: 'error', sound: 'error' },
};

export function dtmfSound(digit: string): SoundName | null {
  if (/^[0-9]$/.test(digit)) return `dtmf_${digit}` as SoundName;
  if (digit === '*') return 'dtmf_star';
  if (digit === '#') return 'dtmf_hash';
  return null;
}
