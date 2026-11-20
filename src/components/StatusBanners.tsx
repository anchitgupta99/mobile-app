import { router } from 'expo-router';
import { Platform, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { formatRelative } from '@/domain/format';
import { useNow } from '@/hooks/useNow';
import { isMissing, usePermissions } from '@/hooks/usePermissions';
import { useData } from '@/store/data';
import { useOutbox } from '@/store/outbox';
import { useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { Icon, T, type IconName } from './ui';
import { Tappable } from './motion/Tappable';

/** Data older than this gets a "last updated" warning */
const STALE_MS = 30 * 60000;

type Tone = 'error' | 'warning';

function Banner({ tone, icon, text, action, onAction }: { tone: Tone; icon: IconName; text: string; action: string; onAction: () => void }) {
  const { c } = useTheme();
  const bg = tone === 'error' ? c.errorBg : c.warningBg;
  const fg = tone === 'error' ? c.errorFg : c.warningFg;
  const line = tone === 'error' ? c.errorLine : c.warningLine;
  return (
    <Animated.View
      entering={FadeIn.duration(duration.base)}
      exiting={FadeOut.duration(duration.fast)}
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingLeft: 16,
        paddingRight: 8,
        minHeight: 44,
        backgroundColor: bg,
        borderBottomWidth: 1,
        borderBottomColor: line,
      }}
    >
      <Icon name={icon} size={18} color={fg} />
      <T v="caption" color={fg} style={{ flex: 1, paddingVertical: 8 }}>
        {text}
      </T>
      <Tappable
        accessibilityRole="button"
        onPress={onAction}
        hitSlop={8}
        style={({ pressed }) => ({ minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 8, backgroundColor: pressed ? c.pressed : 'transparent' })}
      >
        <T v="label" color={fg}>
          {action}
        </T>
      </Tappable>
    </Animated.View>
  );
}

/** Sync failures, stale data and missing permissions, shown under the top bar on every tab. */
export function StatusBanners() {
  const syncError = useData((s) => s.syncError);
  const lastSyncAt = useData((s) => s.lastSyncAt);
  const refreshing = useData((s) => s.refreshing);
  const { notifications, mic, request, openSettings } = usePermissions();
  const failed = useOutbox((s) => s.items.filter((i) => i.error).length);
  const now = useNow(60000);
  const retry = () => void useData.getState().sync();

  const stale = !!lastSyncAt && now - new Date(lastSyncAt).getTime() > STALE_MS;
  const updated = lastSyncAt ? `Last updated ${formatRelative(lastSyncAt, new Date(now))}.` : 'Nothing loaded yet.';

  return (
    <View>
      {/* Browsers report "not asked yet" as denied, so web only warns once the mic is truly blocked */}
      {mic === 'blocked' || (mic === 'denied' && Platform.OS !== 'web') ? (
        <Banner
          tone="error"
          icon="mic-off"
          text="Microphone access is off. You can't talk on calls."
          action={mic === 'blocked' ? 'Settings' : 'Allow'}
          onAction={() => (mic === 'blocked' ? openSettings() : void request('mic'))}
        />
      ) : null}
      {isMissing(notifications) && (
        <Banner
          tone="warning"
          icon="notifications-off"
          text="Notifications are off. You won't hear incoming calls when the app is closed."
          action={notifications === 'blocked' ? 'Settings' : 'Turn on'}
          onAction={() => (notifications === 'blocked' ? openSettings() : void request('notifications'))}
        />
      )}
      {failed > 0 && (
        <Banner
          tone="error"
          icon="cloud-off"
          text={failed === 1 ? "1 change couldn't sync to the server." : `${failed} changes couldn't sync to the server.`}
          action="Review"
          onAction={() => router.push('/sync')}
        />
      )}
      {syncError && !refreshing ? (
        <Banner tone="error" icon="sync-problem" text={`Couldn't refresh. ${updated}`} action="Retry" onAction={retry} />
      ) : stale && !refreshing ? (
        <Banner tone="warning" icon="update" text={`${updated} Data may be out of date.`} action="Refresh" onAction={retry} />
      ) : null}
    </View>
  );
}
