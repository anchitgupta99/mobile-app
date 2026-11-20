import { create } from 'zustand';
import { api } from '@/api/client';
import { detailError, isCaptured, type DetailEntry } from '@/domain/details';
import { MASK_CHAR } from '@/domain/phoneMask';
import type { CaptureField } from '@/domain/types';

/** One call's required details: the campaign's fields and what the agent has captured */
export type CallDetails = {
  fields: CaptureField[];
  entries: Record<string, DetailEntry>;
  leadId: string | null;
  callUuid: string | null;
};

type DetailsState = {
  /** Keyed by the app's call id; lives from the call's context until its wrap-up is done */
  byCall: Record<string, CallDetails>;
  /** From the call's context: the campaign's fields, prefilled with what the CRM already has */
  init: (
    callId: string,
    fields: CaptureField[],
    values: Record<string, string>,
    ids: { leadId: string | null; callUuid: string | null },
  ) => void;
  /** Later ids for a call already set up (the lead is often known only after dialling) */
  setIds: (callId: string, ids: { leadId?: string | null; callUuid?: string | null }) => void;
  /** Typing: kept locally; saved on commit (blur, a pick, a confirm) */
  setValue: (callId: string, key: string, value: string) => void;
  /** Saves the field if its value is usable */
  commit: (callId: string, key: string) => void;
  /** "Name: Rahul ✓": the CRM's value is right */
  confirm: (callId: string, key: string) => void;
  setDeclined: (callId: string, key: string, declined: boolean) => void;
  /** Saves again every captured detail whose save hasn't gone through (wrap-up, before the disposition) */
  saveUnsaved: (callId: string) => void;
  drop: (callId: string) => void;
  clear: () => void;
};

const RETRY_MS = [1000, 3000, 9000];
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** `callId:key` of the saves held back for want of a lead; sent once the call's lead is known (setIds / init) */
const waiting = new Set<string>();
/** Per `callId:key`: bumped by every save sent and every edit, so a reply for an older value is ignored */
const seqs = new Map<string, number>();
/** Fields with a save on its way; a newer save waits for it, so the server gets them in order */
const inFlight = new Set<string>();
const queued = new Set<string>();
const bump = (k: string) => {
  const n = (seqs.get(k) ?? 0) + 1;
  seqs.set(k, n);
  return n;
};
/** Forgets the per-field bookkeeping of one call, or of every call */
const forget = (callId?: string) => {
  for (const set of [waiting, inFlight, queued]) for (const k of [...set]) if (!callId || k.startsWith(`${callId}:`)) set.delete(k);
  for (const k of [...seqs.keys()]) if (!callId || k.startsWith(`${callId}:`)) seqs.delete(k);
};

/** A masked CRM value ("98•••••210") is only for showing; it is never sent back */
const masked = (v: string) => v.includes(MASK_CHAR);

