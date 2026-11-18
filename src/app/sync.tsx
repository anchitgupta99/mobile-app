import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alertDialog } from '@/components/feedback';
import { Button, Card, Divider, EmptyState, Icon, IconButton, T, type IconName } from '@/components/ui';
import { formatRelative } from '@/domain/format';
import { useData } from '@/store/data';
import { useOutbox, type OutboxItem } from '@/store/outbox';
import { useTheme } from '@/theme';

const icons: Record<OutboxItem['kind'], IconName> = {
  task: 'task-alt',
  contact: 'person',
  status: 'toggle-on',
};

function confirmDiscard(it: OutboxItem) {
  alertDialog({
    title: 'Discard this change?',
    message: `"${it.label}" will not be sent to the server.`,
    tone: 'warning',
    icon: 'delete-outline',
    actions: [
      { label: 'Keep', variant: 'outline' },
      { label: 'Discard', variant: 'danger', onPress: () => useOutbox.getState().discard(it.key) },
    ],
  });
}

export default function Sync() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useOutbox((s) => s.items);
  const syncing = useOutbox((s) => s.syncing);
  const lastError = useOutbox((s) => s.lastError);
  const lastSyncAt = useData((s) => s.lastSyncAt);
  const syncError = useData((s) => s.syncError);
  const refreshing = useData((s) => s.refreshing);

  return (
    <View style={{ flex: 1, backgroundColor: c.page, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 20, gap: 8 }}>
        <T v="title" style={{ flex: 1 }} accessibilityRole="header">
          Sync
        </T>
        <IconButton icon="close" label="Close" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 16 }}>
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Icon
            name={syncError ? 'sync-problem' : 'cloud-done'}
            color={syncError ? c.errorFg : c.successFg}
            size={28}
          />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">
              {syncing
                ? 'Syncing…'
                : items.some((i) => i.parked)
                  ? 'Some changes need your attention'
                  : items.length
                    ? 'Waiting to sync'
                    : 'Everything is synced'}
            </T>
            <T v="caption">{lastSyncAt ? `Last synced ${formatRelative(lastSyncAt)}` : 'Not synced yet'}</T>
            {(lastError || syncError) && (
              <T v="caption" color={c.errorFg}>
                {lastError ?? `Couldn't refresh: ${syncError}`}
              </T>
            )}
          </View>
        </Card>
        <Card padded={false}>
          {items.length === 0 ? (
            <EmptyState
              icon="cloud-done"
              title="Nothing waiting"
              body="Dispositions, notes and tasks save on your phone first, then sync here."
            />
          ) : (
            items.map((it, i) => (
              <View key={it.key}>
                {i > 0 && <Divider inset={56} />}
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14 }}>
                  <Icon name={it.error ? 'error-outline' : icons[it.kind]} color={it.error ? c.errorFg : c.purple} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong" numberOfLines={1}>
                      {it.label}
                    </T>
                    <T v="caption">
                      Saved {formatRelative(it.createdAt)}
                      {it.attempts ? ` · ${it.attempts} ${it.attempts === 1 ? 'try' : 'tries'}` : ''}
                    </T>
                    {!!it.error && (
                      <T v="caption" color={c.errorFg}>
                        Server rejected it: {it.error}
                      </T>
                    )}
                    {it.parked && (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <Button label="Retry" variant="outline" size="sm" onPress={() => useOutbox.getState().retry(it.key)} />
                        <Button label="Discard" variant="ghost" size="sm" onPress={() => confirmDiscard(it)} />
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ))
          )}
        </Card>
        <Button
          label="Sync now"
          icon="sync"
          full
          loading={syncing || refreshing}
          onPress={() => void useData.getState().sync()}
        />
      </ScrollView>
    </View>
  );
}
