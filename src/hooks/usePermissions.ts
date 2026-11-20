import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { useCallback, useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { create } from 'zustand';

/** `blocked` means denied and the OS won't show the prompt again, so only Settings can fix it. */
export type PermissionState = 'checking' | 'granted' | 'undetermined' | 'denied' | 'blocked' | 'unsupported';
export type PermissionKind = 'mic' | 'notifications';

type Response = { granted: boolean; status: string; canAskAgain?: boolean };

function toState(r: Response): PermissionState {
  if (r.granted) return 'granted';
  if (r.status === 'undetermined') return 'undetermined';
  return r.canAskAgain === false ? 'blocked' : 'denied';
}

// expo-notifications has no web implementation, and importing it throws in Expo Go on Android
// (push was removed there in SDK 53), so load it lazily and treat a failed load as unsupported
let Notifications: typeof import('expo-notifications') | null = null;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
  } catch {
    Notifications = null;
  }
}
const notificationsSupported = Notifications !== null;

const unsupported = (): Promise<Response> => Promise.reject(new Error('expo-notifications unavailable'));

/**
 * On the web, expo-audio's "get" falls through to getUserMedia when the browser hasn't decided yet, so a plain
 * refresh pops the browser prompt and a dismissed prompt reads as denied. Query the Permissions API instead and
 * treat "prompt" as undetermined; only the Allow button asks.
 */
async function getMicPermission(): Promise<Response> {
  if (Platform.OS !== 'web') return getRecordingPermissionsAsync();
  try {
    const { state } = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (state === 'granted') return { granted: true, status: 'granted' };
    if (state === 'denied') return { granted: false, status: 'denied', canAskAgain: true };
  } catch {
    // Firefox and older Safari can't query the microphone; fall through to undetermined
  }
  return { granted: false, status: 'undetermined' };
}

const api: Record<PermissionKind, { get: () => Promise<Response>; request: () => Promise<Response> }> = {
  mic: { get: getMicPermission, request: requestRecordingPermissionsAsync },
  notifications: {
    get: () => Notifications?.getPermissionsAsync() ?? unsupported(),
    request: () => Notifications?.requestPermissionsAsync() ?? unsupported(),
  },
};

type PermissionsStore = {
  mic: PermissionState;
  notifications: PermissionState;
  refresh: () => Promise<void>;
  request: (kind: PermissionKind) => Promise<PermissionState>;
};

export const usePermissionsStore = create<PermissionsStore>((set, get) => ({
  mic: 'checking',
  notifications: notificationsSupported ? 'checking' : 'unsupported',
  refresh: async () => {
    const read = async (kind: PermissionKind): Promise<PermissionState> => {
      if (kind === 'notifications' && !notificationsSupported) return 'unsupported';
      try {
        return toState(await api[kind].get());
      } catch {
        return 'unsupported';
      }
    };
    const [mic, notifications] = await Promise.all([read('mic'), read('notifications')]);
    set({ mic, notifications });
  },
  request: async (kind) => {
    const current = get()[kind];
    if (current === 'unsupported' || current === 'granted') return current;
    try {
      if (current === 'blocked') {
        // Only Settings can fix a blocked permission; the web has no settings page to open
        if (Platform.OS !== 'web') await Linking.openSettings();
        return current;
      }
      const next = toState(await api[kind].request());
      set({ [kind]: next } as Pick<PermissionsStore, PermissionKind>);
      return next;
    } catch {
      return current;
    }
  },
}));

/** Reads permissions on mount and again whenever the app returns to the foreground (e.g. back from Settings). */
export function usePermissions() {
  const state = usePermissionsStore();
  const refresh = state.refresh;
  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  const openSettings = useCallback(() => {
    if (Platform.OS === 'web') return;
    void Linking.openSettings().catch(() => undefined);
  }, []);
  return { ...state, openSettings };
}

export const isMissing = (s: PermissionState) => s === 'denied' || s === 'blocked' || s === 'undetermined';

/**
 * Whether the mic lets the agent go live. Browsers ask for the mic on first use, so the web build only warns
 * instead of blocking. The pre-flight header and the Go live button both read this, so they can't disagree.
 */
export const micAllowsGoLive = (s: PermissionState) => s === 'granted' || s === 'unsupported' || Platform.OS === 'web';
