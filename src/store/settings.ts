import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CallModePreference, RingDevice } from '@/domain/types';
import { storage } from './storage';

export type ThemePreference = 'system' | 'light' | 'dark';
export type AudioRoute = 'earpiece' | 'speaker' | 'bluetooth';

type SettingsState = {
  callMode: CallModePreference;
  ringDevice: RingDevice;
  theme: ThemePreference;
  defaultAudio: AudioRoute;
  pushReminders: boolean;
  missedCallAlerts: boolean;
  biometricLock: boolean;
  idleLockMinutes: number;
  revealNumbers: boolean;
  uiSounds: boolean;
  haptics: boolean;
  /** Auto campaigns dial the next lead right after wrap-up */
  autoCall: boolean;
  micDevice: string;
  speakerDevice: string;
  micLevel: number;
  headsetLevel: number;
  /** One-time "swipe right / left" hint on the Callbacks list */
  swipeHintSeen: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      callMode: 'auto',
      ringDevice: 'auto',
      theme: 'system',
      defaultAudio: 'earpiece',
      pushReminders: true,
      missedCallAlerts: true,
      biometricLock: true,
      idleLockMinutes: 5,
      revealNumbers: false,
      uiSounds: true,
      haptics: true,
      autoCall: true,
      micDevice: 'Default - Microphone Array (Realtek(R) Audio)',
      speakerDevice: 'Default - Speakers (Realtek(R) Audio)',
      micLevel: 0.8,
      headsetLevel: 0.6,
      swipeHintSeen: false,
      set: (patch) => set(patch),
    }),
    { name: 'claritel.settings', storage },
  ),
);
