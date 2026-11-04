import { Platform } from 'react-native';
import { useSettings } from '@/store/settings';
import { useCall } from '@/telephony/callStore';
import type { CallState } from '@/domain/types';
import type { FeedbackEvent } from './events';
import { decide } from './gate';
import { playHaptic } from './haptics';
import { playSound } from './sounds';

export type { FeedbackEvent } from './events';
export { preloadSounds } from './sounds';

/** Sounds are only muted while the customer can hear the agent, not while a call is still ringing or being set up */
export function isOnTheLine(state: CallState | undefined) {
  return state === 'connected' || state === 'held';
}

/** Confirm something happened. Callable from worklets via runOnJS(feedback)(event). */
export function feedback(event: FeedbackEvent, opts?: { digit?: string }) {
  const s = useSettings.getState();
  const d = decide(
    event,
    { hapticsOn: s.haptics, soundsOn: s.uiSounds, inCall: isOnTheLine(useCall.getState().call?.state), web: Platform.OS === 'web' },
    opts?.digit,
  );
  if (d.haptic) playHaptic(d.haptic);
  if (d.sound) playSound(d.sound);
}
