import { canDial, type DialGateInput } from '../dialGate';
import type { Campaign } from '../types';

const manualOn: Campaign = { id: 'c1', name: 'Sales', kind: 'manual', listName: '', allowManualCalls: true };
const manualOff: Campaign = { id: 'c2', name: 'Renewals', kind: 'auto', listName: '', allowManualCalls: false };

const base: DialGateInput = {
  source: 'keypad',
  status: 'available',
  statusLabel: 'Online',
  onCall: false,
  wrapUpCallId: null,
  campaignId: 'c1',
  campaigns: [manualOn, manualOff],
  allowSelection: true,
};

describe('canDial', () => {
  it('lets an online agent dial in a campaign that allows manual calls', () => {
    expect(canDial(base)).toBeNull();
  });

  it('checks on call, then wrap-up, then status, then campaign', () => {
    const all = { ...base, onCall: true, wrapUpCallId: 'x', status: 'break' as const, campaignId: 'c2' };
    expect(canDial(all)?.reason).toBe('on_call');
    expect(canDial({ ...all, onCall: false })?.reason).toBe('wrap_up');
    expect(canDial({ ...all, onCall: false, wrapUpCallId: null })).toEqual({ reason: 'status', status: 'break', label: 'Online' });
    expect(canDial({ ...all, onCall: false, wrapUpCallId: null, status: 'available' })?.reason).toBe('manual_not_allowed');
  });

  it('shows status, not the campaign rule, when both apply', () => {
    const b = canDial({ ...base, status: 'offline', statusLabel: 'Paused', campaignId: 'c2' });
    expect(b).toEqual({ reason: 'status', status: 'offline', label: 'Paused' });
  });

  it('needs a campaign', () => {
    expect(canDial({ ...base, campaignId: null })?.reason).toBe('no_campaign');
  });

  it.each(['keypad', 'contact', 'history'] as const)('blocks %s dials when manual calls are off', (source) => {
    expect(canDial({ ...base, source, campaignId: 'c2' })).toEqual({
      reason: 'manual_not_allowed',
      campaignName: 'Renewals',
      canSwitch: true,
    });
  });

  it('lets callbacks through when manual calls are off', () => {
    expect(canDial({ ...base, source: 'task', campaignId: 'c2' })).toBeNull();
  });

  it('says contact your admin when no other campaign allows manual calls, or selection is locked', () => {
    const only = { ...base, campaignId: 'c2', campaigns: [manualOff] };
    expect(canDial(only)).toMatchObject({ canSwitch: false });
    expect(canDial({ ...base, campaignId: 'c2', allowSelection: false })).toMatchObject({ canSwitch: false });
  });

  it('treats a campaign without the setting as allowing manual calls', () => {
    const unset: Campaign = { id: 'c3', name: 'Old', kind: 'manual', listName: '' };
    expect(canDial({ ...base, campaignId: 'c3', campaigns: [unset] })).toBeNull();
  });
});
