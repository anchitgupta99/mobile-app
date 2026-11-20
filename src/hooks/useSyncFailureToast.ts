import { router } from 'expo-router';
import { useEffect } from 'react';
import { notify } from '@/components/feedback';
import { useOutbox } from '@/store/outbox';

/**
 * Tells the agent the moment a change is turned down: each change is sent once, straight away, and its failure
 * reads as the web's (the change is undone by whoever made it). The second toast, with Review, is only for changes
 * an older build left queued on the phone, when a retry from the Sync screen is turned down again.
 */
export function useSyncFailureToast() {
  useEffect(
    () =>
      useOutbox.subscribe((s, prev) => {
        if (s.failure && s.failure !== prev.failure) {
          notify(s.failure.message, 'error', undefined, s.failure.title ? { title: s.failure.title } : undefined);
          return;
        }
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
