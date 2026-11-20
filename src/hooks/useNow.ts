import { useCallback, useSyncExternalStore } from 'react';

type Ticker = { now: number; listeners: Set<() => void>; timer: ReturnType<typeof setInterval> };

// One shared interval per period, so a list of 50 rows calling useNow(30000) runs one timer and re-renders together,
// not 50 timers drifting apart. A ticker starts fresh when its first subscriber arrives and stops with its last; a
// component that joins a running ticker sees its last tick, at most one period old.
const tickers = new Map<number, Ticker>();

function subscribeTo(intervalMs: number, listener: () => void) {
  let t = tickers.get(intervalMs);
  if (!t) {
    const ticker: Ticker = {
      // Same value the first render read, so subscribing doesn't force a second render
      now: firstRead(intervalMs),
      listeners: new Set(),
      timer: setInterval(() => {
        ticker.now = Date.now();
        ticker.listeners.forEach((l) => l());
      }, intervalMs),
    };
    tickers.set(intervalMs, ticker);
    t = ticker;
  }
  t.listeners.add(listener);
  return () => {
    t.listeners.delete(listener);
    if (!t.listeners.size) {
      clearInterval(t.timer);
      tickers.delete(intervalMs);
    }
  };
}

export function useNow(intervalMs = 1000) {
  const subscribe = useCallback((l: () => void) => subscribeTo(intervalMs, l), [intervalMs]);
  // Before the first subscribe (first render) there is no ticker yet; read the clock once and keep it until one exists
  const snapshot = useCallback(() => tickers.get(intervalMs)?.now ?? firstRead(intervalMs), [intervalMs]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// getSnapshot must return the same value on repeated calls, so cache the pre-subscribe read per period
const pending = new Map<number, number>();
function firstRead(intervalMs: number) {
  let v = pending.get(intervalMs);
  if (v === undefined || Date.now() - v >= intervalMs) {
    v = Date.now();
    pending.set(intervalMs, v);
  }
  return v;
}
