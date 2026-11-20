import { router } from 'expo-router';
import { useRef } from 'react';
import { useAppMenu } from '@/components/AppMenu';
import { alertDialog, notify } from '@/components/feedback';
import { tap } from '@/components/ui';
import { api } from '@/api/client';
import { statusLabel } from '@/domain/agentStatus';
import { canDial, type DialBlock, type DialSource } from '@/domain/dialGate';
import { useCampaigns } from '@/store/campaigns';
import { useData } from '@/store/data';
import { useSession } from '@/store/session';
import { useCall } from '@/telephony/callStore';

/** Reads the stores at this moment, so a status or campaign setting that changed mid-session is honoured */
export function checkDial(source: DialSource): DialBlock | null {
  const s = useSession.getState();
  const call = useCall.getState();
  const camps = useCampaigns.getState();
  return canDial({
    source,
    status: s.status,
    statusLabel: statusLabel(s.status, s.breakCode, useData.getState().server.breakTypes ?? []),
    onCall: !!call.call,
    wrapUpCallId: call.wrapUpCallId,
    campaignId: s.agent?.campaignId,
    campaigns: camps.list,
    allowSelection: camps.allowSelection,
  });
}

/** The same check as a live value, for pre-tap hints: the dial pad banner and dimmed call buttons */
export function useDialAvailability(source: DialSource): DialBlock | null {
  const status = useSession((s) => s.status);
  const breakCode = useSession((s) => s.breakCode);
  const campaignId = useSession((s) => s.agent?.campaignId);
  const onCall = useCall((s) => !!s.call);
  const wrapUpCallId = useCall((s) => s.wrapUpCallId);
  const campaigns = useCampaigns((s) => s.list);
  const allowSelection = useCampaigns((s) => s.allowSelection);
  const breakTypes = useData((s) => s.server.breakTypes);
  return canDial({
    source,
    status,
    statusLabel: statusLabel(status, breakCode, breakTypes ?? []),
    onCall,
    wrapUpCallId,
    campaignId,
    campaigns,
    allowSelection,
  });
}

/** Goes online for the "Go online" toast action, and says so if the server refuses */
async function goOnline() {
  const s = useSession.getState();
  const campaignId = s.agent?.campaignId;
  if (!campaignId) return;
  try {
    await api.agents.goOnline(campaignId);
    s.setStatus('available', { remote: true });
    notify('You’re online', 'success');
  } catch {
    notify("Couldn't go online. Try again.", 'error');
  }
}

/** The one message for each reason a dial can't start, the same from every screen */
export function showDialBlock(block: DialBlock) {
  tap('warning');
  switch (block.reason) {
    case 'on_call':
      return notify({ tone: 'error', title: 'Already on a call', message: 'End the current call first.' });
    case 'wrap_up':
      return notify({
        tone: 'warning',
        title: 'Finish wrap-up first',
        message: 'Your last call needs a disposition.',
        action: {
          label: 'Open wrap-up',
          onPress: () => router.push({ pathname: '/call/wrap-up', params: { id: block.callId } }),
        },
      });
    case 'status':
      return notify({
        tone: 'warning',
        title: block.status === 'offline' ? 'You’re paused' : `You’re on ${block.label}`,
        message: 'Go online to make calls.',
        action: { label: 'Go online', onPress: goOnline },
      });
    case 'no_campaign':
      return notify({
        tone: 'warning',
        title: 'No campaign selected',
        message: 'Pick a campaign to start calling.',
        action: { label: 'Choose', onPress: () => useAppMenu.getState().show('campaign') },
      });
    case 'manual_not_allowed':
      return notify({
        tone: 'warning',
        title: `Manual calls aren’t allowed in ${block.campaignName}`,
        message: block.canSwitch
          ? 'Switch to a campaign that allows manual dialing.'
          : 'Contact your admin to turn on manual dialing.',
        action: block.canSwitch ? { label: 'Switch', onPress: () => useAppMenu.getState().show('campaign') } : undefined,
      });
  }
}

/**
 * Every dial in the app goes through here: checks the agent may dial (canDial), then starts the call.
 * The server decides the rest, as for the web: DNC and the campaign's own calling hours.
 */
export function useDial() {
  const start = useCall((s) => s.startOutbound);
  // A second tap while the first dial is starting is dropped, rather than read as "Already on a call"
  const busy = useRef(false);
  return async (input: { number: string; contactId?: string | null; source: DialSource; taskId?: string | null }) => {
    if (busy.current) return false;
    if (!input.number || input.number.replace(/\D/g, '').length < 3) return false;
    const block = checkDial(input.source);
    if (block) {
      showDialBlock(block);
      return false;
    }
    tap('medium');
    busy.current = true;
    let res: Awaited<ReturnType<typeof start>>;
    try {
      // A callback task goes in as the server's CALLBACK, which a campaign with manual dialing off still allows
      res = await start({ ...input, callback: input.source === 'task' });
    } finally {
      busy.current = false;
    }
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
