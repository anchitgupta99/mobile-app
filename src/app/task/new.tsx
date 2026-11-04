import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notify } from '@/components/feedback';
import { PageHeader } from '@/components/PageHeader';
import { Avatar, Button, Field, IconButton, Pill, Segmented, T } from '@/components/ui';
import { formatWhen, uid } from '@/domain/format';
import type { TaskKind } from '@/domain/types';
import { useConfirmDiscard } from '@/hooks/useConfirmDiscard';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/store/data';
import { useTheme } from '@/theme';
import { keyboardBehavior } from '@/components/keyboard';

function quick(now: Date) {
  const t = new Date(now);
  t.setDate(t.getDate() + 1);
  t.setHours(10, 0, 0, 0);
  const inHour = new Date(now.getTime() + 3600000);
  inHour.setMinutes(Math.ceil(inHour.getMinutes() / 15) * 15, 0, 0);
  const week = new Date(t);
  week.setDate(week.getDate() + 6);
  return [
    { label: 'In 1 hour', at: inHour },
    { label: 'Tomorrow 10 AM', at: t },
    { label: 'Next week', at: week },
  ];
}

export default function NewTask() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ contactId?: string }>();
  const contacts = useData((s) => s.contacts);
  const upsertTask = useData((s) => s.upsertTask);
  const [kind, setKind] = useState<Exclude<TaskKind, 'missed'>>('callback');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [contactId, setContactId] = useState<string | null>(params.contactId ?? null);
  const [q, setQ] = useState('');
  const opts = useMemo(() => quick(new Date()), []);
  const [due, setDue] = useState<Date>(opts[1].at);
  const contact = contacts.find((x) => x.id === contactId);
  const dirty =
    !!title.trim() ||
    !!notes.trim() ||
    contactId !== (params.contactId ?? null) ||
    kind !== 'callback' ||
    due.getTime() !== opts[1].at.getTime();
  // A callback in the past would be overdue the moment it is saved; never nudge below "now"
  const earliest = useNow(60000);
  const nudge = (ms: number) => setDue(new Date(Math.max(earliest, due.getTime() + ms)));
  const { allow } = useConfirmDiscard(dirty, 'this callback');
  const matches = q.length > 1 ? contacts.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 4) : [];

  const save = () => {
    upsertTask({
      id: uid('tk'),
      kind,
      title: title.trim() || (kind === 'callback' ? 'Callback' : 'Reminder'),
      contactId,
      number: contact?.phone ?? null,
      dueAt: new Date(Math.max(due.getTime(), Date.now())).toISOString(),
      slaDueAt: null,
      notes: notes.trim(),
      done: false,
      createdFromCallId: null,
      updatedAt: new Date().toISOString(),
    });
    notify('Callback added', 'success');
    allow();
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={{ flex: 1, backgroundColor: c.page }}>
      <PageHeader title="New callback" close />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }} keyboardShouldPersistTaps="handled">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'callback', label: 'Callback', icon: 'phone-callback' },
            { value: 'reminder', label: 'Reminder', icon: 'notifications' },
          ]}
        />
        {contact ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: c.surface,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Avatar name={contact.name} size={40} />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong">{contact.name}</T>
              <T v="caption">{contact.company}</T>
            </View>
            <IconButton icon="close" label="Remove contact" variant="plain" size={40} onPress={() => setContactId(null)} />
          </View>
        ) : (
          <View style={{ gap: 6 }}>
            <Field label="Contact" icon="person-search" placeholder="Search by name" value={q} onChangeText={setQ} />
            {matches.map((m) => (
              <Pressable
                key={m.id}
                accessibilityRole="button"
                onPress={() => {
                  setContactId(m.id);
                  setQ('');
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, minHeight: 52 }}
              >
                <Avatar name={m.name} size={32} />
                <T v="bodyStrong">{m.name}</T>
                <T v="caption">{m.company}</T>
              </Pressable>
            ))}
          </View>
        )}
        <Field label="What to do" placeholder="e.g. Share revised EMI options" value={title} onChangeText={setTitle} />
        <View style={{ gap: 10 }}>
          <T v="label">When</T>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {opts.map((o) => (
              <Pill key={o.label} label={o.label} active={o.at.getTime() === due.getTime()} onPress={() => setDue(o.at)} />
            ))}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: c.selected,
              borderRadius: 10,
              padding: 8,
              paddingLeft: 14,
            }}
          >
            <T v="bodyStrong" style={{ flex: 1 }} nums>
              {formatWhen(due.toISOString())}
            </T>
            <IconButton icon="remove" label="30 minutes earlier" size={40} onPress={() => nudge(-1800000)} />
            <IconButton icon="add" label="30 minutes later" size={40} onPress={() => nudge(1800000)} />
          </View>
        </View>
        <Field label="Notes" multiline value={notes} onChangeText={setNotes} />
      </ScrollView>
      <View
        style={{ padding: 16, paddingBottom: insets.bottom + 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.divider }}
      >
        <Button label="Save callback" icon="check" size="lg" full onPress={save} />
      </View>
    </KeyboardAvoidingView>
  );
}
