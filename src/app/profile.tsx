import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type AgentProfile } from '@/api/client';
import { webText } from '@/api/errors';
import { MenuLine } from '@/components/AppMenu';
import { alertDialog, notify } from '@/components/feedback';
import { keyboardBehavior } from '@/components/keyboard';
import { PageHeader } from '@/components/PageHeader';
import { Avatar, Button, Card, Divider, Field, IconButton, SectionHeader, T } from '@/components/ui';
import { useConfirmDiscard } from '@/hooks/useConfirmDiscard';
import { findCampaign } from '@/store/campaigns';
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
        {value || '—'}
      </T>
    </View>
  );
}

/** The web's "Joined" date: month and year */
function joined(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * The agent's profile, as the web's profile window has it: the server's details (email, phone, role, supervisor,
 * joined), editing the name, email and phone, and changing the password, with the web's messages.
 */
export default function Profile() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const agent = useSession((s) => s.agent);
  const loginMode = useSession((s) => s.loginMode);
  const updateAgent = useSession((s) => s.updateAgent);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', email: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Backend: the profile from the server (null while loading); a failed load keeps the login's details and says
  // so, with Retry (bumps `reload`), since editing needs the server's copy
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const campaignId = agent?.campaignId;
  useEffect(() => {
    let gone = false;
    api.profile
      .get(campaignId)
      .then((p) => !gone && setProfile(p))
      .catch(() => !gone && setLoadFailed(true));
    return () => {
      gone = true;
    };
  }, [campaignId, reload]);

  // Guards read at tap time (render state lags a fast double tap)
  const savingRef = useRef(false);
  const pwSavingRef = useRef(false);

  // Change password, as the web's "Change Password"
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const shown = {
    name: profile?.fullName || agent?.name || '',
    email: profile?.email ?? agent?.email ?? '',
    phone: profile?.mobile ?? agent?.phone ?? '',
  };
  const dirty = editing && (draft.name !== shown.name || draft.email !== shown.email || draft.phone !== shown.phone);
  useConfirmDiscard(dirty || (pwOpen && !!(pw.current || pw.next || pw.confirm)));

  if (!agent)
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <PageHeader title="Profile" />
      </View>
    );

  // The web's role line: "Agent · Campaign (Dial type)"
  const campaign = findCampaign(agent.campaignId);
  const dialLabel = campaign?.dialType ? campaign.dialType.charAt(0) + campaign.dialType.slice(1).toLowerCase() : '';
  const roleLabel = profile?.roleLabel || 'Agent';
  const roleText = campaign ? `${roleLabel} · ${campaign.name}${dialLabel ? ` (${dialLabel})` : ''}` : roleLabel;

  const startEdit = () => {
    setDraft(shown);
    setEditError(null);
    setEditing(true);
  };

  const save = async () => {
    if (savingRef.current) return;
    const next = { name: draft.name.trim(), email: draft.email.trim(), phone: draft.phone.trim() };
    savingRef.current = true;
    setSaving(true);
    setEditError(null);
    try {
      const updated = await api.profile.update({ fullName: next.name, email: next.email, mobile: next.phone });
      // The update doesn't send the supervisor back; it stays as loaded
      setProfile((p) => ({ ...updated, supervisor: updated.supervisor || p?.supervisor || '' }));
      updateAgent({ name: updated.fullName || next.name, email: updated.email, phone: updated.mobile });
      setEditing(false);
      notify('Profile updated successfully', 'success', undefined, { title: 'Success' });
    } catch (e) {
      const message = webText(e, ['error'], 'Failed to save. Please try again.');
      setEditError(message);
      notify(message, 'error', undefined, { title: 'Error' });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (pwSavingRef.current) return;
    // Checked here first, so an empty or mistyped form isn't sent
    if (!pw.current || !pw.next || !pw.confirm) {
      setPwError('Please fill in all the password fields.');
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError('Passwords do not match');
      return;
    }
    setPwError(null);
    pwSavingRef.current = true;
    setPwSaving(true);
    try {
      await api.profile.changePassword({ currentPassword: pw.current, newPassword: pw.next, confirmPassword: pw.confirm });
      notify('Password changed successfully', 'success', undefined, { title: 'Success' });
      setPw({ current: '', next: '', confirm: '' });
      setPwOpen(false);
    } catch (e) {
      const message = webText(e, ['error'], 'Failed to change password.');
      setPwError(message);
      notify(message, 'error', undefined, { title: 'Error' });
    } finally {
      pwSavingRef.current = false;
      setPwSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={{ flex: 1, backgroundColor: c.page }}>
      <PageHeader
        title="Profile"
        right={
          !editing && profile ? (
            <IconButton icon="edit" label="Edit profile" variant="topbar" size={40} onPress={startEdit} />
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <Card style={{ alignItems: 'center', gap: 4, paddingVertical: 20 }}>
          <Avatar name={shown.name || agent.loginId} size={72} />
          <T v="h2" style={{ marginTop: 8 }}>
            {shown.name}
          </T>
          <T v="body" color={c.ink2}>
            {roleText}
          </T>
        </Card>

        {!profile && !loadFailed && (
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <ActivityIndicator color={c.purple} />
          </View>
        )}

        {!profile && loadFailed && (
          <Card style={{ gap: 10 }}>
            <T v="caption" color={c.errorFg}>
              {"Couldn't load your profile, so it can't be edited right now."}
            </T>
            <Button
              label="Retry"
              icon="refresh"
              variant="outline"
              size="sm"
              onPress={() => {
                setLoadFailed(false);
                setReload((n) => n + 1);
              }}
            />
          </Card>
        )}

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
              label="Phone"
              value={draft.phone}
              keyboardType="phone-pad"
              onChangeText={(v) => setDraft((d) => ({ ...d, phone: v }))}
            />
            {!!editError && (
              <T v="caption" color={c.errorFg}>
                {editError}
              </T>
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label="Cancel"
                variant="outline"
                style={{ flex: 1 }}
                disabled={saving}
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
                label={saving ? 'Saving...' : 'Save'}
                icon="check"
                style={{ flex: 1 }}
                loading={saving}
                disabled={!draft.name.trim() || saving}
                onPress={() => void save()}
              />
            </View>
          </View>
        ) : (
          <View>
            <SectionHeader title="Details" />
            <Card padded={false}>
              <Fact label="Email" value={shown.email} />
              <Divider />
              <Fact label="Phone" value={shown.phone} />
              <Divider />
              <Fact label="Role" value={roleText} />
              <Divider />
              <Fact label="Supervisor" value={profile?.supervisor ?? ''} />
              <Divider />
              <Fact label="Joined" value={joined(profile?.createdAt ?? null)} />
              <Divider />
              <Fact label="Login ID" value={agent.loginId} />
              <Divider />
              <Fact label="Login type" value={loginMode === 'mobile' ? 'Mobile' : 'SIP'} />
              <Divider />
              <Fact label="Extension" value={agent.extension} />
            </Card>
          </View>
        )}

        {!editing && (
          <View>
            <SectionHeader title="Password" />
            {pwOpen ? (
              <View style={{ gap: 14 }}>
                <Field
                  label="Current Password"
                  value={pw.current}
                  secureTextEntry
                  autoCapitalize="none"
                  onChangeText={(v) => setPw((s) => ({ ...s, current: v }))}
                />
                <Field
                  label="New Password"
                  value={pw.next}
                  secureTextEntry
                  autoCapitalize="none"
                  onChangeText={(v) => setPw((s) => ({ ...s, next: v }))}
                />
                <Field
                  label="Confirm New Password"
                  value={pw.confirm}
                  secureTextEntry
                  autoCapitalize="none"
                  onChangeText={(v) => setPw((s) => ({ ...s, confirm: v }))}
                />
                {!!pwError && (
                  <T v="caption" color={c.errorFg}>
                    {pwError}
                  </T>
                )}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    label="Cancel"
                    variant="outline"
                    style={{ flex: 1 }}
                    disabled={pwSaving}
                    onPress={() => {
                      setPw({ current: '', next: '', confirm: '' });
                      setPwError(null);
                      setPwOpen(false);
                    }}
                  />
                  <Button
                    label={pwSaving ? 'Saving...' : 'Save'}
                    icon="check"
                    style={{ flex: 1 }}
                    loading={pwSaving}
                    disabled={pwSaving}
                    onPress={() => void changePassword()}
                  />
                </View>
              </View>
            ) : (
              <Card padded={false}>
                <MenuLine icon="lock-outline" title="Change Password" body="Update the password you sign in with" onPress={() => setPwOpen(true)} />
              </Card>
            )}
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
