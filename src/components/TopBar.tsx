import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { feedback } from '@/feedback';
import { duration } from '@/theme/motion';
import { RollingDigits } from './motion/RollingDigits';
import { useNetwork } from '@/api/network';
import { formatDuration } from '@/domain/format';
import type { AgentStatus } from '@/domain/types';
import { useDueTasks } from '@/hooks/useDueTasks';
import { useNow } from '@/hooks/useNow';
import { useCall } from '@/telephony/callStore';
import { useOutbox } from '@/store/outbox';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { useAppMenu } from './AppMenu';
import { helpText } from '@/domain/helpText';
import { font, useTheme } from '@/theme';
import { useStatusLabel, useStatusSheet } from './StatusSheet';
import { Icon, IconButton, T, tap, type IconName } from './ui';

export function useStatusColor() {
  const { c } = useTheme();
  return (s: AgentStatus | 'oncall' | 'wrap') =>
    s === 'available' ? c.signalOk : s === 'break' ? c.signalWarn : s === 'oncall' || s === 'wrap' ? c.violet : c.ink3;
}

export function useBreakOverrun(now: number) {
  const since = useSession((s) => s.statusSince);
  const { breakType } = useStatusLabel();
  if (!breakType?.limitMinutes) return null;
  const over = (now - new Date(since).getTime()) / 1000 - breakType.limitMinutes * 60;
  return over > 0 ? over : null;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function StatusPill() {
  const { c } = useTheme();
  const since = useSession((s) => s.statusSince);
  const { status, label: statusLabel } = useStatusLabel();
  const call = useCall((s) => s.call);
  const wrapping = useCall((s) => !!s.wrapUpCallId);
  const showSheet = useStatusSheet((s) => s.show);
  const now = useNow();
  const colorOf = useStatusColor();
  const overrun = useBreakOverrun(now);

  const live = call ? 'oncall' : wrapping ? 'wrap' : status;
  const label = call ? 'On call' : wrapping ? 'Wrap-up' : statusLabel;
  const startedAt = call ? (call.connectedAt ?? call.createdAt) : new Date(since).getTime();
  const elapsed = formatDuration((now - startedAt) / 1000);
  const late = !call && !wrapping && overrun !== null;

  const [pressed, setPressed] = useState(false);
  const reduced = useReducedMotion();
  const dotColor = late ? c.errorFg : colorOf(live);
  const dot = useSharedValue(dotColor);
  useEffect(() => {
    dot.set(withTiming(dotColor, { duration: reduced ? 0 : duration.base }));
  }, [dotColor, reduced, dot]);
  const dotStyle = useAnimatedStyle(() => ({ backgroundColor: dot.get() }));

  // Haptic only for agent status changes (available/break/offline), not call or wrap-up transitions
  const prevLive = useRef(live);
  useEffect(() => {
    const was = prevLive.current;
    prevLive.current = live;
    const agent = (s: string) => s !== 'oncall' && s !== 'wrap';
    if (was !== live && agent(was) && agent(live)) feedback('status.changed');
  }, [live]);

  return (
    <AnimatedPressable
      layout={LinearTransition.duration(duration.base)}
      accessibilityRole="button"
      accessibilityLabel={`Status: ${label}, ${elapsed}${late ? ', over the break limit' : ''}. Change status`}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        tap();
        if (!call && !wrapping) showSheet();
      }}
      // Animated components don't apply function styles, so pressed state is tracked locally
      style={{
        height: 40,
        paddingLeft: 12,
        paddingRight: 10,
        borderRadius: 20,
        backgroundColor: late ? c.errorBg : pressed ? c.surface : c.topbarControl,
        borderWidth: late ? 1 : 0,
        borderColor: c.errorLine,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexShrink: 1,
      }}
    >
      <Animated.View style={[{ width: 10, height: 10, borderRadius: 5 }, dotStyle]} />
      <T v="label" color={late ? c.errorFg : c.onTopbar} numberOfLines={1} style={{ flexShrink: 1 }}>
        {label}
      </T>
      <RollingDigits
        v="label"
        color={late ? c.errorFg : c.onTopbar}
        style={{ opacity: late ? 1 : 0.7, fontFamily: font.medium }}
        text={elapsed}
        accessible={false}
      />
      {!call && !wrapping && <Icon name="expand-more" size={18} color={late ? c.errorFg : c.onTopbar} />}
    </AnimatedPressable>
  );
}

function ConnectivityChip() {
  const { c } = useTheme();
  const quality = useNetwork((s) => s.quality);
  const pending = useOutbox((s) => s.items.length);
  const syncing = useOutbox((s) => s.syncing);
  if (quality === 'good' && pending === 0) return null;
  const offline = quality === 'offline';
  const label = offline ? 'Offline' : quality === 'weak' && pending === 0 ? 'Weak signal' : syncing ? 'Syncing' : `${pending} to sync`;
  const icon: IconName = offline ? 'cloud-off' : pending > 0 ? 'cloud-upload' : 'signal-cellular-alt-1-bar';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${pending} items waiting to sync`}
      accessibilityHint={helpText.syncChip}
      onPress={() => router.push('/sync')}
      style={{
        height: 32,
        paddingHorizontal: 10,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: offline ? c.warningBg : c.topbarControl,
        borderWidth: offline ? 1 : 0,
        borderColor: c.warningLine,
      }}
    >
      <Icon name={icon} size={16} color={offline ? c.warningFg : c.onTopbar} />
      <T v="caption" color={offline ? c.warningFg : c.onTopbar} style={{ fontFamily: font.semibold }}>
        {label}
      </T>
    </Pressable>
  );
}

function ThemeToggle() {
  const { scheme } = useTheme();
  const set = useSettings((s) => s.set);
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  const dark = scheme === 'dark';
  return (
    <Animated.View style={style}>
      <IconButton
        icon={dark ? 'light-mode' : 'dark-mode'}
        label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
        variant="topbar"
        size={40}
        onPress={() => {
          // Rotate on and stay there; the next press continues from the current angle instead of snapping back
          if (!reduced) spin.set(withTiming(spin.get() + 180, { duration: duration.slow }));
          set({ theme: dark ? 'light' : 'dark' });
        }}
      />
    </Animated.View>
  );
}

function NotificationBell() {
  const { c } = useTheme();
  const count = useDueTasks().length;
  return (
    <View>
      <IconButton
        icon={count > 0 ? 'notifications' : 'notifications-none'}
        label={count > 0 ? `Notifications, ${count} due` : 'Notifications'}
        hint="Callbacks, reminders and missed calls that are due now"
        variant="topbar"
        size={40}
        onPress={() => router.push('/notifications')}
      />
      {count > 0 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 2,
            right: 0,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: c.danger,
            borderWidth: 2,
            borderColor: c.topbar,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <T v="caption" color={c.onDanger} nums style={{ fontFamily: font.semibold, fontSize: 10, lineHeight: 12 }}>
            {count > 9 ? '9+' : count}
          </T>
        </View>
      )}
    </View>
  );
}

export function TopBar() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const showMenu = useAppMenu((s) => s.show);
  return (
    <View
      style={{
        backgroundColor: c.topbar,
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: scheme === 'dark' ? c.divider : 'transparent',
      }}
    >
      <StatusPill />
      <View style={{ flex: 1 }} />
      <ConnectivityChip />
      <NotificationBell />
      <ThemeToggle />
      <IconButton icon="menu" label="Open menu" variant="topbar" size={40} onPress={showMenu} />
    </View>
  );
}
