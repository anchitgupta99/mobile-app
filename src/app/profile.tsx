import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuLine } from '@/components/AppMenu';
import { alertDialog, notify } from '@/components/feedback';
import { keyboardBehavior } from '@/components/keyboard';
import { PageHeader } from '@/components/PageHeader';
import { Avatar, Button, Card, Divider, Field, IconButton, SectionHeader, T } from '@/components/ui';
import { useConfirmDiscard } from '@/hooks/useConfirmDiscard';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

function Fact({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
      <T v="body" color={c.ink2} style={{ width: 110 }}>
        {label}
      </T>
      <T v="bodyStrong" style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

export default function Profile() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const agent = useSession((s) => s.agent);
  const loginMode = useSession((s) => s.loginMode);
  const updateAgent = useSession((s) => s.updateAgent);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', phone: '' });

  const dirty = editing && !!agent && (draft.name !== agent.name || draft.email !== agent.email || draft.phone !== agent.phone);
  useConfirmDiscard(dirty);

  if (!agent)
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <PageHeader title="Profile" />
      </View>
    );

  const startEdit = () => {
    setDraft({ name: agent.name, email: agent.email, phone: agent.phone });
    setEditing(true);
  };

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={{ flex: 1, backgroundColor: c.page }}>
      <PageHeader
        title="Profile"
        right={!editing ? <IconButton icon="edit" label="Edit profile" variant="topbar" size={40} onPress={startEdit} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 20 }}>
          <Avatar name={agent.name} size={72} />
          <T v="h2" style={{ marginTop: 8 }}>
            {agent.name}
          </T>
          <T v="body" color={c.ink2}>
            {agent.team}
          </T>
        </Card>

        {editing ? (
          <View style={{ gap: 14 }}>
            <Field label="Full name" value={draft.name} onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))} />
            <Field
              label="Email"
              value={draft.email}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(v) => setDraft((d) => ({ ...d, email: v }))}
            />
            <Field
              label="Mobile number"
              value={draft.phone}
              keyboardType="phone-pad"
              onChangeText={(v) => setDraft((d) => ({ ...d, phone: v }))}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label="Cancel"
                variant="outline"
                style={{ flex: 1 }}
                onPress={() =>
                  dirty
                    ? alertDialog({
                        title: 'Discard changes?',
                        message: "Your edits to your profile won't be saved.",
                        tone: 'warning',
                        icon: 'delete-outline',
                        actions: [
                          { label: 'Keep editing', variant: 'outline' },
                          { label: 'Discard', variant: 'danger', onPress: () => setEditing(false) },
                        ],
                      })
                    : setEditing(false)
                }
              />
              <Button
                label="Save"
                icon="check"
                style={{ flex: 1 }}
                disabled={!draft.name.trim()}
                onPress={() => {
                  updateAgent({ name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim() });
                  setEditing(false);
                  notify('Profile updated', 'success');
                }}
              />
            </View>
          </View>
        ) : (
          <View>
            <SectionHeader title="Details" />
            <Card padded={false}>
              <Fact label="Email" value={agent.email} />
              <Divider />
              <Fact label="Mobile" value={agent.phone} />
              <Divider />
              <Fact label="Login ID" value={agent.loginId} />
              <Divider />
              <Fact label="Login type" value={loginMode === 'mobile' ? 'Mobile' : 'SIP'} />
              <Divider />
              <Fact label="Extension" value={agent.extension} />
              <Divider />
              <Fact label="Campaign" value={agent.campaignName} />
            </Card>
          </View>
        )}

        <View>
          <SectionHeader title="Diagnostics" />
          <Card padded={false}>
            <MenuLine
              icon="health-and-safety"
              title="Run checks again"
              body="Internet, webphone, headset & microphone"
              onPress={() => router.push('/diagnostics')}
            />
          </Card>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
