import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ApiError, api } from '@/api/client';
import type { CallRecord, Contact, DispositionConfig, DispositionPayload, ServerConfig, Task, TimelineEvent } from '@/domain/types';
import { uid } from '@/domain/format';
import { findCampaign } from './campaigns';
import { pendingIds, useOutbox } from './outbox';
import { storage } from './storage';

type DataState = {
  contacts: Contact[];
  calls: CallRecord[];
  tasks: Task[];
  timeline: TimelineEvent[];
  dispositions: DispositionConfig;
  server: ServerConfig;
  lastSyncAt: string | null;
  refreshing: boolean;
  /** Message from the last failed sync; cleared on the next success */
  syncError: string | null;
  /** Resolves true when data was refreshed */
  sync: () => Promise<boolean>;
  addCall: (call: CallRecord) => void;
  /** Backend: resolves once the server accepted it and rejects with its reason; demo: queued, resolves at once */
  saveDisposition: (payload: DispositionPayload, extra?: { label: string }) => Promise<void>;
  upsertTask: (task: Task) => void;
  completeTask: (id: string) => void;
  snoozeTask: (id: string, minutes: number) => void;
  updateContact: (id: string, patch: Partial<Contact>) => void;
  /** Switch the disposition tree to another campaign and refetch it */
  setCampaign: (campaignId: string) => void;
  wipe: () => void;
};

/** Newer row wins, except rows with a change still queued in the outbox keep the local copy */
export function mergeById<T extends { id: string; updatedAt: string }>(local: T[], remote: T[], pending: Set<string> = new Set()) {
  const map = new Map(local.map((r) => [r.id, r]));
  remote.forEach((r) => {
    const cur = map.get(r.id);
    if (cur && pending.has(r.id)) return;
    if (!cur || cur.updatedAt <= r.updatedAt) map.set(r.id, r);
  });
  return [...map.values()];
}

/**
 * Backend: the server's call history is the list. A call made in the app keeps its own id once the server
 * lists it (wrap-up and links find it by that id), and stays on its own for a day until the server lists it.
 */
export function withServerCalls(local: CallRecord[], server: CallRecord[], pending: Set<string>) {
  const mineByUuid = new Map(local.filter((c) => c.uuid && c.id !== c.uuid).map((c) => [c.uuid as string, c]));
  const merged = server.map((r) => {
    const mine = mineByUuid.get(r.uuid ?? '');
    if (!mine) return r;
    // A disposition still queued here is newer than the server's row
    return pending.has(mine.id) ? mine : { ...r, id: mine.id, contactId: mine.contactId ?? r.contactId };
  });
  const listed = new Set(server.map((r) => r.uuid));
  const dayAgo = Date.now() - 86400000;
  const notYetListed = local.filter((c) => c.id !== c.uuid && !listed.has(c.uuid) && Date.parse(c.startedAt) > dayAgo);
  return [...merged, ...notYetListed];
}

const serverId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/**
 * Backend: the server's open callbacks are the list, so one done or deleted elsewhere drops off here too.
 * A change still queued keeps the local copy, and reminders made on this phone stay alongside.
 */
export function withServerTasks(local: Task[], server: Task[], pending: Set<string>) {
  const mine = new Map(local.map((t) => [t.id, t]));
  const merged = server.map((r) => (pending.has(r.id) ? (mine.get(r.id) ?? r) : r));
  return [...merged, ...local.filter((t) => !serverId(t.id))];
}

const stamp = () => new Date().toISOString();

/** Delta watermark for the next sync: the oldest server cursor returned, so no list can be skipped past */
export function earliestCursor(cursors: (string | null | undefined)[]) {
  const known = cursors.filter((c): c is string => !!c);
  return known.length ? known.reduce((a, b) => (a < b ? a : b)) : null;
}

/** Readable summary of a contact edit for the timeline, without leaking raw field keys or booleans */
export function describePatch(patch: Partial<Contact>) {
  const labels: Record<string, string> = {
    name: 'Name',
    company: 'Company',
    phone: 'Phone',
    email: 'Email',
    city: 'City',
    timezone: 'Time zone',
    tags: 'Tags',
    owner: 'Owner',
    lastDisposition: 'Last disposition',
    lastContactAt: 'Last contact',
    dnc: 'Do not call',
  };
  return Object.entries(patch)
    .filter(([k]) => k !== 'updatedAt')
    .map(([k, v]) => {
      const label = labels[k] ?? k;
      if (typeof v === 'boolean') return `${label}: ${v ? 'Yes' : 'No'}`;
      if (Array.isArray(v)) return `${label}: ${v.length ? v.join(', ') : 'none'}`;
      if (v == null || v === '') return `${label} cleared`;
      return `${label}: ${String(v)}`;
    })
    .join(' · ');
}

