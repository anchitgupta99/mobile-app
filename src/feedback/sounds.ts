import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import type { SoundName } from './events';

const sources: Record<SoundName, number> = {
  dtmf_0: require('../../assets/sounds/dtmf_0.wav'),
  dtmf_1: require('../../assets/sounds/dtmf_1.wav'),
  dtmf_2: require('../../assets/sounds/dtmf_2.wav'),
  dtmf_3: require('../../assets/sounds/dtmf_3.wav'),
  dtmf_4: require('../../assets/sounds/dtmf_4.wav'),
  dtmf_5: require('../../assets/sounds/dtmf_5.wav'),
  dtmf_6: require('../../assets/sounds/dtmf_6.wav'),
  dtmf_7: require('../../assets/sounds/dtmf_7.wav'),
  dtmf_8: require('../../assets/sounds/dtmf_8.wav'),
  dtmf_9: require('../../assets/sounds/dtmf_9.wav'),
  dtmf_star: require('../../assets/sounds/dtmf_star.wav'),
  dtmf_hash: require('../../assets/sounds/dtmf_hash.wav'),
  connect: require('../../assets/sounds/connect.wav'),
  end: require('../../assets/sounds/end.wav'),
  saved: require('../../assets/sounds/saved.wav'),
  complete: require('../../assets/sounds/complete.wav'),
  error: require('../../assets/sounds/error.wav'),
};

const players = new Map<SoundName, AudioPlayer>();
let started = false;
let warned = false;

function warnOnce(e: unknown) {
  if (__DEV__ && !warned) {
    warned = true;
    console.warn('[feedback] sound unavailable', e);
  }
}

/** Call once after startup. Safe to call again; failures never throw. */
export async function preloadSounds() {
  if (started) return;
  started = true;
  try {
    // Respect the silent switch and never take audio focus from call audio.
    // When the real VoIP stack lands, re-check this against its audio session.
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' });
  } catch (e) {
    warnOnce(e);
  }
  for (const [name, src] of Object.entries(sources) as [SoundName, number][]) {
    try {
      players.set(name, createAudioPlayer(src));
    } catch (e) {
      warnOnce(e);
    }
  }
}

export function playSound(name: SoundName) {
  const p = players.get(name);
  if (!p) return;
  try {
    void p
      .seekTo(0)
      .then(() => p.play())
      .catch(warnOnce);
  } catch (e) {
    warnOnce(e);
  }
}
