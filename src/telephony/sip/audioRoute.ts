import Constants, { ExecutionEnvironment } from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';
import type { AudioRoute } from '@/store/settings';

type InCallManager = typeof import('react-native-incall-manager').default;

let loaded: InCallManager | null | undefined;

/**
 * react-native-incall-manager, or null where it can't run (Expo Go and the web build have no native side).
 * Loaded lazily like react-native-webrtc, whose call audio it routes.
 */
function load(): InCallManager | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('react-native-incall-manager').default as InCallManager;
  } catch {
    loaded = null;
  }
  return loaded;
}

const androidDevice: Record<AudioRoute, string> = { earpiece: 'EARPIECE', speaker: 'SPEAKER_PHONE', bluetooth: 'BLUETOOTH' };

/** Plays the call's audio through the earpiece, the loudspeaker or a Bluetooth headset */
export function setCallAudioRoute(route: AudioRoute) {
  const m = load();
  if (!m) return;
  if (Platform.OS === 'android') {
    // Android 12+ asks before an app may use a Bluetooth headset; without it the call stays where it is.
    // No headset connected: Android stays where it is too, and the next tap tries again.
    const ask =
      route === 'bluetooth' && Number(Platform.Version) >= 31
        ? PermissionsAndroid.request('android.permission.BLUETOOTH_CONNECT')
        : Promise.resolve(null);
    void ask.then(() => m.chooseAudioRoute(androidDevice[route])).catch(() => undefined);
    return;
  }
  // iOS routes Bluetooth by itself; it only needs telling about the loudspeaker
  m.setForceSpeakerphoneOn(route === 'speaker');
}

/**
 * Puts the phone in call mode for a webphone call, as a normal phone call is: earpiece unless told
 * otherwise, and the screen goes dark against the ear (the proximity sensor).
 */
export function startCallAudio(route: AudioRoute) {
  const m = load();
  if (!m) return;
  m.start({ media: 'audio' });
  setCallAudioRoute(route);
}

/** Back to normal audio once the call is over */
export function stopCallAudio() {
  load()?.stop();
}
