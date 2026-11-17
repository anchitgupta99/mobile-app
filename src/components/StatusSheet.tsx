import { ActivityIndicator, Pressable, View } from 'react-native';
import { create } from 'zustand';
import { USE_BACKEND } from '@/api/http';
import type { AgentStatus, BreakType } from '@/domain/types';
import { serverConfig } from '@/mocks/seed';
import { useData } from '@/store/data';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';
import { Sheet } from './Sheet';
import { Button, Icon, SectionHeader, T, tap, type IconName } from './ui';

type SheetState = { open: boolean; breakOnly: boolean; show: (breakOnly?: boolean) => void; hide: () => void };

export const useStatusSheet = create<SheetState>((set) => ({
  open: false,
  breakOnly: false,
  show: (breakOnly = false) => set({ open: true, breakOnly }),
  hide: () => set({ open: false }),
}));

export function useBreakTypes(): BreakType[] {
  // Against the backend only the tenant's own break types; never the samples
  return useData((s) => s.server.breakTypes) ?? (USE_BACKEND ? [] : serverConfig.breakTypes);
}

export function useStatusLabel() {
  const status = useSession((s) => s.status);
  const breakCode = useSession((s) => s.breakCode);
  const types = useBreakTypes();
  const brk = status === 'break' ? types.find((b) => b.code === breakCode) : undefined;
  return {
    status,
    breakType: brk,
    // On the server an agent who isn't online or on a break is PAUSED (after login, a campaign switch or a
    // dropped connection), as the web shows it
    label: status === 'available' ? 'Online' : status === 'offline' ? (USE_BACKEND ? 'Paused' : 'Offline') : (brk?.label ?? 'On break'),
    hint:
      status === 'available'
        ? 'Calls ring on your device'
        : status === 'offline'
          ? USE_BACKEND
            ? 'Go online to receive calls'
            : 'You will not receive calls'
          : 'No new calls; follow-ups still remind you',
  };
}

function Option({
  icon,
  dot,
  title,
  body,
  on,
  onPress,
}: {
  icon?: IconName;
  dot?: string;
  title: string;
  body?: string;
  on: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={body ? `${title}, ${body}` : title}
      onPress={() => {
        tap('medium');
        onPress();
      }}
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: on ? c.purple : c.line,
        backgroundColor: on ? c.selected : pressed ? c.subtle : c.surface,
      })}
    >
      {dot ? (
        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot, marginHorizontal: 6 }} />
      ) : (
        <View
          style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.warningBg, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name={icon ?? 'free-breakfast'} size={18} color={c.warningFg} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{title}</T>
        {body && <T v="caption">{body}</T>}
      </View>
      {on && <Icon name="check" color={c.purple} />}
    </Pressable>
  );
}

export function StatusSheet() {
  const { c } = useTheme();
  const open = useStatusSheet((s) => s.open);
  const breakOnly = useStatusSheet((s) => s.breakOnly);
  const hide = useStatusSheet((s) => s.hide);
  const status = useSession((s) => s.status);
  const breakCode = useSession((s) => s.breakCode);
  const setStatus = useSession((s) => s.setStatus);
  const types = useBreakTypes();
  const refreshing = useData((s) => s.refreshing);

  const pick = (s: AgentStatus, code?: string) => {
    setStatus(s, { breakCode: code ?? null });
    hide();
  };

  return (
    <Sheet open={open} onClose={hide} title={breakOnly ? 'Choose a break' : 'Your status'}>
      {!breakOnly && (
        <Option
          dot={c.signalOk}
          title="Go Online"
          body="Calls ring on your device"
          on={status === 'available'}
          onPress={() => pick('available')}
        />
      )}
      <View style={{ marginTop: breakOnly ? 0 : 8 }}>
        <SectionHeader title="Break" />
      </View>
      <View style={{ gap: 8 }}>
        {/* None loaded yet (or none set up): the web's "No breaks found", with a way to load them again */}
        {types.length === 0 && (
          <View style={{ alignItems: 'center', gap: 10, paddingVertical: 16 }}>
            {refreshing ? (
              <ActivityIndicator color={c.purple} />
            ) : (
              <>
                <T v="caption" color={c.ink2}>
                  No breaks found
                </T>
                <Button label="Try again" icon="refresh" variant="outline" size="sm" onPress={() => void useData.getState().sync()} />
              </>
            )}
          </View>
        )}
        {types.map((b) => (
          <Option
            key={b.code}
            icon={b.icon as IconName}
            title={b.label}
            body={b.limitMinutes ? `Up to ${b.limitMinutes} min` : undefined}
            on={status === 'break' && breakCode === b.code}
            onPress={() => pick('break', b.code)}
          />
        ))}
      </View>
      {/* The web has no "offline" status to set: an agent is online, on a break, or signs out */}
      {!breakOnly && !USE_BACKEND && (
        <View style={{ marginTop: 8 }}>
          <Option
            dot={c.ink3}
            title="Offline"
            body="You will not receive calls"
            on={status === 'offline'}
            onPress={() => pick('offline')}
          />
        </View>
      )}
    </Sheet>
  );
}
