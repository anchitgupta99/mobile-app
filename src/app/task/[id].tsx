import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispositionLabel } from '@/components/CallCard';
import { notify } from '@/components/feedback';
import { ModeBadge } from '@/components/ModeBadge';
import { ItemNotFound } from '@/components/ItemNotFound';
import { PageHeader } from '@/components/PageHeader';
import { PhoneText } from '@/components/PhoneText';
import { Avatar, Button, Card, Divider, Icon, Pill, SectionHeader, StatusChip, T, type IconName } from '@/components/ui';
import { formatRelative, formatWhen } from '@/domain/format';
import { useDial } from '@/hooks/useDial';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/store/data';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';
import { InfoTip } from '@/components/InfoTip';
import { helpText } from '@/domain/helpText';

function Fact({ icon, label, value, tip }: { icon: IconName; label: string; value: string; tip?: { title: string; text: string } }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <Icon name={icon} size={20} color={c.ink2} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T v="caption">{label}</T>
          {tip && <InfoTip {...tip} size={14} />}
        </View>
        <T v="body">{value}</T>
      </View>
    </View>
  );
}

export default function TaskPreview() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow(60000);
  const task = useData((s) => s.tasks.find((t) => t.id === id));
  const contact = useData((s) => s.contacts.find((x) => x.id === task?.contactId));
  const calls = useData((s) => s.calls);
  const completeTask = useData((s) => s.completeTask);
  const snoozeTask = useData((s) => s.snoozeTask);
  const mode = useSettings((s) => s.callMode);
  const dial = useDial();
  const dispositionLabel = useDispositionLabel();
  // Opened from a deep link there is nothing behind this screen; land on the list instead of a dead tap
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/callbacks'));

  const lastCall = useMemo(
    () => (contact ? calls.filter((x) => x.contactId === contact.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] : undefined),
    [calls, contact],
  );

  if (!task) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <PageHeader title="Callback" />
        <ItemNotFound icon="task-alt" title="Callback not found" body="It may have been completed on another device." />
      </View>
    );
  }

  const number = contact?.phone ?? task.number;
  const overdue = !task.done && new Date(task.dueAt).getTime() < now;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <PageHeader title="Callback" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <Card style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <Avatar name={contact?.name ?? task.name ?? '#'} size={56} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="h2">{contact?.name ?? task.name ?? 'Unknown number'}</T>
              {contact && (
                <T v="caption">
                  {contact.company} · {contact.city}
                </T>
              )}
              {/* As the server shows it (masked per campaign); Call dials the real number */}
              {number && <PhoneText number={contact ? number : (task.displayNumber ?? number)} v="caption" />}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <StatusChip
              tone={task.kind === 'missed' ? 'error' : task.kind === 'callback' ? 'info' : 'purple'}
              label={task.kind === 'missed' ? 'Missed call' : task.kind === 'callback' ? 'Callback' : 'Reminder'}
            />
            {task.done ? (
              <StatusChip tone="success" icon="check" label="Done" />
            ) : overdue ? (
              <StatusChip tone="error" label={`Overdue ${formatRelative(task.dueAt)}`} />
            ) : (
              <StatusChip tone="neutral" label={`Due ${formatRelative(task.dueAt)}`} />
            )}
            {contact?.dnc && (
              <InfoTip {...helpText.dnc}>
                <StatusChip tone="error" icon="block" label="Do not call" />
              </InfoTip>
            )}
            {contact?.tags.map((t) => (
              <StatusChip key={t} tone="warning" label={t} />
            ))}
          </View>
          <Divider />
          <Fact icon="flag" label="Task" value={task.title} />
          <Fact icon="event" label="Due" value={formatWhen(task.dueAt)} />
          {task.slaDueAt && <Fact icon="timer" label="Call-back SLA" value={formatWhen(task.slaDueAt)} tip={helpText.sla} />}
          {!!task.notes && <Fact icon="notes" label="Notes" value={task.notes} />}
          <Fact
            icon="history"
            label="Last contact"
            value={
              lastCall
                ? `${formatWhen(lastCall.startedAt)} · ${dispositionLabel(lastCall.disposition) ?? (lastCall.outcome === 'missed' ? 'Missed' : 'Not dispositioned')}`
                : 'No calls yet'
            }
          />
          {lastCall?.notes ? <Fact icon="sticky-note-2" label="Last notes" value={lastCall.notes} /> : null}
        </Card>

        {!task.done && (
          <View>
            <SectionHeader title="Snooze" />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[
                ['15 min', 15],
                ['1 hour', 60],
                ['3 hours', 180],
                ['Tomorrow', 24 * 60],
              ].map(([label, m]) => (
                <Pill
                  key={label}
                  label={String(label)}
                  icon="snooze"
                  onPress={() => {
                    const before = task;
                    snoozeTask(task.id, Number(m));
                    notify(`Snoozed ${label === 'Tomorrow' ? 'until tomorrow' : `for ${label}`}`, 'neutral', {
                      label: 'Undo',
                      onPress: () => useData.getState().upsertTask(before),
                    });
                    leave();
                  }}
                />
              ))}
            </View>
          </View>
        )}
        {contact && <Button label="Open contact" icon="person" variant="ghost" onPress={() => router.push(`/contact/${contact.id}`)} />}
      </ScrollView>

      <View
        style={{
          padding: 16,
          paddingBottom: insets.bottom + 12,
          gap: 10,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.divider,
        }}
      >
        {!task.done && number && !contact?.dnc && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            <T v="caption">Calls from your company number ·</T>
            <ModeBadge mode={mode} />
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label={task.done ? 'Reopen' : 'Mark done'}
            icon={task.done ? 'undo' : 'check'}
            variant="outline"
            style={{ flex: 1 }}
            onPress={() => {
              const before = task;
              completeTask(task.id);
              if (!task.done) {
                notify('Callback done', 'success', { label: 'Undo', onPress: () => useData.getState().upsertTask(before) });
                leave();
              }
            }}
          />
          {!task.done && number && (
            <Button
              label="Call now"
              icon="call"
              variant="call"
              style={{ flex: 1.4 }}
              disabled={contact?.dnc}
              onPress={() => void dial({ number, contactId: contact?.id ?? null, source: 'task', taskId: task.id })}
            />
          )}
        </View>
      </View>
    </View>
  );
}
