import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, ApiError } from '@/api/client';
import { isOnline } from '@/api/network';
import type { AgentStatus, CallRecord, Contact, DispositionPayload, Task } from '@/domain/types';
import { uid } from '@/domain/format';
import { storage } from './storage';

type Base = {
  key: string;
  label: string;
  attempts: number;
  createdAt: string;
  /** Last server rejection message */
  error?: string;
  /** Rejected by the server and taken out of the retry loop until the agent retries or discards it */
  parked?: boolean;
};

export type OutboxItem =
  | (Base & { kind: 'disposition'; payload: DispositionPayload })
  | (Base & { kind: 'task'; payload: Task })
  | (Base & { kind: 'contact'; payload: { id: string; patch: Partial<Contact> } })
  | (Base & { kind: 'call'; payload: CallRecord })
  | (Base & { kind: 'status'; payload: { status: AgentStatus; breakCode: string | null; campaignId?: string } });

type NewItem = OutboxItem extends infer T
  ? T extends OutboxItem
    ? Omit<T, 'key' | 'attempts' | 'createdAt' | 'error' | 'parked'>
    : never
  : never;

/** Give up on a rejected item after this many tries; offline attempts don't count */
export const MAX_ATTEMPTS = 3;

type OutboxState = {
  items: OutboxItem[];
  syncing: boolean;
  lastFlushAt: string | null;
  lastError: string | null;
  enqueue: (item: NewItem) => void;
  flush: () => Promise<void>;
  /** Put a parked item back in the queue and flush */
  retry: (key: string) => void;
  /** Drop one item for good */
  discard: (key: string) => void;
  /** Drop every queued item of one kind, e.g. a stale status change the server has since overridden */
  dropKind: (kind: OutboxItem['kind']) => void;
  clear: () => void;
};

async function send(item: OutboxItem) {
  switch (item.kind) {
    case 'disposition':
      return api.calls.disposition(item.key, item.payload);
    case 'task':
      return api.tasks.upsert(item.key, item.payload);
    case 'contact':
      return api.contacts.update(item.key, item.payload.id, item.payload.patch);
    case 'call':
      return api.calls.upsert(item.key, item.payload);
    case 'status':
      return api.agents.setStatus(item.payload.status, item.payload.breakCode, item.payload.campaignId);
  }
}

/** Ids of records that still have a queued local change; a server copy must not overwrite them */
export function pendingIds(items: OutboxItem[]) {
  const ids = new Set<string>();
  items.forEach((i) => {
    if (i.kind === 'disposition') ids.add(i.payload.callId);
    else if (i.kind !== 'status') ids.add(i.payload.id);
  });
  return ids;
}

let inflight: Promise<void> | null = null;

export const useOutbox = create<OutboxState>()(
  persist(
    (set, get) => {
      return {
        items: [],
        syncing: false,
        lastFlushAt: null,
        lastError: null,
        enqueue: (item) => {
          const full = { ...item, key: uid('idem'), attempts: 0, createdAt: new Date().toISOString() } as OutboxItem;
          set((s) => ({
            items: full.kind === 'status' ? [...s.items.filter((i) => i.kind !== 'status'), full] : [...s.items, full],
          }));
          void get().flush();
        },
        flush: () => {
          // Callers that await flush() (e.g. sync before merging) must wait for the run already in
          // progress, not return early and read half-flushed state.
          if (inflight) return inflight;
          if (!isOnline() || !get().items.some((i) => !i.parked)) return Promise.resolve();
          inflight = runFlush().finally(() => {
            inflight = null;
          });
          return inflight;
        },
        retry: (key) => {
          set((s) => ({ items: s.items.map((i) => (i.key === key ? { ...i, parked: false, attempts: 0, error: undefined } : i)) }));
          void get().flush();
        },
        discard: (key) => set((s) => ({ items: s.items.filter((i) => i.key !== key) })),
        dropKind: (kind) => set((s) => ({ items: s.items.filter((i) => i.kind !== kind) })),
        clear: () => set({ items: [], lastError: null }),
      };

      async function runFlush() {
        set({ syncing: true, lastError: null });
        const attempted = new Set<string>();
        let blocked = false;
        try {
          const next = () => get().items.find((i) => !i.parked && !attempted.has(i.key));
          for (let item = next(); item && !blocked; item = next()) {
            attempted.add(item.key);
            try {
              await send(item);
              set((s) => ({ items: s.items.filter((i) => i.key !== item.key) }));
            } catch (e) {
              const offline = e instanceof ApiError && e.code === 'offline';
              const message = e instanceof Error ? e.message : 'Sync failed';
              set((s) => ({
                lastError: message,
                // Offline is expected and retried automatically; anything else is a rejection the agent should see
                items: s.items.map((i) => {
                  if (i.key !== item.key) return i;
                  if (offline) return { ...i, attempts: i.attempts + 1 };
                  const attempts = i.attempts + 1;
                  // A rejection won't fix itself by retrying forever; park it so the agent can decide
                  return { ...i, attempts, error: message, parked: attempts >= MAX_ATTEMPTS };
                }),
              }));
              blocked = offline;
            }
          }
        } finally {
          set({ syncing: false, lastFlushAt: new Date().toISOString() });
        }
      }
    },
    { name: 'claritel.outbox', storage, partialize: (s) => ({ items: s.items, lastFlushAt: s.lastFlushAt }) },
  ),
);
