import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { notify } from '@/components/feedback';
import { ItemNotFound } from '@/components/ItemNotFound';
import { PageHeader } from '@/components/PageHeader';
import { PhoneText } from '@/components/PhoneText';
import { Avatar, Button, Card, Icon, IconButton, Pill, SectionHeader, StatusChip, T, type IconName } from '@/components/ui';
import { formatWhen } from '@/domain/format';
import type { TimelineEvent } from '@/domain/types';
import { useDial } from '@/hooks/useDial';
import { useSecureScreen } from '@/hooks/useSecureScreen';
import { useData } from '@/store/data';
import { useTheme } from '@/theme';
import { InfoTip } from '@/components/InfoTip';
import { helpText } from '@/domain/helpText';

const kindIcon: Record<TimelineEvent['kind'], IconName> = {
  call: 'call',
  note: 'sticky-note-2',
  task: 'task-alt',
  field: 'edit',
};

type Filter = 'all' | TimelineEvent['kind'];

function QuickAction({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 6, flex: 1, opacity: disabled ? 0.4 : 1 }}>
      <IconButton icon={icon} label={label} variant="filled" size={52} onPress={disabled ? undefined : onPress} />
      <T v="caption" color={c.ink}>
        {label}
      </T>
    </View>
  );
}

export default function ContactScreen() {
  useSecureScreen('contact');
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const contact = useData((s) => s.contacts.find((x) => x.id === id));
  const timeline = useData((s) => s.timeline);
  const tasks = useData((s) => s.tasks);
  const dial = useDial();
  const [filter, setFilter] = useState<Filter>('all');

  const events = useMemo(
    () => timeline.filter((t) => t.contactId === id && (filter === 'all' || t.kind === filter)).sort((a, b) => b.at.localeCompare(a.at)),
    [timeline, id, filter],
  );
  const openTasks = tasks.filter((t) => t.contactId === id && !t.done);

  if (!contact) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <PageHeader title="Contact" />
        <ItemNotFound icon="person-off" title="Contact not found" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <PageHeader title={contact.name} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <Card style={{ alignItems: 'center', gap: 6, paddingVertical: 20 }}>
          <Avatar name={contact.name} size={72} />
          <T v="h2" style={{ marginTop: 6 }}>
            {contact.name}
          </T>
          <T v="body" color={c.ink2}>
            {contact.company} · {contact.city}
          </T>
          <PhoneText number={contact.phone} v="caption" />
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {contact.dnc && (
              <InfoTip {...helpText.dnc}>
                <StatusChip tone="error" icon="block" label="Do not call" />
              </InfoTip>
            )}
            {contact.lastDisposition && <StatusChip tone="neutral" label={`Last: ${contact.lastDisposition}`} />}
            {contact.tags.map((t) => (
              <StatusChip key={t} tone="warning" label={t} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', marginTop: 14, alignSelf: 'stretch' }}>
            <QuickAction
              icon="call"
              label="Call"
              disabled={contact.dnc}
              onPress={() => void dial({ number: contact.phone, contactId: contact.id, source: 'contact' })}
            />
            <QuickAction
              icon="alarm-add"
              label="Callback"
              onPress={() => router.push({ pathname: '/task/new', params: { contactId: contact.id } })}
            />
            <QuickAction
              icon="mail-outline"
              label="Email"
              disabled={!contact.email}
              onPress={() => void Linking.openURL(`mailto:${contact.email}`).catch(() => notify('Could not open your mail app', 'warning'))}
            />
          </View>
        </Card>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          <Icon name="lock-outline" size={16} color={c.ink3} />
          <T v="caption" color={c.ink3} style={{ flex: 1 }}>
            Contact details are read-only. They can only be updated during a live call.
          </T>
        </View>

        {openTasks.length > 0 && (
          <View>
            <SectionHeader title="Open callbacks" count={openTasks.length} />
            <Card padded={false}>
              {openTasks.map((t) => (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
                  <Icon name="event" color={c.purple} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{t.title}</T>
                    <T v="caption">{formatWhen(t.dueAt)}</T>
                  </View>
                  <Button label="Open" size="sm" variant="secondary" onPress={() => router.push(`/task/${t.id}`)} />
                </View>
              ))}
            </Card>
          </View>
        )}

        <View>
          <SectionHeader title="Timeline" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {(
              [
                ['all', 'All'],
                ['call', 'Calls'],
                ['note', 'Notes'],
                ['task', 'Tasks'],
                ['field', 'Changes'],
              ] as [Filter, string][]
            ).map(([v, l]) => (
              <Pill key={v} label={l} active={filter === v} onPress={() => setFilter(v)} />
            ))}
          </ScrollView>
          <Card>
            {events.length === 0 ? (
              <T v="body" color={c.ink2}>
                Nothing here yet.
              </T>
            ) : (
              events.map((e, i) => (
                <View key={e.id} style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: c.lavenderSoft,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Icon name={kindIcon[e.kind]} size={16} color={c.purple} />
                    </View>
                    {i < events.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: c.divider, marginVertical: 4 }} />}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < events.length - 1 ? 18 : 0, gap: 2 }}>
                    <T v="bodyStrong">{e.title}</T>
                    <T v="caption" color={c.ink3}>
                      {formatWhen(e.at)}
                    </T>
                    {!!e.detail && (
                      <T v="body" color={c.ink2} style={{ marginTop: 2 }}>
                        {e.detail}
                      </T>
                    )}
                  </View>
                </View>
              ))
            )}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}
