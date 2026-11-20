import { useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { notify } from '@/components/feedback';
import { FadeInItem } from '@/components/motion/FadeInItem';
import { HintCard } from '@/components/HintCard';
import { ListPlaceholder } from '@/components/ListPlaceholder';
import { TaskRow, useTaskActions } from '@/components/TaskRow';
import { Divider, EmptyState, Segmented, T } from '@/components/ui';
import { startOfDay } from '@/domain/format';
import { feedback } from '@/feedback';
import { helpText } from '@/domain/helpText';
import type { Task } from '@/domain/types';
import { useRefresh } from '@/hooks/useRefresh';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/store/data';
import { useSettings } from '@/store/settings';
import { useTheme } from '@/theme';

type View_ = 'open' | 'done';

export default function Callbacks() {
  const { c } = useTheme();
  const [view, setView] = useState<View_>('open');
  const tasks = useData((s) => s.tasks);
  const { refreshing, onRefresh } = useRefresh();
  const upsert = useData((s) => s.upsertTask);
  const complete = useData((s) => s.completeTask);
  const { callTask, snooze } = useTaskActions();
  const now = useNow(60000);
  const swipeHintSeen = useSettings((s) => s.swipeHintSeen);
  const dismissHint = () => useSettings.getState().set({ swipeHintSeen: true });

  const sections = useMemo(() => {
    if (view === 'done') {
      const done = tasks.filter((t) => t.done).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return done.length ? [{ title: 'Completed', data: done }] : [];
    }
    const open = tasks.filter((t) => !t.done).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
    const endOfToday = startOfDay(new Date(now)).getTime() + 86400000;
    const overdue: Task[] = [];
    const today: Task[] = [];
    const upcoming: Task[] = [];
    open.forEach((t) => {
      const d = new Date(t.dueAt).getTime();
      if (d < now) overdue.push(t);
      else if (d < endOfToday) today.push(t);
      else upcoming.push(t);
    });
    return [
      { title: 'Overdue', data: overdue },
      { title: 'Due Today', data: today },
      { title: 'Later', data: upcoming },
    ].filter((s) => s.data.length);
  }, [tasks, view, now]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 8, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          <T v="title" accessibilityRole="header">
            Callbacks
          </T>
        </View>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'open', label: `Open · ${tasks.filter((t) => !t.done).length}` },
            { value: 'done', label: 'Done' },
          ]}
        />
        {view === 'open' && !swipeHintSeen && tasks.some((t) => !t.done) && (
          <HintCard icon="swipe" text={helpText.swipe} onDismiss={dismissHint} />
        )}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.violet} />}
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: c.page, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', gap: 8 }}>
            <T v="overline" color={section.title === 'Overdue' ? c.errorFg : c.ink2}>
              {section.title}
            </T>
            <T v="caption" color={c.ink3} nums>
              {section.data.length}
            </T>
          </View>
        )}
        ItemSeparatorComponent={() => <Divider inset={68} />}
        renderItem={({ item }) => (
          <FadeInItem enter={false}>
            <TaskRow
              task={item}
              onCall={() => callTask(item)}
              onComplete={() => {
                dismissHint();
                complete(item.id);
                feedback('task.completed');
                notify('Marked done', 'neutral', { label: 'Undo', onPress: () => upsert({ ...item, done: false }) });
              }}
              onSnooze={() => {
                dismissHint();
                snooze(item);
                notify('Snoozed for 1 hour', 'neutral', {
                  label: 'Undo',
                  onPress: () => upsert(item),
                });
              }}
            />
          </FadeInItem>
        )}
        ListEmptyComponent={
          <ListPlaceholder
            empty={
              <EmptyState
                icon="task-alt"
                title={view === 'open' ? 'Nothing due' : 'No completed callbacks yet'}
                body={view === 'open' ? 'Callbacks you schedule while disposing a call will appear here.' : undefined}
              />
            }
          />
        }
      />
    </View>
  );
}
