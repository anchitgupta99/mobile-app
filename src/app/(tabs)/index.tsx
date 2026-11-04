import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { realtime } from '@/api/realtime';
import { useNetwork } from '@/api/network';
import { notify } from '@/components/feedback';
import { Dashboard } from '@/components/Dashboard';
import { ListPlaceholder } from '@/components/ListPlaceholder';
import { TaskRow, useTaskActions } from '@/components/TaskRow';
import { Button, Card, Divider, EmptyState, Icon, SectionHeader, Segmented, T } from '@/components/ui';
import { useRefresh } from '@/hooks/useRefresh';
import { IS_DEMO } from '@/mocks/demo';
import { startQueueSimulator, stopQueueSimulator } from '@/mocks/queueSimulator';
import { useData } from '@/store/data';
import { useOutbox } from '@/store/outbox';
import { useSession } from '@/store/session';
import { simulateIncoming } from '@/telephony/simulator';
import { font, useTheme } from '@/theme';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// Last count the server pushed. Kept outside the component so the tile shows it again after a tab
// switch instead of resetting; a realtime push is the only thing that ever changes it.
let lastWaiting = 0;

function useQueue() {
  const [waiting, setWaiting] = useState(lastWaiting);
  useEffect(
    () =>
      realtime.on('queue.updated', ({ waiting: w }) => {
        lastWaiting = w;
        setWaiting(w);
      }),
    [],
  );
  return waiting;
}

function DemoControls() {
  const { c } = useTheme();
  const status = useSession((s) => s.status);
  const quality = useNetwork((s) => s.quality);
  const setQuality = useNetwork((s) => s.setQuality);
  // Starts with the controls (effect below), so the toggle begins in the "on" position
  const [queueSim, setQueueSim] = useState(true);

  // The fake queue feed only exists in the demo build; it starts with the controls and keeps
  // running across tabs so the "In queue" tile stays live
  useEffect(() => {
    startQueueSimulator();
  }, []);

  return (
    <View>
      <SectionHeader title="Demo controls" />
      <Card style={{ gap: 12, borderStyle: 'dashed' }}>
        <T v="caption">Simulate events from the backend to try the call loop.</T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button
            label="Incoming call"
            icon="ring-volume"
            variant="secondary"
            size="sm"
            style={{ flex: 1 }}
            onPress={() => {
              if (status !== 'available') notify('Go online to receive calls', 'warning');
              else simulateIncoming();
            }}
          />
          <Button
            label="App unreachable"
            icon="sim-card"
            variant="outline"
            size="sm"
            style={{ flex: 1 }}
            onPress={() => {
              if (status !== 'available') return notify('Go online to receive calls', 'warning');
              notify('VoIP push not acknowledged… ringing your phone line in 5 s', 'info');
              simulateIncoming({ appUnreachable: true });
            }}
          />
        </View>
        <Button
          label={queueSim ? 'Stop fake queue updates' : 'Start fake queue updates'}
          icon={queueSim ? 'pause' : 'groups'}
          variant="outline"
          size="sm"
          onPress={() => {
            if (queueSim) stopQueueSimulator();
            else startQueueSimulator();
            setQueueSim(!queueSim);
          }}
        />
        <View style={{ gap: 6 }}>
          <T v="label" color={c.ink2} style={{ fontFamily: font.semibold }}>
            Network
          </T>
          <Segmented
            value={quality}
            onChange={setQuality}
            options={[
              { value: 'good', label: 'Good', icon: 'wifi' },
              { value: 'weak', label: 'Weak', icon: 'network-check' },
              { value: 'offline', label: 'Offline', icon: 'cloud-off' },
            ]}
          />
        </View>
      </Card>
    </View>
  );
}

export default function Home() {
  const { c } = useTheme();
  const agent = useSession((s) => s.agent);
  const tasks = useData((s) => s.tasks);
  const { refreshing, onRefresh } = useRefresh();
  const pending = useOutbox((s) => s.items.length);
  const quality = useNetwork((s) => s.quality);
  const waiting = useQueue();
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
        <T v="body" color={c.ink2}>
          {agent?.campaignName} · {agent?.team}
        </T>
      </View>

      {pending > 0 && (
        <Card onPress={() => router.push('/sync')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name={quality === 'offline' ? 'cloud-off' : 'cloud-upload'} color={c.purple} />
          <View style={{ flex: 1 }}>
            <T v="bodyStrong">{pending} waiting to sync</T>
            <T v="caption">{quality === 'offline' ? 'Saved on this phone. Syncs when you are back online.' : 'Sending now…'}</T>
          </View>
          <Icon name="chevron-right" color={c.ink3} />
        </Card>
      )}

      <Dashboard queue={waiting} />

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

      {IS_DEMO && <DemoControls />}
    </ScrollView>
  );
}
