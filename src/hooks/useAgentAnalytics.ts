import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/api/client';
import { USE_BACKEND } from '@/api/http';
import type { Analytics, CustomRange, DateRange } from '@/domain/analytics';
import { analyticsFor } from '@/mocks/analytics';

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

/** The Home dashboard's numbers: the server's for the chosen range, or the demo's without a backend */
export function useAgentAnalytics(range: DateRange, custom: CustomRange) {
  const [from, to] = daysOf(range, custom);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const demo = useMemo(() => (USE_BACKEND ? null : analyticsFor(range, custom)), [range, custom]);

  useEffect(() => {
    if (!USE_BACKEND) return;
    let gone = false;
    api.analytics
      .get(from, to)
      .then((a) => {
        if (gone) return;
        setData(a);
        setError(null);
      })
      .catch((e) => !gone && setError(e instanceof Error ? e.message : 'Could not load your stats'));
    return () => {
      gone = true;
    };
  }, [from, to, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return demo ? { data: demo, error: null, reload } : { data, error, reload };
}
