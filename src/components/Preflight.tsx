import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { helpText } from '@/domain/helpText';
import { useSipPhone } from '@/telephony/sip/sipPhone';
import { feedback } from '@/feedback';
import { usePermissions, usePermissionsStore, type PermissionKind, type PermissionState } from '@/hooks/usePermissions';
import { useCampaigns } from '@/store/campaigns';
import { syncCampaign, useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { font, useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { confirmLogout } from './AppMenu';
import { notify } from './feedback';
import { InfoTip } from './InfoTip';
import { Slider } from './Slider';
import { Button, Card, Icon, StatusChip, T, type IconName } from './ui';

type CheckState = 'checking' | 'passed' | 'unavailable';

/**
 * Internet, webphone and headset checks. The webphone check is the real SIP registration; the headset check follows
 * the real microphone permission. There is no speed test yet, so the internet check reports "Not available yet".
 */
function useChecks(mic: PermissionState) {
  const sip = useSipPhone();
  const rerun = useCallback(() => {
    if (useSipPhone.getState().status !== 'registered') void useSipPhone.getState().retry();
  }, []);

  // The webphone check is the real registration. It blocks going live until the extension registers, except
  // where the webphone can't run at all (Expo Go).
  const webphone: CheckState =
    sip.status === 'registered' ? 'passed' : sip.status === 'idle' || sip.status === 'connecting' ? 'checking' : 'unavailable';
  const webphoneOk = webphone === 'passed' || sip.status === 'unsupported';
  const headset: CheckState = mic === 'checking' ? 'checking' : mic === 'granted' ? 'passed' : 'unavailable';
  const states: CheckState[] = ['unavailable', webphone, headset];
  // Checks that cannot run yet must not block going live; the permissions card gates that
  return { states, rerun, allPassed: webphoneOk };
}

function CheckCard({
  icon,
  title,
  state,
  detail,
  tip,
  children,
}: {
  icon: IconName;
  title: string;
  state: CheckState;
  detail: string;
  tip?: { title: string; text: string };
  children?: React.ReactNode;
}) {
  const { c } = useTheme();
  const ok = state === 'passed';
  const unavailable = state === 'unavailable';
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ok ? c.successBg : unavailable ? c.mutedFill : c.lavenderSoft,
          }}
        >
          <Icon name={icon} size={20} color={ok ? c.successFg : unavailable ? c.ink3 : c.purple} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T v="bodyStrong">{title}</T>
            {tip && <InfoTip {...tip} size={15} />}
          </View>
          <T v="caption" numberOfLines={2}>
            {ok || unavailable ? detail : 'Checking…'}
          </T>
        </View>
        {ok ? (
          <Animated.View entering={FadeIn.duration(duration.base)}>
            <StatusChip tone="success" icon="check-circle" label="Passed" />
          </Animated.View>
        ) : unavailable ? (
          <StatusChip tone="neutral" icon="info" label="Not available yet" />
        ) : (
          <ActivityIndicator color={c.purple} />
        )}
      </View>
      {(ok || unavailable) && children}
    </Card>
  );
}

const permCopy: Record<PermissionKind, { icon: IconName; title: string; why: string }> = {
  mic: { icon: 'mic', title: 'Microphone', why: 'Needed to talk on calls' },
  notifications: { icon: 'notifications', title: 'Notifications', why: 'Rings you for calls when the app is closed' },
};

function PermissionRow({ kind, state, onFix }: { kind: PermissionKind; state: PermissionState; onFix: () => void }) {
  const { c } = useTheme();
  const { icon, title, why } = permCopy[kind];
  const ok = state === 'granted';
  const detail =
    state === 'blocked'
      ? 'Blocked. Turn it on in your phone settings.'
      : state === 'denied'
        ? 'Not allowed yet.'
        : state === 'unsupported'
          ? 'Not available on this device.'
          : state === 'checking'
            ? 'Checking…'
            : why;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Icon name={icon} size={20} color={ok ? c.successFg : state === 'blocked' || state === 'denied' ? c.errorFg : c.ink2} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label">{title}</T>
        <T v="caption" color={state === 'blocked' || state === 'denied' ? c.errorFg : c.ink2}>
          {detail}
        </T>
      </View>
      {ok ? (
        <StatusChip tone="success" icon="check-circle" label="Allowed" />
      ) : state === 'checking' ? (
        <ActivityIndicator color={c.purple} />
      ) : state === 'unsupported' ? null : (
        <Button label={state === 'blocked' ? 'Open settings' : 'Allow'} size="sm" variant="secondary" onPress={onFix} />
      )}
    </View>
  );
}

