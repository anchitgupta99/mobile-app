import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { create } from 'zustand';
import { USE_BACKEND } from '@/api/http';
import { useCampaigns } from '@/store/campaigns';
import { useOutbox } from '@/store/outbox';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { useCall } from '@/telephony/callStore';
import { useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { alertDialog, notify } from './feedback';
import { Sheet } from './Sheet';
import { Avatar, Divider, Icon, StatusChip, T, tap, Toggle, type IconName } from './ui';

export const useAppMenu = create<{ open: boolean; show: () => void; hide: () => void }>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export function confirmLogout() {
  // Push whatever is still queued first, then be precise about what logging out would throw away
  void useOutbox
    .getState()
    .flush()
    .catch(() => undefined)
    .finally(() => {
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={body ? `${title}, ${body}` : title}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [style, { paddingVertical: 10, backgroundColor: pressed ? c.subtle : 'transparent' }]}
    >
      {content}
    </Pressable>
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
  const [open, setOpen] = useState(false);
  const current = campaigns.find((x) => x.id === agent?.campaignId);
  const dialogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (dialogTimer.current) clearTimeout(dialogTimer.current);
    },
    [],
  );

  return (
    <Animated.View layout={LinearTransition.duration(duration.base)}>
      <MenuLine
        icon="campaign"
        title="Campaign"
        body={`${agent?.campaignName ?? '—'}${current ? ` · ${current.kind === 'auto' ? 'Auto dial' : 'Manual'}` : ''}`}
        onPress={() => {
          if (onCall) return notify('Finish the current call to switch campaigns', 'warning');
          if (!allowSelection) return notify('Your admin has set your campaign', 'info');
          setOpen((o) => !o);
        }}
        right={<Icon name={open ? 'expand-less' : 'expand-more'} color={c.ink3} />}
      />
      {open && (
        <Animated.View
          entering={FadeIn.duration(duration.base)}
          exiting={FadeOut.duration(duration.fast)}
          style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}
        >
          {campaigns.map((cmp) => {
            const on = cmp.id === agent?.campaignId;
            return (
              <Pressable
                key={cmp.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  tap();
                  if (on) return setOpen(false);
                  // Close the menu first so the dialog isn't drawn underneath it (same as Log out)
                  useAppMenu.getState().hide();
                  if (dialogTimer.current) clearTimeout(dialogTimer.current);
                  dialogTimer.current = setTimeout(
                    () =>
                      alertDialog({
                        title: `Switch to ${cmp.name}?`,
                        message:
                          cmp.kind === 'auto'
                            ? 'Your queue and leads will change. Auto-call will dial leads from this campaign.'
                            : 'Your queue and leads will change. You will dial leads yourself in this campaign.',
                        icon: 'campaign',
                        tone: 'info',
                        actions: [
                          { label: 'Cancel', variant: 'outline' },
                          {
                            label: 'Switch',
                            onPress: () => {
                              setOpen(false);
                              setCampaign(cmp)
                                .then(() => notify(`Switched to ${cmp.name}`, 'success'))
                                .catch((e) => notify(e instanceof Error ? e.message : `Couldn't switch to ${cmp.name}`, 'error'));
                            },
                          },
                        ],
                      }),
                    250,
                  );
                }}
                style={{
                  minHeight: 48,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: on ? c.purple : c.line,
                  backgroundColor: on ? c.selected : c.surface,
                }}
              >
                <T v="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {cmp.name}
                </T>
                <StatusChip tone={cmp.kind === 'auto' ? 'purple' : 'neutral'} label={cmp.kind === 'auto' ? 'Auto' : 'Manual'} />
                {on && <Icon name="check" size={20} color={c.purple} />}
              </Pressable>
            );
          })}
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
  const localAutoCall = useSettings((s) => s.autoCall);
  const set = useSettings((s) => s.set);
  // Against the backend auto-call is the agent's setting on the server, and only shown when the admin lets
  // them change it (as the web's top bar)
  const autoCall = USE_BACKEND ? agent?.autoCallEnabled !== false : localAutoCall;
  const showAutoCall = !USE_BACKEND || agent?.canManageAutoCall !== false;
  const changeAutoCall = (v: boolean) => {
    if (!USE_BACKEND) return set({ autoCall: v });
    useSession
      .getState()
      .setAutoCall(v)
      .then(() => notify(v ? 'Auto-call on' : 'Auto-call off', 'success'))
      .catch((e) => notify(e instanceof Error ? e.message : 'Could not change auto-call', 'error'));
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${agent?.name ?? 'Agent'}, view profile`}
          onPress={() => go('/profile')}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: pressed ? c.subtle : 'transparent',
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
        </Pressable>
        <Divider />
        <CampaignPicker />
        {showAutoCall && (
          <>
            <Divider inset={54} />
            <MenuLine
              icon="autorenew"
              title="Auto-call"
              body={USE_BACKEND ? 'In auto campaigns, the dialer sends you the next lead after wrap-up' : 'In auto campaigns, dial the next lead after wrap-up'}
              right={<Toggle label="Auto-call" value={autoCall} onChange={changeAutoCall} />}
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
