import type { Tone } from '@/theme';
import type { AgentStatus, BreakType } from './types';

/** What the status pill can show: the agent's own status, or the call they're in */
export type StatusDisplay = AgentStatus | 'oncall' | 'wrap' | 'overrun';

type IconName = 'check-circle' | 'free-breakfast' | 'pause-circle' | 'phone-in-talk' | 'edit-note' | 'timer-off';

/**
 * One icon, label and tone per status, so status never relies on colour alone. Used by the status pill, the
 * status sheet, the dial pad chip and the "can't dial" toasts.
 */
export const STATUS_DISPLAY: Record<StatusDisplay, { label: string; icon: IconName; tone: Tone }> = {
  available: { label: 'Online', icon: 'check-circle', tone: 'success' },
  break: { label: 'On break', icon: 'free-breakfast', tone: 'warning' },
  // On the server an agent who isn't online or on a break is PAUSED (after login, a campaign switch or a
  // dropped connection), as the web shows it
  offline: { label: 'Paused', icon: 'pause-circle', tone: 'neutral' },
  oncall: { label: 'On call', icon: 'phone-in-talk', tone: 'purple' },
  wrap: { label: 'Wrap-up', icon: 'edit-note', tone: 'info' },
  overrun: { label: 'On break', icon: 'timer-off', tone: 'error' },
};

/** The status's name as the agent sees it: "Online", "Paused", or the break's own name ("Lunch Break") */
export function statusLabel(status: AgentStatus, breakCode: string | null, breakTypes: BreakType[]) {
  if (status === 'break') return breakTypes.find((b) => b.code === breakCode)?.label ?? STATUS_DISPLAY.break.label;
  return STATUS_DISPLAY[status].label;
}
