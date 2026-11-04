import { Platform, Vibration } from 'react-native';
import { useSettings } from '@/store/settings';

const RING_PATTERN = [0, 800, 600, 800, 600];

export const nativeCall = {
  reportIncoming(_callId: string, _displayName: string) {
    // The ring buzz is a haptic like any other: respect the agent's haptics setting
    if (Platform.OS !== 'web' && useSettings.getState().haptics) Vibration.vibrate(RING_PATTERN, true);
  },
  reportOutgoing(_callId: string, _number: string) {},
  reportConnected(_callId: string) {
    if (Platform.OS !== 'web') Vibration.cancel();
  },
  reportEnded(_callId: string) {
    if (Platform.OS !== 'web') Vibration.cancel();
  },
};
