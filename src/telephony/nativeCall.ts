import { Platform, Vibration } from 'react-native';
import { useSettings } from '@/store/settings';
import { startRingtone, stopRingtone } from './sip/audioRoute';

const RING_PATTERN = [0, 800, 600, 800, 600];

/** Stops the ring: the buzz and the ringtone */
function stopRing() {
  if (Platform.OS === 'web') return;
  Vibration.cancel();
  try {
    stopRingtone();
  } catch {
    // Nothing was ringing
  }
}

export const nativeCall = {
  reportIncoming(_callId: string, _displayName: string) {
    if (Platform.OS === 'web') return;
    // The ringtone rings whatever the haptics setting, so a call isn't missed with haptics off
    try {
      startRingtone();
    } catch {
      // The buzz and the screen still tell the agent
    }
    // The ring buzz is a haptic like any other: respect the agent's haptics setting
    if (useSettings.getState().haptics) Vibration.vibrate(RING_PATTERN, true);
  },
  reportOutgoing(_callId: string, _number: string) {},
  reportConnected(_callId: string) {
    stopRing();
  },
  reportEnded(_callId: string) {
    stopRing();
  },
};
