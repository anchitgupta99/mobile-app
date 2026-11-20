import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api, ApiError } from '@/api/client';
import type { AgentStatus, Contact, Task } from '@/domain/types';
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
  | (Base & { kind: 'task'; payload: Task })
  | (Base & { kind: 'contact'; payload: { id: string; patch: Partial<Contact> } })
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
  /** Backend: the last change the server turned down, for the toast (useSyncFailureToast), as the web shows it */
  failure: { at: number; title?: string; message: string } | null;
  /**
   * Sends a change once, straight away. `onFail` runs when the server turns it down, so the caller can roll back
   * its optimistic local change; `failureText` replaces the default toast text for it.
   */
  enqueue: (item: NewItem, opts?: { onFail?: (e: unknown) => void; failureText?: string }) => void;
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
    case 'task':
      return api.tasks.upsert(item.key, item.payload);
    case 'contact':
      return api.contacts.update(item.key, item.payload.id, item.payload.patch);
    case 'status':
      return api.agents.setStatus(item.payload.status, item.payload.breakCode, item.payload.campaignId);
  }
}

/**
 * What the toast says when a change fails. A callback reschedule: the web's fallback (its own text is the browser's
 * "Request failed with status code …"). The web shows nothing for the rest, but the change is rolled back here,
 * so the agent is told rather than left wondering why it undid itself.
 */
function failureText(item: OutboxItem): string {
  switch (item.kind) {
    case 'task':
      return item.payload.done ? "Couldn't mark the callback done. Please try again." : 'Failed to reschedule. Please try again.';
    case 'contact':
      return "Couldn't save the contact changes. Please try again.";
    case 'status':
      return "Couldn't change your status. Please try again.";
  }
}

/** Records with a change on its way to the server (id → number of sends in flight) */
const sending = new Map<string, number>();

/** Ids of records with a change on its way to the server right now */
export function inflightIds() {
  return new Set(sending.keys());
}

/**
 * Ids of records that still have a local change the server hasn't confirmed (queued, or being sent right now);
 * a server copy must not overwrite them
 */
export function pendingIds(items: OutboxItem[]) {
  const ids = inflightIds();
  items.forEach((i) => {
    if (i.kind !== 'status') ids.add(i.payload.id);
  });
  return ids;
}

/** Status changes go one at a time, so two quick picks reach the server in the order they were made */
let statusChain: Promise<unknown> = Promise.resolve();

let inflight: Promise<void> | null = null;

export const useOutbox = create<OutboxState>()(
  persist(
    (set, get) => {
      return {
        items: [],
        syncing: false,
        lastFlushAt: null,
        lastError: null,
        failure: null,
        enqueue: (item, opts) => {
          const full = { ...item, key: uid('idem'), attempts: 0, createdAt: new Date().toISOString() } as OutboxItem;
          // As the web, which has no queue: each change goes to the server once, straight away, and a failure is
          // shown right then and rolled back by the caller. No retries, so nothing is sent twice.
          const id = full.kind === 'status' ? null : full.payload.id;
          if (id) sending.set(id, (sending.get(id) ?? 0) + 1);
          let sent: Promise<unknown>;
          if (full.kind === 'status') {
            sent = statusChain.then(() => send(full));
            statusChain = sent.catch(() => undefined);
          } else sent = send(full);
          void sent
            .catch((e) => {
              opts?.onFail?.(e);
              set({ failure: { at: Date.now(), message: opts?.failureText ?? failureText(full) } });
            })
            .finally(() => {
              if (!id) return;
              const left = (sending.get(id) ?? 1) - 1;
              if (left > 0) sending.set(id, left);
              else sending.delete(id);
            });
        },
        flush: () => {
          // Callers that await flush() (e.g. sync before merging) must wait for the run already in
          // progress, not return early and read half-flushed state.
          if (inflight) return inflight;
          if (!get().items.some((i) => !i.parked)) return Promise.resolve();
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
        clear: () => set({ items: [], lastError: null, failure: null }),
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
