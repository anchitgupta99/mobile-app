import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notify } from '@/components/feedback';
import { ListPlaceholder } from '@/components/ListPlaceholder';
import { FadeInItem } from '@/components/motion/FadeInItem';
import { PageHeader } from '@/components/PageHeader';
import { TaskRow, useTaskActions } from '@/components/TaskRow';
import { Divider, EmptyState, T } from '@/components/ui';
import { helpText } from '@/domain/helpText';
import { feedback } from '@/feedback';
import { useDueTasks } from '@/hooks/useDueTasks';
import { useData } from '@/store/data';
import { useTheme } from '@/theme';

export default function Notifications() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const due = useDueTasks();
  const upsert = useData((s) => s.upsertTask);
  const complete = useData((s) => s.completeTask);
  const { callTask, snooze } = useTaskActions();

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <PageHeader title="Notifications" />
      <T v="caption" color={c.ink2} style={{ paddingHorizontal: 20, paddingTop: 12 }}>
        {helpText.notifications}
      </T>
      <FlatList
        data={due}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: insets.bottom + 32, flexGrow: 1 }}
        ItemSeparatorComponent={() => <Divider inset={68} />}
        renderItem={({ item }) => (
          <FadeInItem enter={false}>
            <TaskRow
              task={item}
              onCall={() => callTask(item)}
              onComplete={() => {
                complete(item.id);
                feedback('task.completed');
                notify('Marked done', 'neutral', { label: 'Undo', onPress: () => upsert({ ...item, done: false }) });
              }}
              onSnooze={() => {
                snooze(item);
                notify('Snoozed for 1 hour', 'neutral', { label: 'Undo', onPress: () => upsert(item) });
              }}
            />
          </FadeInItem>
        )}
        ListEmptyComponent={
          <ListPlaceholder
            empty={
              <EmptyState
                icon="notifications-none"
                title="You're all caught up"
                body="Missed calls, callbacks and reminders that are due show up here."
              />
            }
          />
        }
      />
    </View>
  );
}
