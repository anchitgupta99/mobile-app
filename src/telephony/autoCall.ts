import { USE_BACKEND } from '@/api/http';
import { alertDialog, notify } from '@/components/feedback';
import { findCampaign } from '@/store/campaigns';
import { useData } from '@/store/data';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { useCall } from './callStore';

const DELAY_MS = 5000;
let timer: ReturnType<typeof setTimeout> | null = null;

export function cancelAutoCall() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/** Next lead for an auto campaign: the soonest callback that is already due, else a contact not reached in the last hour. */
export function nextLead(now = Date.now()) {
  const { tasks, contacts, calls } = useData.getState();
  const callable = (id: string | null) => {
    const c = contacts.find((x) => x.id === id);
    return c && !c.dnc ? c : null;
  };
  const task = tasks
    .filter((t) => !t.done && new Date(t.dueAt).getTime() <= now && callable(t.contactId))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  if (task) return { contact: callable(task.contactId)!, taskId: task.id };
  const recent = new Set(calls.filter((c) => Date.now() - new Date(c.startedAt).getTime() < 3600000).map((c) => c.contactId));
  const contact = contacts.find((c) => !c.dnc && !recent.has(c.id));
  return contact ? { contact, taskId: null } : null;
}

/**
 * After wrap-up in an auto campaign with Auto-call on, dial the next lead after a short, cancellable countdown.
 * Returns false when auto-call doesn't apply so the caller can show its usual confirmation.
 */
export function scheduleAutoCall(): boolean {
  cancelAutoCall();
  // Against the backend the server's dialer sends the next lead itself once the disposition is in
  if (USE_BACKEND) return false;
  const agent = useSession.getState().agent;
  const campaign = findCampaign(agent?.campaignId);
  if (!useSettings.getState().autoCall || campaign?.kind !== 'auto') return false;
  const lead = nextLead();
  if (!lead) return false;

  notify(
    `Saved. Auto-calling ${lead.contact.name} in ${DELAY_MS / 1000}s`,
    'info',
    { label: 'Cancel', onPress: cancelAutoCall },
    { silent: true },
  );
  timer = setTimeout(() => {
    timer = null;
    // Status or a call may have changed during the countdown
    if (useSession.getState().status !== 'available' || useCall.getState().call || useCall.getState().wrapUpCallId) return;
    const failed = () => notify('Auto-call could not dial the next lead', 'error');
    try {
      void useCall
        .getState()
        .startOutbound({
          number: lead.contact.phone,
          contactId: lead.contact.id,
          source: lead.taskId ? 'task' : 'contact',
          taskId: lead.taskId,
          dialMode: 'Auto',
        })
        .then((r) => {
          if (!r.ok)
            alertDialog({
              title: r.title,
              message: r.message,
              tone: 'error',
              icon: 'phone-disabled',
              actions: [{ label: 'OK', variant: 'outline' }],
            });
        })
        .catch(failed);
    } catch {
      // Nothing inside a timer callback may throw: an unhandled error here would take the app down
      failed();
    }
  }, DELAY_MS);
  return true;
}
