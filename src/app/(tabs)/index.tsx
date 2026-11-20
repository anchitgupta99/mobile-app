import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { notify } from '@/components/feedback';
import { Dashboard } from '@/components/Dashboard';
import { ListPlaceholder } from '@/components/ListPlaceholder';
import { TaskRow, useTaskActions } from '@/components/TaskRow';
import { Card, Divider, EmptyState, Icon, SectionHeader, T } from '@/components/ui';
import { useRefresh } from '@/hooks/useRefresh';
import { useData } from '@/store/data';
import { useOutbox } from '@/store/outbox';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function Home() {
  const { c } = useTheme();
  const agent = useSession((s) => s.agent);
  const tasks = useData((s) => s.tasks);
  const { refreshing, onRefresh: refreshData } = useRefresh();
  // Pull-to-refresh also refetches the dashboard numbers, which don't come from the data sync
  const [statsKey, setStatsKey] = useState(0);
  const onRefresh = () => {
    setStatsKey((n) => n + 1);
    refreshData();
  };
  const pending = useOutbox((s) => s.items.length);
  const { callTask, snooze } = useTaskActions();

  const next = useMemo(
    () =>
      tasks
        .filter((t) => !t.done)
        .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
        .slice(0, 3),
    [tasks],
  );

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.violet} />}
    >
      <View style={{ gap: 2, paddingHorizontal: 4 }}>
        <T v="title" accessibilityRole="header">
          {greeting()}, {agent?.name.split(' ')[0]}
        </T>
        {/* The campaign the agent is working; the server has no team for an agent */}
        {!!agent?.campaignName && (
          <T v="body" color={c.ink2}>
            {agent.campaignName}
          </T>
        )}
      </View>

      {pending > 0 && (
        <Card onPress={() => router.push('/sync')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="cloud-upload" color={c.purple} />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">{pending} waiting to sync</T>
            <T v="caption">Sending now…</T>
          </View>
          <Icon name="chevron-right" color={c.ink3} />
        </Card>
      )}

      <Dashboard refreshKey={statsKey} />

      <View>
        <SectionHeader title="Next callbacks" action="See all" onAction={() => router.push('/callbacks')} />
        <Card padded={false}>
          {next.length === 0 ? (
            <ListPlaceholder
              count={3}
              empty={<EmptyState icon="task-alt" title="All caught up" body="No callbacks due. New callbacks appear here." />}
            />
          ) : (
            next.map((t, i) => (
              <View key={t.id}>
                {i > 0 && <Divider inset={68} />}
                <TaskRow
                  task={t}
                  onCall={() => callTask(t)}
                  onSnooze={() => {
                    snooze(t);
                    notify('Snoozed for 1 hour', 'neutral', { label: 'Undo', onPress: () => useData.getState().upsertTask(t) });
                  }}
                />
              </View>
            ))
          )}
        </Card>
      </View>
    </ScrollView>
  );
}
