import { useCallback } from 'react';
import { notify } from '@/components/feedback';
import { useData } from '@/store/data';

/** Pull-to-refresh that tells the agent when it fails instead of silently keeping old data. */
export function useRefresh() {
  const refreshing = useData((s) => s.refreshing);
  const onRefresh = useCallback(async () => {
    const ok = await useData.getState().sync();
    if (!ok) {
      const reason = useData.getState().syncError;
      notify(`Couldn't refresh${reason ? `: ${reason.toLowerCase()}` : ''}`, 'error', {
        label: 'Retry',
        onPress: () => void useData.getState().sync(),
      });
    }
  }, []);
  return { refreshing, onRefresh: () => void onRefresh() };
}

/** True until the first successful sync, so lists can show placeholders instead of "nothing here". */
export function useFirstLoad() {
  const lastSyncAt = useData((s) => s.lastSyncAt);
  const syncError = useData((s) => s.syncError);
  return { loading: !lastSyncAt && !syncError, failed: !lastSyncAt && !!syncError };
}
