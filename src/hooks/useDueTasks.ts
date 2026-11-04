import { useMemo } from 'react';
import { useData } from '@/store/data';
import { useNow } from './useNow';

/** Open callbacks, reminders and missed calls that are due now or overdue, most recent first. */
export function useDueTasks() {
  const tasks = useData((s) => s.tasks);
  const now = useNow(30000);
  return useMemo(
    () => tasks.filter((t) => !t.done && new Date(t.dueAt).getTime() <= now).sort((a, b) => b.dueAt.localeCompare(a.dueAt)),
    [tasks, now],
  );
}
