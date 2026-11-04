import type { AgentStatus, CallMode, ScreenPop, Task } from '@/domain/types';

export type RealtimeEvents = {
  'call.incoming': { callId: string; mode: CallMode; pop: ScreenPop; fallback: boolean };
  'call.state_changed': { callId: string; state: string };
  'call.mode_changed': { callId: string; mode: CallMode };
  'call.fallback_triggered': { callId: string; reason: string };
  'agent.status_changed': { status: AgentStatus; breakCode?: string | null; source: 'web' | 'mobile' };
  'queue.updated': { waiting: number };
  'task.due': { task: Task };
  'config.updated': { keys: string[] };
  'device.revoked': { reason: string };
};

type Handler<K extends keyof RealtimeEvents> = (payload: RealtimeEvents[K]) => void;

const handlers = new Map<keyof RealtimeEvents, Set<(payload: never) => void>>();

export const realtime = {
  on<K extends keyof RealtimeEvents>(event: K, handler: Handler<K>) {
    let set = handlers.get(event);
    if (!set) handlers.set(event, (set = new Set()));
    const h = handler as (payload: never) => void;
    set.add(h);
    return () => {
      set.delete(h);
    };
  },
  emit<K extends keyof RealtimeEvents>(event: K, payload: RealtimeEvents[K]) {
    handlers.get(event)?.forEach((h) => (h as Handler<K>)(payload));
  },
};