export const useDetails = create<DetailsState>((set, get) => {
  const patchEntry = (callId: string, key: string, p: Partial<DetailEntry>) =>
    set((s) => {
      const d = s.byCall[callId];
      const e = d?.entries[key];
      if (!d || !e) return s;
      return { byCall: { ...s.byCall, [callId]: { ...d, entries: { ...d.entries, [key]: { ...e, ...p } } } } };
    });

  /**
   * Each field is saved on its own as soon as it's captured, so a dropped call loses nothing. A failed save is
   * tried again a few times; without a lead yet (an unknown number) the values stay here and go with the
   * disposition, which creates the lead.
   */
  const save = (callId: string, key: string, attempt = 0) => {
    const d = get().byCall[callId];
    const e = d?.entries[key];
    if (!d || !e) return;
    const timerKey = `${callId}:${key}`;
    if (!d.leadId) {
      waiting.add(timerKey);
      return patchEntry(callId, key, { save: 'idle' });
    }
    waiting.delete(timerKey);
    const pending = timers.get(timerKey);
    if (pending) clearTimeout(pending);
    timers.delete(timerKey);
    patchEntry(callId, key, { save: 'saving' });
    // One save per field at a time: this one goes once the one on its way is answered, with the value as it is then
    if (inFlight.has(timerKey)) {
      queued.add(timerKey);
      return;
    }
    const seq = bump(timerKey);
    inFlight.add(timerKey);
    // Declined clears the field; a confirmed masked value is left as the server has it
    const values: Record<string, string | null> = e.declined ? { [key]: null } : masked(e.value) ? {} : { [key]: e.value.trim() };
    api.leads
      .saveFields(d.leadId, { callUuid: d.callUuid, values, declined: e.declined ? [key] : [] })
      .then(() => {
        // A reply for a value since edited or saved again says nothing about the value now
        if (seqs.get(timerKey) === seq) patchEntry(callId, key, { save: 'saved' });
      })
      .catch(() => {
        if (seqs.get(timerKey) !== seq) return;
        if (attempt >= RETRY_MS.length) return patchEntry(callId, key, { save: 'failed' });
        timers.set(
          timerKey,
          setTimeout(() => save(callId, key, attempt + 1), RETRY_MS[attempt]),
        );
      })
      .finally(() => {
        inFlight.delete(timerKey);
        if (queued.delete(timerKey)) save(callId, key);
      });
  };

  /** The saves held back for want of a lead, now that the call has one */
  const flushWaiting = (callId: string) => {
    if (!get().byCall[callId]?.leadId) return;
    for (const k of [...waiting]) if (k.startsWith(`${callId}:`)) save(callId, k.slice(callId.length + 1));
  };

  return {
    byCall: {},
    init: (callId, fields, values, ids) => {
      set((s) => {
        const prev = s.byCall[callId];
        const entries: Record<string, DetailEntry> = {};
        for (const f of fields) {
          // Keep anything the agent already did (the context can load twice when the campaign resolves late)
          const had = prev?.entries[f.key];
          const v = values[f.key] ?? '';
          entries[f.key] = had ?? { value: v, prefilled: !!v, confirmed: false, declined: false, save: 'idle' };
        }
        return {
          byCall: {
            ...s.byCall,
            [callId]: { fields, entries, leadId: ids.leadId ?? prev?.leadId ?? null, callUuid: ids.callUuid ?? prev?.callUuid ?? null },
          },
        };
      });
      flushWaiting(callId);
    },
    setIds: (callId, ids) => {
      set((s) => {
        const d = s.byCall[callId];
        if (!d) return s;
        return { byCall: { ...s.byCall, [callId]: { ...d, leadId: ids.leadId ?? d.leadId, callUuid: ids.callUuid ?? d.callUuid } } };
      });
      flushWaiting(callId);
    },
    setValue: (callId, key, value) => {
      // Typing again: what was held back, or is on its way, is no longer the value; the next commit saves the new one
      waiting.delete(`${callId}:${key}`);
      queued.delete(`${callId}:${key}`);
      bump(`${callId}:${key}`);
      patchEntry(callId, key, { value, confirmed: true, prefilled: false, declined: false, save: 'idle' });
    },
    commit: (callId, key) => {
      const d = get().byCall[callId];
      const f = d?.fields.find((x) => x.key === key);
      const e = d?.entries[key];
      if (!f || !e || !e.value.trim() || detailError(f, e.value)) return;
      save(callId, key);
    },
    confirm: (callId, key) => {
      patchEntry(callId, key, { confirmed: true });
      save(callId, key);
    },
    setDeclined: (callId, key, declined) => {
      patchEntry(callId, key, { declined, confirmed: declined ? false : (get().byCall[callId]?.entries[key]?.confirmed ?? false) });
      save(callId, key);
    },
    saveUnsaved: (callId) => {
      const d = get().byCall[callId];
      if (!d?.leadId) return;
      for (const f of d.fields) {
        const e = d.entries[f.key];
        if (e && (e.save === 'idle' || e.save === 'failed') && isCaptured(f, e)) save(callId, f.key);
      }
    },
    drop: (callId) =>
      set((s) => {
        for (const [k, t] of timers) if (k.startsWith(`${callId}:`)) clearTimeout(t);
        forget(callId);
        const { [callId]: _gone, ...byCall } = s.byCall;
        return { byCall };
      }),
    clear: () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      forget();
      set({ byCall: {} });
    },
  };
});

/** What the disposition carries for a call without a lead: the captured values, to create the lead with */
export function capturedValues(callId: string): Record<string, string> {
  const d = useDetails.getState().byCall[callId];
  const out: Record<string, string> = {};
  if (!d) return out;
  for (const f of d.fields) {
    const e = d.entries[f.key];
    if (e && !e.declined && e.confirmed && e.value.trim() && !masked(e.value)) out[f.key] = e.value.trim();
  }
  return out;
}
