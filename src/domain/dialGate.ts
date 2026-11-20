import type { AgentStatus, Campaign } from './types';

/** Where a dial starts. 'task' is a callback, which the campaign scheduled itself. */
export type DialSource = 'keypad' | 'contact' | 'history' | 'task';

/** Why a dial can't start. One reason only, so the agent sees one message, never two. */
export type DialBlock =
  | { reason: 'on_call' }
  | { reason: 'wrap_up'; callId: string }
  | { reason: 'status'; status: Exclude<AgentStatus, 'available'>; label: string }
  | { reason: 'no_campaign' }
  | {
      reason: 'manual_not_allowed';
      campaignName: string;
      /** Another campaign this agent can switch to allows manual calls */
      canSwitch: boolean;
    };

export type DialGateInput = {
  source: DialSource;
  status: AgentStatus;
  /** What the status pill shows: "Paused", "Lunch Break"… */
  statusLabel: string;
  onCall: boolean;
  wrapUpCallId: string | null;
  campaignId: string | null | undefined;
  campaigns: Campaign[];
  /** The admin lets the agent pick their campaign */
  allowSelection: boolean;
};

/** Sources the "manual calls" campaign rule covers. Callbacks are exempt: the campaign scheduled them itself. */
const MANUAL_SOURCES: ReadonlySet<DialSource> = new Set(['keypad', 'contact', 'history']);

/**
 * The one "can this agent dial?" check, used before every dial in the app and for the pre-tap hints on the
 * dial pad and call buttons. Order: on a call → in wrap-up → status → no campaign → manual calls off.
 */
export function canDial(i: DialGateInput): DialBlock | null {
  if (i.onCall) return { reason: 'on_call' };
  if (i.wrapUpCallId) return { reason: 'wrap_up', callId: i.wrapUpCallId };
  if (i.status !== 'available') return { reason: 'status', status: i.status, label: i.statusLabel };
  if (!i.campaignId) return { reason: 'no_campaign' };
  const campaign = i.campaigns.find((c) => c.id === i.campaignId);
  if (MANUAL_SOURCES.has(i.source) && campaign?.allowManualCalls === false) {
    const canSwitch = i.allowSelection && i.campaigns.some((c) => c.id !== campaign.id && c.allowManualCalls !== false);
    return { reason: 'manual_not_allowed', campaignName: campaign.name, canSwitch };
  }
  return null;
}