function PermissionsCard() {
  const { c } = useTheme();
  const { mic, notifications, request, openSettings } = usePermissions();
  const fix = (kind: PermissionKind, state: PermissionState) => (state === 'blocked' ? openSettings() : void request(kind));
  const ok = mic === 'granted' && (notifications === 'granted' || notifications === 'unsupported');
  return (
    <Card style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: ok ? c.successBg : c.warningBg,
          }}
        >
          <Icon name="verified-user" size={20} color={ok ? c.successFg : c.warningFg} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <T v="bodyStrong">App permissions</T>
            <InfoTip {...helpText.permissions} size={15} />
          </View>
          <T v="caption">{ok ? 'Everything needed for calls is allowed' : 'Allow these so calls work'}</T>
        </View>
        {ok && <StatusChip tone="success" icon="check-circle" label="Passed" />}
      </View>
      <PermissionRow kind="mic" state={mic} onFix={() => fix('mic', mic)} />
      <PermissionRow kind="notifications" state={notifications} onFix={() => fix('notifications', notifications)} />
    </Card>
  );
}

/**
 * "Ready to go live?" pre-flight. Shown right after login (mode "golive") and again from
 * Profile → Diagnostics (mode "diagnostics"), where the footer swaps to Re-run / Done.
 */
export function Preflight({ mode, onDone }: { mode: 'golive' | 'diagnostics'; onDone?: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const agent = useSession((s) => s.agent);
  const goLive = useSession((s) => s.goLive);
  const s = useSettings();
  const mic = usePermissionsStore((p) => p.mic);
  const sip = useSipPhone();
  const sipFailed = sip.status === 'failed' || sip.status === 'disconnected';
  const { states, rerun, allPassed: checksPassed } = useChecks(mic);
  // Browsers ask for the mic on first use, so the web build only warns instead of blocking Go live
  const micReady = mic === 'granted' || mic === 'unsupported' || Platform.OS === 'web';
  // The campaign comes from the server after login; going live needs it
  const campaignReady = !!agent?.campaignId;
  const campaignError = useCampaigns((x) => x.error);
  const [campaignRetrying, setCampaignRetrying] = useState(false);
  const allPassed = checksPassed && micReady && campaignReady;
  const [going, setGoing] = useState(false);
  const onGoLive = async () => {
    setGoing(true);
    try {
      await goLive();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Couldn’t go live. Try again.', 'error');
    } finally {
      setGoing(false);
    }
  };
  const golive = mode === 'golive';

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: golive ? insets.top + 24 : 16,
          paddingHorizontal: 16,
          paddingBottom: 24,
          gap: 14,
          width: '100%',
          maxWidth: 560,
          alignSelf: 'center',
        }}
      >
        {golive && (
          <View style={{ gap: 4, paddingHorizontal: 4, marginBottom: 4 }}>
            <T v="title" accessibilityRole="header">
              Ready to go live?
            </T>
            <T v="body" color={allPassed ? c.successFg : c.ink2} accessibilityLiveRegion="polite">
              {allPassed
                ? 'Microphone allowed — you can go live. Some checks aren’t available yet.'
                : checksPassed && !micReady
                  ? 'Allow microphone access to go live.'
                  : sipFailed
                    ? 'The webphone isn’t registered, so calls can’t reach you yet.'
                    : !campaignReady
                      ? (campaignError ?? 'Loading your campaign…')
                      : 'Running a few quick checks…'}
            </T>
            {!!agent?.campaignName && <T v="caption">Campaign · {agent.campaignName}</T>}
            {!campaignReady && !!campaignError && (
              <Button
                label="Try again"
                icon="refresh"
                variant="outline"
                size="sm"
                loading={campaignRetrying}
                style={{ alignSelf: 'flex-start', marginTop: 6 }}
                onPress={() => {
                  setCampaignRetrying(true);
                  void syncCampaign().finally(() => setCampaignRetrying(false));
                }}
              />
            )}
          </View>
        )}

        <PermissionsCard />
        <CheckCard
          icon="wifi"
          title="Internet connection"
          tip={helpText.internetCheck}
          state={states[0]}
          detail="Speed and latency test isn’t wired up yet"
        />
        <CheckCard
          icon="dialer-sip"
          title="Webphone"
          tip={helpText.webphoneCheck}
          state={states[1]}
          detail={
            // The web's system check (layout/agent/SystemCheckModal.tsx)
            sip.status === 'registered'
              ? ['Registered', sip.extension ? `Extension ${sip.extension}` : null, agent?.campaignName ?? null].filter(Boolean).join(' · ')
              : sip.status === 'connecting' || sip.status === 'idle'
                ? 'Connecting to webphone…'
                : sip.status === 'unsupported'
                  ? (sip.detail ?? 'Registration failed — check SIP configuration')
                  : 'Registration failed — check SIP configuration'
          }
        >
          {sipFailed && <Button label="Try again" icon="refresh" variant="outline" size="sm" onPress={rerun} />}
        </CheckCard>
        <CheckCard
          icon="headset-mic"
          title="Headset & microphone"
          tip={helpText.headsetCheck}
          state={states[2]}
          detail={
            states[2] === 'passed'
              ? 'Microphone allowed · using the phone’s current audio device'
              : 'Allow the microphone above to use it on calls'
          }
        >
          <View style={{ gap: 14 }}>
            <T v="caption" color={c.ink3}>
              Choosing a microphone or speaker isn’t available yet. Calls use the device your phone has selected.
            </T>

            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="label" color={c.ink2}>
                  Mic input level
                </T>
                <T v="label" nums>
                  {Math.round(s.micLevel * 100)}%
                </T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="mic-off" size={18} color={c.ink3} />
                <Slider label="Mic input level" value={s.micLevel} onChange={(v) => s.set({ micLevel: v })} />
                <Icon name="mic" size={18} color={c.ink2} />
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="label" color={c.ink2}>
                  Headset output
                </T>
                <T v="label" nums>
                  {Math.round(s.headsetLevel * 100)}%
                </T>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icon name="volume-mute" size={18} color={c.ink3} />
                <Slider label="Headset output" value={s.headsetLevel} onChange={(v) => s.set({ headsetLevel: v })} />
                <Icon name="volume-up" size={18} color={c.ink2} />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                label="Test Headset"
                icon="headphones"
                variant="outline"
                size="sm"
                style={{ flex: 1 }}
                onPress={() => {
                  feedback('call.connected');
                  notify(`Playing a test tone at ${Math.round(s.headsetLevel * 100)}%`, 'info');
                }}
              />
            </View>
          </View>
        </CheckCard>

        <T v="caption" color={c.ink3} style={{ textAlign: 'center', fontFamily: font.regular }}>
          All checks run automatically on login · Re-run from Profile → Diagnostics
        </T>
      </ScrollView>

      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          padding: 16,
          paddingBottom: insets.bottom + 12,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.divider,
        }}
      >
        {golive ? (
          <>
            <Button label="Log out" icon="logout" variant="danger" style={{ flex: 1 }} onPress={confirmLogout} />
            <Button label="Go live" icon="play-arrow" style={{ flex: 1.6 }} disabled={!allPassed} loading={going} onPress={() => void onGoLive()} />
          </>
        ) : (
          <>
            <Button label="Re-run checks" icon="refresh" variant="outline" style={{ flex: 1 }} onPress={rerun} />
            <Button label="Done" style={{ flex: 1 }} onPress={onDone} />
          </>
        )}
      </View>

    </View>
  );
}
