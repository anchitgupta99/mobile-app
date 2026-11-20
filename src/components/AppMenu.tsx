import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { create } from 'zustand';
import type { Campaign } from '@/domain/types';
import { useCampaigns } from '@/store/campaigns';
import { useOutbox } from '@/store/outbox';
import { useSession } from '@/store/session';
import { useCall } from '@/telephony/callStore';
import { useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { alertDialog, notify } from './feedback';
import { Sheet } from './Sheet';
import { Avatar, Button, Divider, Icon, StatusChip, T, tap, Toggle, type IconName } from './ui';
import { Tappable } from './motion/Tappable';

/** `show('campaign')` opens the menu with the campaign list already expanded (from "Switch campaign" toasts) */
export const useAppMenu = create<{
  open: boolean;
  section: 'campaign' | null;
  show: (section?: 'campaign') => void;
  hide: () => void;
}>((set) => ({
  open: false,
  section: null,
  show: (section) => set({ open: true, section: section ?? null }),
  hide: () => set({ open: false, section: null }),
}));

// Set while the pre-logout flush runs, so a second tap doesn't start another flush and stack two dialogs
let loggingOut = false;

export function confirmLogout() {
  if (loggingOut) return;
  const ask = () => {
    const pending = useOutbox.getState().items.length;
    alertDialog({
      title: 'Log out?',
      message: pending
        ? `${pending} ${pending === 1 ? 'change has' : 'changes have'} not synced yet and will be lost. You will stop receiving calls on this phone.`
        : 'You will stop receiving calls on this phone.',
      tone: 'error',
      icon: 'logout',
      actions: [
        { label: 'Cancel', variant: 'outline' },
        { label: pending ? 'Log out anyway' : 'Log out', variant: 'danger', onPress: () => useSession.getState().logout() },
      ],
    });
  };
  const queued = useOutbox.getState().items.length;
  if (!queued) return ask();
  // Push whatever is still queued first, then be precise about what logging out would throw away. The flush can take
  // a while on a bad network, so say what's happening straight away instead of looking like the tap did nothing.
  loggingOut = true;
  notify(`Syncing ${queued} ${queued === 1 ? 'change' : 'changes'} before you log out…`, 'info');
  void useOutbox
    .getState()
    .flush()
    .catch(() => undefined)
    .finally(() => {
      loggingOut = false;
      ask();
    });
}

export function MenuLine({
  icon,
  title,
  body,
  right,
  onPress,
  danger,
}: {
  icon: IconName;
  title: string;
  body?: string;
  right?: ReactNode;
  onPress?: () => void;
  danger?: boolean;
}) {
  const { c } = useTheme();
  const content = (
    <>
      <Icon name={icon} color={danger ? c.errorFg : c.ink2} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong" color={danger ? c.errorFg : undefined}>
          {title}
        </T>
        {body && (
          <T v="caption" numberOfLines={2}>
            {body}
          </T>
        )}
      </View>
      {right ?? (onPress ? <Icon name="chevron-right" color={c.ink3} /> : null)}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14, paddingHorizontal: 16, minHeight: 60 };
  if (!onPress) return <View style={[style, { paddingVertical: 10 }]}>{content}</View>;
  return (
    <Tappable scaleTo={1}
      accessibilityRole="button"
      accessibilityLabel={body ? `${title}, ${body}` : title}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [style, { paddingVertical: 10, backgroundColor: pressed ? c.pressed : 'transparent' }]}
    >
      {content}
    </Tappable>
  );
}

