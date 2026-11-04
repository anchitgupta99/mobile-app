import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type WebRTC = typeof import('react-native-webrtc');

let loaded: WebRTC | null | undefined;

/**
 * react-native-webrtc, or null where it can't run: Expo Go ships without its native module and the web
 * build has none. Loaded lazily (its import throws without the native side) and only once; it also
 * puts RTCPeerConnection, MediaStream and navigator.mediaDevices on the global scope, where JsSIP
 * looks for them.
 */
export function loadWebRTC(): WebRTC | null {
  if (loaded !== undefined) return loaded;
  loaded = null;
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return loaded;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const webrtc: WebRTC = require('react-native-webrtc');
    webrtc.registerGlobals();
    loaded = webrtc;
  } catch {
    loaded = null;
  }
  return loaded;
}
