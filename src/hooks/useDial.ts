import { alertDialog, notify } from '@/components/feedback';
import { tap } from '@/components/ui';
import { findCampaign } from '@/store/campaigns';
import { useSession } from '@/store/session';
import { useCall, type DialSource } from '@/telephony/callStore';

/**
 * Every manual dial in the app goes through here. As the web, a manual call needs the agent to be online (READY):
 * the web hides or blocks its dial buttons otherwise, and the server doesn't check it itself. A callback reads the
 * web Callbacks list's message, the rest its dial pad's. The Dialer's own number also needs the campaign to allow
 * manual calls, as the web shows its dial pad only then.
 */
export function useDial() {
  const start = useCall((s) => s.startOutbound);
  return async (input: { number: string; contactId?: string | null; source: DialSource; taskId?: string | null }) => {
    if (!input.number || input.number.replace(/\D/g, '').length < 3) return false;
    const session = useSession.getState();
    if (session.status !== 'available') {
      tap('warning');
      if (input.source === 'task') notify('Switch to READY status', 'error', undefined, { title: 'Status Error' });
      else notify('Please go online to initiate calls', 'error');
      return false;
    }
    // The web hides its dial pad then and has no message of its own; the agent may try, as on a break, and is told why
    if (input.source === 'keypad' && findCampaign(session.agent?.campaignId)?.allowManualCalls === false) {
      tap('warning');
      notify('Manual calls are disabled for this campaign.', 'error');
      return false;
    }
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
