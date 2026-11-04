import { realtime } from '@/api/realtime';

/**
 * Demo-only source of `queue.updated` events. A real backend pushes the waiting count over the
 * realtime channel; here the Demo controls on Home start a timer that fabricates one every few
 * seconds so the "In queue" tile has something to show. Nothing in the app should emit queue
 * numbers itself.
 */
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  realtime.emit('queue.updated', { waiting: Math.max(0, Math.round(2 + Math.random() * 5)) });
}

export function isQueueSimulatorRunning() {
  return timer !== null;
}

export function startQueueSimulator(intervalMs = 15000) {
  if (timer) return;
  tick();
  timer = setInterval(tick, intervalMs);
}

export function stopQueueSimulator() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
