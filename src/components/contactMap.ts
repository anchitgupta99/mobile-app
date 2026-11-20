import type { Contact } from '@/domain/types';

// Built once per contacts array (the store replaces the array on every change), so list rows and search look a contact
// up by id in O(1) instead of each running contacts.find on every render or keystroke
const cache = new WeakMap<Contact[], Map<string, Contact>>();

export function contactMapOf(contacts: Contact[]): Map<string, Contact> {
  let m = cache.get(contacts);
  if (!m) {
    m = new Map(contacts.map((c) => [c.id, c]));
    cache.set(contacts, m);
  }
  return m;
}

/** For zustand selectors: `useData((s) => contactById(s.contacts, id))` */
export const contactById = (contacts: Contact[], id: string | null | undefined) => (id ? contactMapOf(contacts).get(id) : undefined);
