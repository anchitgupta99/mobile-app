import { decide, type GateContext } from '../gate';

const on: GateContext = { hapticsOn: true, soundsOn: true, inCall: false, web: false };

describe('decide', () => {
  it('plays the haptic and sound when everything is on', () => {
    expect(decide('disposition.saved', on)).toEqual({ haptic: 'success', sound: 'saved' });
  });

  it('drops haptics when the haptics setting is off', () => {
    expect(decide('disposition.saved', { ...on, hapticsOn: false })).toEqual({ haptic: null, sound: 'saved' });
  });

  it('drops sounds when UI sounds are off', () => {
    expect(decide('disposition.saved', { ...on, soundsOn: false })).toEqual({ haptic: 'success', sound: null });
  });

  it('never plays haptics on web', () => {
    expect(decide('disposition.saved', { ...on, web: true })).toEqual({ haptic: null, sound: 'saved' });
  });

  it('mutes non-critical sounds during a live call', () => {
    expect(decide('disposition.saved', { ...on, inCall: true })).toEqual({ haptic: 'success', sound: null });
  });

  it('keeps critical sounds during a live call', () => {
    expect(decide('call.connected', { ...on, inCall: true })).toEqual({ haptic: 'light', sound: 'connect' });
    expect(decide('dial.key', { ...on, inCall: true }, '7')).toEqual({ haptic: 'selection', sound: 'dtmf_7' });
  });

  it('maps dial keys to DTMF sounds', () => {
    expect(decide('dial.key', on, '5').sound).toBe('dtmf_5');
    expect(decide('dial.key', on, '*').sound).toBe('dtmf_star');
    expect(decide('dial.key', on, '#').sound).toBe('dtmf_hash');
  });

  it('plays no DTMF sound without a valid digit', () => {
    expect(decide('dial.key', on, 'x').sound).toBeNull();
    expect(decide('dial.key', on).sound).toBeNull();
  });

  it('returns no sound for haptic-only events', () => {
    expect(decide('press', on)).toEqual({ haptic: 'light', sound: null });
  });
});
