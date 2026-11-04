import { create } from 'zustand';

/** The Dialer's typed number. Shared so the center tab button can place the call. */
export const useDialpad = create<{ num: string; setNum: (fn: (n: string) => string) => void; clear: () => void }>((set) => ({
  num: '',
  setNum: (fn) => set((s) => ({ num: fn(s.num) })),
  clear: () => set({ num: '' }),
}));