/** Timeline wording for a call that has no disposition yet */
export function callOutcomeLabel(outcome: CallRecord['outcome']) {
  switch (outcome) {
    case 'missed':
      return 'Missed';
    case 'no-answer':
      return 'No answer';
    case 'busy':
      return 'Busy';
    case 'failed':
      return 'Failed';
    default:
      return 'Not dispositioned';
  }
}

/** Bumped by wipe(); a sync that started before a wipe must not write its results back */
let generation = 0;

const empty = {
  contacts: [] as Contact[],
  calls: [] as CallRecord[],
  tasks: [] as Task[],
  timeline: [] as TimelineEvent[],
  // The tenant's break types and the campaign's dispositions come from the server; empty until they load
  dispositions: { campaignId: '', mandatory: true, acwSeconds: 30, dispositions: [] } as DispositionConfig,
  server: { breakTypes: [] } as ServerConfig,
  lastSyncAt: null as string | null,
};

/** The server's ids are UUIDs; anything else saved on the phone is a sample from an older build */
const SERVER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const useData = create<DataState>()(
  persist(
    (set, get) => ({
      ...empty,
      refreshing: false,
      syncError: null,
      sync: async () => {
        if (get().refreshing) return false;
        set({ refreshing: true });
        const gen = generation;
        try {
          await useOutbox.getState().flush();
          const since = get().lastSyncAt ?? undefined;
          const [contacts, calls, tasks, dispositions, server] = await Promise.all([
            api.contacts.list(since),
            api.calls.list(),
            api.tasks.list(),
            api.dispositions.config(get().dispositions.campaignId, findCampaign(get().dispositions.campaignId)?.wrapUpSeconds),
            api.config.get(),
          ]);
          // Signed out (and wiped) while this was in flight: drop the results instead of re-caching PII
          if (gen !== generation) return false;
          const pending = pendingIds(useOutbox.getState().items);
          set((s) => ({
            contacts: mergeById(s.contacts, contacts.items, pending),
            calls: withServerCalls(s.calls, calls.items, pending).sort(
              (a, b) => b.startedAt.localeCompare(a.startedAt),
            ),
            tasks: withServerTasks(s.tasks, tasks.items, pending),
            timeline: s.timeline.length ? s.timeline : api.timeline.seed(),
            dispositions,
            server,
            // The server's own time, so clock skew on the device can't skip rows next time
            lastSyncAt: earliestCursor([contacts.cursor, calls.cursor, tasks.cursor]) ?? s.lastSyncAt ?? stamp(),
            syncError: null,
          }));
          return true;
        } catch (e) {
          set({
            syncError:
              e instanceof ApiError && e.code === 'offline'
                ? 'You are offline'
                : e instanceof Error
                  ? e.message
                  : 'Could not reach the server',
          });
          return false;
        } finally {
          set({ refreshing: false });
        }
      },
      addCall: (call) => {
        set((s) => ({
          calls: [call, ...s.calls.filter((c) => c.id !== call.id)],
          timeline: call.contactId
            ? [
                {
                  id: `tl_${call.id}`,
                  contactId: call.contactId,
                  kind: 'call',
                  at: call.startedAt,
                  title: `${call.direction === 'inbound' ? 'Inbound' : 'Outbound'} call · ${callOutcomeLabel(call.outcome)}`,
                  detail: '',
                },
                ...s.timeline.filter((t) => t.id !== `tl_${call.id}`),
              ]
            : s.timeline,
        }));
      },
      saveDisposition: async (payload, extra) => {
        const label = extra?.label ?? payload.code;
        const call = get().calls.find((c) => c.id === payload.callId);
        // Sent straight away, as the web's Submit, and the call only shows the disposition once the server has
        // accepted it; a rejection reaches the wrap-up screen with the server's reason
        await api.calls.disposition(payload);
        set((s) => {
          return {
            calls: s.calls.map((c) =>
              c.id === payload.callId ? { ...c, disposition: label, notes: payload.notes, updatedAt: stamp() } : c,
            ),
            contacts: call?.contactId
              ? s.contacts.map((c) =>
                  c.id === call.contactId ? { ...c, lastDisposition: label, lastContactAt: call.startedAt, updatedAt: stamp() } : c,
                )
              : s.contacts,
            timeline: s.timeline.map((t) =>
              t.id === `tl_${payload.callId}` ? { ...t, title: t.title.replace(/·.*$/, `· ${label}`), detail: payload.notes } : t,
            ),
          };
        });
      },
      upsertTask: (task) => {
        const row = { ...task, updatedAt: stamp() };
        set((s) => {
          const exists = s.tasks.some((t) => t.id === task.id);
          return {
            tasks: exists ? s.tasks.map((t) => (t.id === task.id ? row : t)) : [row, ...s.tasks],
            timeline:
              !exists && task.contactId
                ? [
                    {
                      id: `tl_${task.id}`,
                      contactId: task.contactId,
                      kind: 'task',
                      at: row.updatedAt,
                      title: `Task created · ${task.title}`,
                      detail: task.notes,
                    },
                    ...s.timeline,
                  ]
                : s.timeline,
          };
        });
        useOutbox.getState().enqueue({ kind: 'task', label: `Task · ${task.title}`, payload: row });
      },
      completeTask: (id) => {
        const t = get().tasks.find((x) => x.id === id);
        if (t) get().upsertTask({ ...t, done: !t.done });
      },
      snoozeTask: (id, minutes) => {
        const t = get().tasks.find((x) => x.id === id);
        if (!t) return;
        const base = Math.max(Date.now(), new Date(t.dueAt).getTime());
        get().upsertTask({ ...t, dueAt: new Date(base + minutes * 60000).toISOString() });
      },
      updateContact: (id, patch) => {
        const before = get().contacts.find((c) => c.id === id);
        set((s) => ({
          contacts: s.contacts.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: stamp() } : c)),
          timeline: before
            ? [
                {
                  id: uid('tl'),
                  contactId: id,
                  kind: 'field',
                  at: stamp(),
                  title: 'Details updated',
                  detail: describePatch(patch),
                },
                ...s.timeline,
              ]
            : s.timeline,
        }));
        useOutbox.getState().enqueue({ kind: 'contact', label: 'Contact edit', payload: { id, patch } });
      },
      setCampaign: (campaignId) => {
        if (campaignId === get().dispositions.campaignId) return;
        set((s) => ({ dispositions: { ...s.dispositions, campaignId } }));
        void get().sync();
      },
      wipe: () => {
        generation++;
        set({ ...empty });
      },
    }),
    {
      name: 'claritel.data',
      storage,
      partialize: ({ refreshing, syncError, sync, ...rest }) => rest,
      // v1: older builds saved the sample break types and dispositions before the server's had loaded;
      // against the backend those are dropped, so a sample break id can never be sent to the server.
      // v2: missed-call reminders made on the phone are dropped; as the web, a missed call only gets a toast.
      version: 2,
      migrate: (persisted, version) => {
        let s = persisted as Partial<DataState> | undefined;
        if (!s) return s as unknown as DataState;
        if (version < 1) {
          const breakTypes = (s.server?.breakTypes ?? []).filter((b) => SERVER_ID.test(b.code));
          s = {
            ...s,
            server: { ...(s.server ?? empty.server), breakTypes },
            dispositions: s.dispositions && SERVER_ID.test(s.dispositions.campaignId) ? s.dispositions : empty.dispositions,
          };
        }
        if (version < 2) s = { ...s, tasks: (s.tasks ?? []).filter((t) => t.kind !== 'missed') };
        return s as DataState;
      },
    },
  ),
);

export function contactById(id: string | null | undefined) {
  return id ? (useData.getState().contacts.find((c) => c.id === id) ?? null) : null;
}

export function findContactByNumber(number: string) {
  const d = number.replace(/\D/g, '').slice(-10);
  if (d.length < 10) return null;
  return useData.getState().contacts.find((c) => c.phone.replace(/\D/g, '').endsWith(d)) ?? null;
}
