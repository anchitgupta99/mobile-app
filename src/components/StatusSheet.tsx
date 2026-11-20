import { ActivityIndicator, Pressable, View } from 'react-native';
import { create } from 'zustand';
import { STATUS_DISPLAY, statusLabel } from '@/domain/agentStatus';
import type { AgentStatus, BreakType } from '@/domain/types';
import { useData } from '@/store/data';
import { useSession } from '@/store/session';
import { tone as toneOf, useTheme, type Tone } from '@/theme';
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
  // The tenant's own break types, from the server
  return useData((s) => s.server.breakTypes) ?? [];
}

export function useStatusLabel() {
  const status = useSession((s) => s.status);
  const breakCode = useSession((s) => s.breakCode);
  const types = useBreakTypes();
  const brk = status === 'break' ? types.find((b) => b.code === breakCode) : undefined;
  return {
    status,
    breakType: brk,
    label: statusLabel(status, breakCode, types),
    icon: STATUS_DISPLAY[status].icon,
    hint:
      status === 'available'
        ? 'Calls ring on your device'
        : status === 'offline'
          ? 'Go online to receive calls'
          : 'No new calls; follow-ups still remind you',
  };
}

function Option({
  icon,
  iconTone = 'warning',
  title,
  body,
  on,
  onPress,
}: {
  icon?: IconName;
  iconTone?: Tone;
  title: string;
  body?: string;
  on: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const t = toneOf(c, iconTone);
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
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon ?? STATUS_DISPLAY.break.icon} size={18} color={t.fg} />
      </View>
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
          icon={STATUS_DISPLAY.available.icon}
          iconTone={STATUS_DISPLAY.available.tone}
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
    </Sheet>
  );
}
