import { alertDialog, notify } from '@/components/feedback';
import { tap } from '@/components/ui';
import type { CallMode } from '@/domain/types';
import { useCall, type DialSource } from '@/telephony/callStore';

export function useDial() {
  const start = useCall((s) => s.startOutbound);
  return async (input: { number: string; contactId?: string | null; source: DialSource; taskId?: string | null; mode?: CallMode }) => {
    if (!input.number || input.number.replace(/\D/g, '').length < 3) return false;
    tap('medium');
    const res = await start(input);
    if (!res.ok && res.toast) {
      notify(res.message, 'error', undefined, { title: res.title });
      return false;
    }
    if (!res.ok) {
      alertDialog({
        title: res.title,
        message: res.message,
        tone: 'error',
        icon: 'phone-disabled',
        actions: [{ label: 'OK', variant: 'outline' }],
      });
      return false;
    }
    return true;
  };
}
