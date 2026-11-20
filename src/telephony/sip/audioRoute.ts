import Constants, { ExecutionEnvironment } from 'expo-constants';
import { DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';
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

/** What Android reports: the devices it can play the call through and the one it is using (InCallManager's map) */
type AndroidDeviceStatus = { availableAudioDeviceList?: string; selectedAudioDevice?: string };

/** The call's audio as the system has it: the routes it can offer, and the one it is on (null: not said) */
export type AudioDevices = { available: AudioRoute[]; selected: AudioRoute | null };

// The devices Android last reported, so "Phone" goes to a wired headset when one is plugged in (the earpiece is off then)
let androidAvailable: string[] = [];
// Android 12+ without the Bluetooth permission: no headset is listed until the agent allows it, so Bluetooth stays
// on offer and the tap asks. Allowed mid-call, the headset is only picked up on the next call.
let bluetoothUnasked = false;

const routeOf = (device: string | undefined): AudioRoute | null =>
  device === 'SPEAKER_PHONE'
    ? 'speaker'
    : device === 'BLUETOOTH'
      ? 'bluetooth'
      : device === 'EARPIECE' || device === 'WIRED_HEADSET'
        ? 'earpiece'
        : null;

function readStatus(status: AndroidDeviceStatus | null | undefined): AudioDevices {
  try {
    androidAvailable = JSON.parse(status?.availableAudioDeviceList || '[]') as string[];
  } catch {
    androidAvailable = [];
  }
  const available = [...new Set(androidAvailable.map(routeOf).filter((r): r is AudioRoute => !!r))];
  if (bluetoothUnasked && !available.includes('bluetooth')) available.push('bluetooth');
  return { available, selected: routeOf(status?.selectedAudioDevice) };
}

/**
 * Plays the call's audio through the earpiece, the loudspeaker or a Bluetooth headset. Resolves with the route
 * the system is on afterwards (Android can't switch to a headset that isn't there), or null where it can't say.
 */
export async function setCallAudioRoute(route: AudioRoute): Promise<AudioRoute | null> {
  const m = load();
  if (!m) return null;
  if (Platform.OS === 'android') {
    try {
      // Android 12+ asks before an app may use a Bluetooth headset; without it the call stays where it is
      if (route === 'bluetooth' && Number(Platform.Version) >= 31) {
        await PermissionsAndroid.request('android.permission.BLUETOOTH_CONNECT');
      }
      const device = route === 'earpiece' && androidAvailable.includes('WIRED_HEADSET') ? 'WIRED_HEADSET' : androidDevice[route];
      // A Bluetooth headset can take a moment to connect: its switch comes later, through watchAudioDevices
      return readStatus((await m.chooseAudioRoute(device)) as AndroidDeviceStatus).selected;
    } catch {
      return null;
    }
  }
  // iOS routes Bluetooth by itself; it only needs telling about the loudspeaker
  m.setForceSpeakerphoneOn(route === 'speaker');
  return route;
}

/**
 * Android: the devices the call can play through, each time they change (a headset connects or drops, a route
 * switch completes). Elsewhere it never reports, and every route stays on offer. Returns the unsubscribe.
 */
export function watchAudioDevices(onChange: (devices: AudioDevices) => void): () => void {
  if (Platform.OS !== 'android' || !load()) return () => undefined;
  bluetoothUnasked = false;
  if (Number(Platform.Version) >= 31) {
    void PermissionsAndroid.check('android.permission.BLUETOOTH_CONNECT')
      .then((granted) => (bluetoothUnasked = !granted))
      .catch(() => undefined);
  }
  const sub = DeviceEventEmitter.addListener('onAudioDeviceChanged', (status: AndroidDeviceStatus) => onChange(readStatus(status)));
  return () => sub.remove();
}

/**
 * Puts the phone in call mode for a webphone call, as a normal phone call is: earpiece unless told
 * otherwise, and the screen goes dark against the ear (the proximity sensor). Resolves like setCallAudioRoute.
 */
export function startCallAudio(route: AudioRoute): Promise<AudioRoute | null> {
  const m = load();
  if (!m) return Promise.resolve(null);
  m.start({ media: 'audio' });
  return setCallAudioRoute(route);
}

/** Back to normal audio once the call is over */
export function stopCallAudio() {
  load()?.stop();
}

/** The phone's own ringtone for an incoming call, whatever the haptics setting (the ring buzz is apart) */
export function startRingtone() {
  try {
    // No vibration pattern (the buzz follows the haptics setting); loops until stopped
    load()?.startRingtone('_DEFAULT_', 0, 'default', -1);
  } catch {
    // No ringtone is no reason to drop the call: the screen still shows it
  }
}

export function stopRingtone() {
  try {
    load()?.stopRingtone();
  } catch {
    // Nothing was ringing
  }
}
