import { create } from 'zustand';
import type { NetworkSample } from '@/domain/types';

export type NetworkQuality = 'good' | 'weak' | 'offline';

type NetworkState = {
  quality: NetworkQuality;
  setQuality: (q: NetworkQuality) => void;
};

export const useNetwork = create<NetworkState>((set) => ({
  quality: 'good',
  setQuality: (quality) => set({ quality }),
}));

export function isOnline(): boolean {
  return useNetwork.getState().quality !== 'offline';
}

function jitter(base: number, spread: number) {
  return Math.round(base + (Math.random() - 0.5) * spread);
}

export function sampleNetwork(): NetworkSample {
  const q = useNetwork.getState().quality;
  if (q === 'offline') return { type: 'none', latencyMs: 0, lossPct: 100, jitterMs: 0 };
  if (q === 'weak') return { type: '3g', latencyMs: jitter(480, 160), lossPct: jitter(6, 4), jitterMs: jitter(70, 30) };
  return { type: 'wifi', latencyMs: jitter(70, 40), lossPct: Math.max(0, jitter(0.5, 1)), jitterMs: jitter(12, 8) };
}
