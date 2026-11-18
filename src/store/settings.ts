import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { storage } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type AudioRoute = 'earpiece' | 'speaker' | 'bluetooth';

type SettingsState = {
  theme: ThemePreference;
  defaultAudio: AudioRoute;
  pushReminders: boolean;
  missedCallAlerts: boolean;
  biometricLock: boolean;
  idleLockMinutes: number;
  uiSounds: boolean;
  haptics: boolean;
  micLevel: number;
  headsetLevel: number;
  /** One-time "swipe right / left" hint on the Callbacks list */
  swipeHintSeen: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      defaultAudio: 'earpiece',
      pushReminders: true,
      missedCallAlerts: true,
      biometricLock: true,
      idleLockMinutes: 5,
      uiSounds: true,
      // Off until the agent turns it on in Settings → Haptics
      haptics: false,
      micLevel: 0.8,
      headsetLevel: 0.6,
      swipeHintSeen: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'claritel.settings',
      storage,
      // v1: haptics became off by default; installs saved before then had it on without choosing it
      version: 1,
      migrate: (saved, from) => {
        const s = (saved ?? {}) as Partial<SettingsState>;
        return (from < 1 ? { ...s, haptics: false } : s) as SettingsState;
      },
    },
  ),
);
