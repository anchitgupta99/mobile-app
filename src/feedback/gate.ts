import { dtmfSound, events, type FeedbackEvent, type HapticKind, type SoundName } from './events';

export type GateContext = { hapticsOn: boolean; soundsOn: boolean; inCall: boolean; web: boolean };
export type Decision = { haptic: HapticKind | null; sound: SoundName | null };

export function decide(event: FeedbackEvent, ctx: GateContext, digit?: string): Decision {
  const e = events[event];
  const haptic = e.haptic && ctx.hapticsOn && !ctx.web ? e.haptic : null;
  let sound: SoundName | null = null;
  if (e.sound && ctx.soundsOn && (!ctx.inCall || e.critical)) {
    sound = e.sound === 'dtmf' ? (digit ? dtmfSound(digit) : null) : e.sound;
  }
  return { haptic, sound };
}
