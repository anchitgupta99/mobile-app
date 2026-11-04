import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { formatRelative, formatWhen } from '@/domain/format';
import type { Task } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/store/data';
import { useTheme } from '@/theme';
import { SwipeRow } from './motion/SwipeRow';
import { usePhoneDisplay } from './PhoneText';
import { Icon, IconButton, StatusChip, T, tap, type IconName } from './ui';

const kindIcon: Record<Task['kind'], IconName> = {
  callback: 'phone-callback',
  reminder: 'notifications-active',
  missed: 'phone-missed',
};

export function TaskRow({
  task,
  onCall,
  onComplete,
  onSnooze,
}: {
  task: Task;
  onCall?: () => void;
  onComplete?: () => void;
  onSnooze?: () => void;
}) {
  const { c } = useTheme();
  const now = useNow(30000);
  const contact = useData((s) => s.contacts.find((x) => x.id === task.contactId));
  const phone = usePhoneDisplay();
  const overdue = !task.done && new Date(task.dueAt).getTime() < now;
  const slaLeft = task.slaDueAt ? new Date(task.slaDueAt).getTime() - now : null;
  const who = contact?.name ?? task.name ?? (task.number ? phone(task.number) : 'No contact');

  return (
    <SwipeRow
      left={!task.done && onComplete ? { icon: 'check', bg: c.call, fg: c.onCall, onTrigger: onComplete } : undefined}
      right={!task.done && onSnooze ? { icon: 'snooze', bg: c.purple, fg: c.onPurple, onTrigger: onSnooze } : undefined}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, paddingRight: 10, gap: 4 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${task.title}, ${who}, due ${formatWhen(task.dueAt)}${overdue ? ', overdue' : ''}`}
          accessibilityActions={[
            ...(onComplete && !task.done ? [{ name: 'complete', label: 'Mark done' }] : []),
            ...(onSnooze && !task.done ? [{ name: 'snooze', label: 'Snooze 1 hour' }] : []),
          ]}
          onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'complete' ? onComplete?.() : onSnooze?.())}
          onPress={() => {
            tap();
            router.push(`/task/${task.id}`);
          }}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            paddingLeft: 16,
            paddingRight: 4,
            paddingVertical: 12,
            minHeight: 72,
            backgroundColor: pressed ? c.subtle : c.surface,
          })}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: task.kind === 'missed' ? c.errorBg : overdue ? c.warningBg : c.lavenderSoft,
            }}
          >
            <Icon
              name={task.done ? 'check' : kindIcon[task.kind]}
              size={20}
              color={task.kind === 'missed' ? c.errorFg : overdue ? c.warningFg : c.purple}
            />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <T v="bodyStrong" numberOfLines={1} style={task.done ? { textDecorationLine: 'line-through', color: c.ink3 } : undefined}>
              {who}
            </T>
            <T v="caption" numberOfLines={1}>
              {task.title}
            </T>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <T v="caption" color={overdue ? c.errorFg : c.ink2} nums>
                {overdue ? `Overdue · ${formatRelative(task.dueAt, new Date(now))}` : formatWhen(task.dueAt)}
              </T>
              {slaLeft !== null && !task.done && (
                <StatusChip
                  tone={slaLeft < 0 ? 'error' : slaLeft < 3600000 ? 'warning' : 'info'}
                  icon="timer"
                  label={slaLeft < 0 ? 'SLA breached' : `${formatRelative(task.slaDueAt!, new Date(now)).replace('in ', '')} left`}
                />
              )}
            </View>
          </View>
        </Pressable>
        {!task.done && onSnooze && <IconButton icon="snooze" label="Snooze 1 hour" variant="plain" size={44} onPress={onSnooze} />}
        {!task.done && onCall && (task.number || contact) && (
          <IconButton icon="call" label={`Call ${who}`} variant="filled" size={44} onPress={onCall} />
        )}
      </View>
    </SwipeRow>
  );
}

export function useTaskActions() {
  const snooze = useData((s) => s.snoozeTask);
  return {
    callTask: (t: Task) => router.push(`/task/${t.id}`),
    snooze: (t: Task, minutes = 60) => snooze(t.id, minutes),
  };
}
