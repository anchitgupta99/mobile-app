import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/api/client';
import type { Analytics, CustomRange, DateRange } from '@/domain/analytics';
import { useCall } from '@/telephony/callStore';

const day = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** The first and last day (YYYY-MM-DD) of a dashboard range: today, yesterday, or the last N days */
function daysOf(range: DateRange, custom: CustomRange): [string, string] {
  const today = new Date();
  if (range === 'today') return [day(today), day(today)];
  if (range === 'yesterday') {
    const y = new Date(today.getTime() - 86400000);
    return [day(y), day(y)];
  }
  return [day(new Date(today.getTime() - (custom.days - 1) * 86400000)), day(today)];
}

/**
 * The Home dashboard's numbers from the server, for the chosen range. Refetches when the screen regains focus and
 * when a call is fully over (ended with no wrap-up, or wrap-up finished); callers add pull-to-refresh via `reload`.
 * `stale` is true while the data shown belongs to a different range than the one picked, so it can be dimmed.
 */
export function useAgentAnalytics(range: DateRange, custom: CustomRange) {
  const [from, to] = daysOf(range, custom);
  const key = `${from}|${to}`;
  const [data, setData] = useState<{ key: string; value: Analytics } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The request that last finished; loading until it's the current one (derived, so no setState in the effect)
  const [settled, setSettled] = useState<string | null>(null);
  const request = `${key}#${attempt}`;
  const loading = settled !== request;

  useEffect(() => {
    let gone = false;
    api.analytics
      .get(from, to)
      .then((a) => {
        if (gone) return;
        setData({ key: `${from}|${to}`, value: a });
        setError(null);
      })
      .catch((e) => !gone && setError(e instanceof Error ? e.message : 'Could not load your stats'))
      .finally(() => !gone && setSettled(`${from}|${to}#${attempt}`));
    return () => {
      gone = true;
    };
  }, [from, to, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Back on Home (the first focus is the mount fetch above)
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) reload();
      focused.current = true;
    }, [reload]),
  );

  // A finished call changes today's figures
  useEffect(
    () =>
      useCall.subscribe((s, prev) => {
        const wrapUpDone = !!prev.wrapUpCallId && !s.wrapUpCallId;
        const endedWithoutWrapUp = !!prev.call && !s.call && !s.wrapUpCallId;
        if (wrapUpDone || endedWithoutWrapUp) reload();
      }),
    [reload],
  );

  return { data: data?.value ?? null, stale: !!data && data.key !== key, loading, error, reload };
}