/** Campaign row that expands in place to a single-choice list. */
export function CampaignPicker() {
  const { c } = useTheme();
  const agent = useSession((s) => s.agent);
  const setCampaign = useSession((s) => s.setCampaign);
  const onCall = useCall((s) => !!s.call || !!s.wrapUpCallId);
  const campaigns = useCampaigns((s) => s.list);
  const allowSelection = useCampaigns((s) => s.allowSelection);
  const [toggled, setOpen] = useState(false);
  const current = campaigns.find((x) => x.id === agent?.campaignId);
  // Opened from a "manual calls aren't allowed" toast: the list starts expanded, with campaigns that allow
  // manual dialing first
  const fromToast = useAppMenu((s) => s.section === 'campaign');
  const open = toggled || (fromToast && allowSelection && !onCall);
  const manualFirst = fromToast && current?.allowManualCalls === false;
  const shown = manualFirst
    ? [...campaigns].sort((a, b) => Number(b.allowManualCalls !== false) - Number(a.allowManualCalls !== false))
    : campaigns;
  // The campaign picked but not switched to yet: confirmed right here in the menu. (A separate dialog opened after
  // closing the menu could be lost: its timer died with the menu when the menu closed quickly.)
  const [pending, setPending] = useState<Campaign | null>(null);
  const [switching, setSwitching] = useState(false);

  const confirmSwitch = async (cmp: Campaign) => {
    setSwitching(true);
    try {
      await setCampaign(cmp);
      setPending(null);
      setOpen(false);
      useAppMenu.getState().hide();
      notify(`Switched to ${cmp.name}`, 'success');
    } catch (e) {
      // Switched, only going online after it failed: the switch is done, so close up and warn rather than leave the
      // picker sitting on a failure. (`partial` is set by setCampaign; the message check is a fallback.)
      const err = e as { partial?: boolean; code?: string };
      const partial =
        e instanceof Error && (err.partial === true || err.code === 'partial' || e.message.startsWith('Switched to'));
      if (partial) {
        setPending(null);
        setOpen(false);
        useAppMenu.getState().hide();
        notify(e.message, 'warning');
      } else {
        notify(e instanceof Error ? e.message : `Couldn't switch to ${cmp.name}`, 'error');
      }
    } finally {
      setSwitching(false);
    }
  };

  return (
    <Animated.View layout={LinearTransition.duration(duration.base)}>
      <MenuLine
        icon="campaign"
        title="Campaign"
        body={`${agent?.campaignName ?? '—'}${current ? ` · ${current.kind === 'auto' ? 'Auto dial' : 'Manual'}` : ''}`}
        onPress={() => {
          if (onCall) return notify('Finish the current call to switch campaigns', 'warning');
          if (!allowSelection) return notify('Your admin has set your campaign', 'info');
          // Collapsing a list the toast expanded drops the toast's hint too
          if (fromToast) useAppMenu.setState({ section: null });
          setPending(null);
          setOpen(!open);
        }}
        right={<Icon name={open ? 'expand-less' : 'expand-more'} color={c.ink3} />}
      />
      {open && (
        <Animated.View
          entering={FadeIn.duration(duration.base)}
          exiting={FadeOut.duration(duration.fast)}
          style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
        >
          {shown.map((cmp) => {
            const on = cmp.id === agent?.campaignId;
            const picked = pending?.id === cmp.id;
            return (
              <Tappable
                key={cmp.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on || picked, disabled: switching }}
                disabled={switching}
                onPress={() => {
                  tap();
                  if (on) {
                    setPending(null);
                    return setOpen(false);
                  }
                  setPending(picked ? null : cmp);
                }}
                style={({ pressed }) => ({
                  minHeight: 48,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: picked ? 2 : 1,
                  borderColor: on || picked ? c.purple : c.controlBorder,
                  backgroundColor: pressed ? c.pressed : on || picked ? c.selected : c.surface,
                })}
              >
                <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {cmp.name}
                </T>
                {manualFirst && cmp.allowManualCalls !== false && <StatusChip tone="success" label="Manual dialing on" />}
                <StatusChip tone={cmp.kind === 'auto' ? 'purple' : 'neutral'} label={cmp.kind === 'auto' ? 'Auto' : 'Manual'} />
                {on && <Icon name="check" size={20} color={c.purple} />}
              </Tappable>
            );
          })}
          {pending && (
            <View
              accessibilityLiveRegion="polite"
              style={{
                marginTop: 4,
                padding: 12,
                gap: 10,
                borderRadius: 12,
                backgroundColor: c.infoBg,
                borderWidth: 1,
                borderColor: c.infoLine,
              }}
            >
              <T v="bodyStrong">Switch to {pending.name}?</T>
              <T v="caption" color={c.ink}>
                {pending.kind === 'auto'
                  ? 'Your queue and leads will change. Auto-call will dial leads from this campaign.'
                  : 'Your queue and leads will change. You will dial leads yourself in this campaign.'}
              </T>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Cancel" variant="outline" style={{ flex: 1 }} disabled={switching} onPress={() => setPending(null)} />
                <Button label="Switch" style={{ flex: 1 }} loading={switching} onPress={() => void confirmSwitch(pending)} />
              </View>
            </View>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
}

export function AppMenu() {
  const { c } = useTheme();
  const open = useAppMenu((s) => s.open);
  const hide = useAppMenu((s) => s.hide);
  const agent = useSession((s) => s.agent);
  // Auto-call is the agent's setting on the server, and only shown when the admin lets them change it (as the
  // web's top bar)
  const autoCall = agent?.autoCallEnabled !== false;
  const showAutoCall = agent?.canManageAutoCall !== false;
  // Disabled while the request runs, so a second tap can't send a second request
  const [autoCallBusy, setAutoCallBusy] = useState(false);
  const changeAutoCall = (v: boolean) => {
    if (autoCallBusy) return;
    setAutoCallBusy(true);
    useSession
      .getState()
      .setAutoCall(v)
      .then(() => notify(v ? 'Auto-call on' : 'Auto-call off', 'success'))
      .catch((e) => notify(e instanceof Error ? e.message : 'Could not change auto-call', 'error'))
      .finally(() => setAutoCallBusy(false));
  };

  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (logoutTimer.current) clearTimeout(logoutTimer.current);
    },
    [],
  );

  const go = (path: '/profile') => {
    hide();
    router.push(path);
  };

  return (
    <Sheet open={open} onClose={hide} title="Menu">
      <View style={{ marginHorizontal: -20, marginTop: -8 }}>
        <Tappable scaleTo={1}
          accessibilityRole="button"
          accessibilityLabel={`${agent?.name ?? 'Agent'}, view profile`}
          onPress={() => go('/profile')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: pressed ? c.pressed : 'transparent',
          })}
        >
          <Avatar name={agent?.name ?? 'Agent'} size={48} />
          <View style={{ flex: 1 }}>
            <T v="h3">{agent?.name ?? 'Agent'}</T>
            <T v="caption">
              {agent?.loginId} · Ext {agent?.extension}
            </T>
          </View>
          <Icon name="chevron-right" color={c.ink3} />
        </Tappable>
        <Divider />
        <CampaignPicker />
        {showAutoCall && (
          <>
            <Divider inset={54} />
            <MenuLine
              icon="autorenew"
              title="Auto-call"
              body="In auto campaigns, the dialer sends you the next lead after wrap-up"
              right={<Toggle label="Auto-call" value={autoCall} onChange={changeAutoCall} disabled={autoCallBusy} />}
            />
          </>
        )}
        <Divider inset={54} />
        <MenuLine
          icon="logout"
          title="Log out"
          danger
          onPress={() => {
            hide();
            if (logoutTimer.current) clearTimeout(logoutTimer.current);
            logoutTimer.current = setTimeout(confirmLogout, 250);
          }}
        />
      </View>
    </Sheet>
  );
}
