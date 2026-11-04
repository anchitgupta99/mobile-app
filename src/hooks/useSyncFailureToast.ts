import { router } from 'expo-router';
import { useEffect } from 'react';
import { notify } from '@/components/feedback';
import { useOutbox } from '@/store/outbox';

/** Saves are local-first, so a server rejection only shows up later. Tell the agent the moment one happens. */
export function useSyncFailureToast() {
  useEffect(
    () =>
      useOutbox.subscribe((s, prev) => {
        const seen = new Set(prev.items.filter((i) => i.error).map((i) => i.key));
        const fresh = s.items.filter((i) => i.error && !seen.has(i.key));
        if (!fresh.length) return;
        notify(fresh.length === 1 ? `Couldn't sync ${fresh[0].label}` : `${fresh.length} changes couldn't sync`, 'error', {
          label: 'Review',
          onPress: () => router.push('/sync'),
        });
      }),
    [],
  );
}
