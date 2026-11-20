import type { CaptureField, Disposition, DispositionCategory } from './types';

/** What the agent has done with one required detail on a call */
export type DetailEntry = {
  value: string;
  /** Came from the CRM: shown as "Name: Rahul ✓" until the agent confirms or edits it */
  prefilled: boolean;
  /** Confirmed a prefilled value, or typed one */
  confirmed: boolean;
  /** "Customer declined to share" */
  declined: boolean;
  save: 'idle' | 'saving' | 'saved' | 'failed';
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Why a value isn't usable yet, or null. Empty is not an error here; missing required ones are counted apart. */
export function detailError(field: CaptureField, value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (field.type === 'email' && !EMAIL.test(v)) return 'Enter a valid email, like name@example.com';
  if (field.type === 'phone') {
    const digits = v.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return 'Enter a valid phone number';
  }
  if (field.type === 'dropdown' && field.options?.length && !field.options.includes(v)) return 'Pick one of the options';
  return null;
}

/** Captured: declined, or a valid value the agent typed or confirmed */
export function isCaptured(field: CaptureField, e: DetailEntry | undefined) {
  if (!e) return false;
  if (e.declined) return true;
  return !!e.value.trim() && e.confirmed && !detailError(field, e.value);
}

/** "1 of 2 captured": counts the required fields; with none required, all fields */
export function detailProgress(fields: CaptureField[], entries: Record<string, DetailEntry>) {
  const counted = fields.some((f) => f.required) ? fields.filter((f) => f.required) : fields;
  return {
    captured: counted.filter((f) => isCaptured(f, entries[f.key])).length,
    total: counted.length,
    requiredOnly: fields.some((f) => f.required),
  };
}

/** Captured and saved to the lead, or with its save on the way: what the CRM will have */
export function isStored(field: CaptureField, e: DetailEntry | undefined) {
  return isCaptured(field, e) && (e?.save === 'saved' || e?.save === 'saving');
}

/**
 * The required details not captured yet. `saved`: for a call with a lead, where each detail is saved to it on its
 * own, a value whose save hasn't gone through (not sent, or failed) doesn't count either: the CRM doesn't have it.
 */
export function missingRequired(fields: CaptureField[], entries: Record<string, DetailEntry>, opts?: { saved?: boolean }) {
  const counts = opts?.saved ? isStored : isCaptured;
  return fields.filter((f) => f.required && !counts(f, entries[f.key]));
}

/** The chosen outcome's category: its own, else the nearest parent's (path is top-level first) */
export function categoryOf(path: Disposition[]): DispositionCategory | undefined {
  for (let i = path.length - 1; i >= 0; i--) if (path[i].category) return path[i].category;
  return undefined;
}
