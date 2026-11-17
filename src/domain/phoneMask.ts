/**
 * The web's phone masking (utils/phoneMask.ts and hooks/usePhoneMask.ts there), copied as is. The campaign's
 * CRM template says whether its phone field is masked and how (validation_rules: is_masked, mask_type,
 * unmask_count); the server sends that with the call's context, and the number is shown the way it says.
 */
export interface PhoneMaskRule {
  mask_type?: string;
  unmask_count?: number;
}

export const MASK_CHAR = '•';

const DIAL_KEYS = ['phone_number', 'phone_no', 'mobile_no', 'mobile', 'phone', 'contact_number'];

type CrmField = { field_key?: string; field_type?: string; validation_rules?: unknown };

const parseRules = (rules: unknown): { is_masked?: boolean; mask_type?: string; unmask_count?: number } | null => {
  if (typeof rules !== 'string') return (rules as { is_masked?: boolean } | null) ?? null;
  try {
    return JSON.parse(rules);
  } catch {
    return null;
  }
};

const toRule = (field: CrmField | undefined): PhoneMaskRule | null => {
  const rules = parseRules(field?.validation_rules);
  if (rules?.is_masked !== true) return null;
  return { mask_type: rules.mask_type ?? 'all', unmask_count: Number(rules.unmask_count ?? 0) };
};

const isPhoneLikeField = (field: CrmField): boolean => {
  const key = String(field?.field_key ?? '').toLowerCase();
  return field?.field_type === 'phone' || key.includes('phone') || key.includes('mobile');
};

/** The masking rule of the template's phone field, if it has one: the known phone keys first, then any phone-like field */
export function findPhoneMaskRule(groups: { fields?: CrmField[] | null }[] | null | undefined): PhoneMaskRule | null {
  const fields = (groups ?? []).flatMap((g) => g?.fields ?? []);
  for (const key of DIAL_KEYS) {
    const rule = toRule(fields.find((f) => f?.field_key === key));
    if (rule) return rule;
  }
  for (const field of fields) {
    if (!isPhoneLikeField(field)) continue;
    const rule = toRule(field);
    if (rule) return rule;
  }
  return null;
}

const normalizePhone = (value: string): string => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return value;
  return digits.length > 10 ? digits.slice(-10) : digits;
};

/** Shown while the campaign's rule isn't known yet, as the web does */
export function maskPhoneFully(value: string): string {
  if (!value) return value;
  return MASK_CHAR.repeat(normalizePhone(String(value)).length);
}

/** The number as the rule shows it; without a rule, as it is */
export function maskPhoneForDisplay(value: string, rule: PhoneMaskRule | null | undefined): string {
  if (!rule || !value) return value;
  const str = normalizePhone(String(value));
  const count = Math.max(0, Number(rule.unmask_count ?? 0));
  switch (rule.mask_type) {
    case 'start':
      if (str.length <= count) return str;
      return str.slice(0, count) + MASK_CHAR.repeat(str.length - count);
    case 'end':
      if (str.length <= count) return str;
      return MASK_CHAR.repeat(str.length - count) + str.slice(-count);
    case 'all':
    default:
      return MASK_CHAR.repeat(str.length);
  }
}
