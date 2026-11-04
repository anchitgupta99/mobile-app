import { useSession } from '@/store/session';
import { useData } from '@/store/data';
import { buildPop, useCall } from '../callStore';

const pop = () => buildPop('+919800000000', null);

// The demo's calling-hours check (9:00–21:00 India time) would block the test calls when run in the
// evening, so the clock reads midday IST; only Date is faked, the timers stay real
beforeAll(() => {
  jest.useFakeTimers({
    now: new Date('2026-01-15T06:30:00Z'),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'queueMicrotask', 'nextTick', 'hrtime', 'performance'],
  });
});

beforeEach(() => {
  useCall.getState().reset();
});

// reset() also clears the ring/connect timers a started call leaves behind
afterAll(() => {
  useCall.getState().reset();
  jest.useRealTimers();
});

describe('receiveIncoming', () => {
  it('rings when the agent is idle', () => {
    useCall.getState().receiveIncoming(pop(), 'voip', false);
    expect(useCall.getState().call?.state).toBe('ringing');
  });

  it('is ignored while a wrap-up is still pending', () => {
    useCall.setState({ wrapUpCallId: 'cl_prev' });
    useCall.getState().receiveIncoming(pop(), 'voip', false);
    expect(useCall.getState().call).toBeNull();
    expect(useCall.getState().wrapUpCallId).toBe('cl_prev');
  });
});

describe('signing out', () => {
  it('drops the active call and any pending wrap-up', () => {
    useSession.setState({ token: 'tok' });
    useCall.getState().receiveIncoming(pop(), 'voip', false);
    useCall.setState({ wrapUpCallId: 'cl_prev' });
    useSession.setState({ token: null });
    expect(useCall.getState().call).toBeNull();
    expect(useCall.getState().wrapUpCallId).toBeNull();
  });
});

describe('ending an outbound call before it rings', () => {
  it('records it as failed and skips the mandatory wrap-up', async () => {
    useSession.setState({ token: 'tok', agent: null });
    const p = useCall.getState().startOutbound({ number: '+911111111111', source: 'keypad', mode: 'voip' });
    expect(['checking', 'dialing']).toContain(useCall.getState().call?.state);
    useCall.getState().end();
    await p;
    expect(useCall.getState().call).toBeNull();
    expect(useCall.getState().wrapUpCallId).toBeNull();
    const rec = useData.getState().calls[0];
    expect(rec.outcome).toBe('failed');
    expect(rec.talkSec).toBe(0);
  });
});

describe('decline', () => {
  it('only applies to a ringing inbound call', async () => {
    useSession.setState({ token: 'tok', agent: null });
    const before = useData.getState().calls.length;
    const p = useCall.getState().startOutbound({ number: '+911111111111', source: 'keypad', mode: 'voip' });
    useCall.getState().decline();
    expect(useCall.getState().call).not.toBeNull();
    expect(useData.getState().calls).toHaveLength(before);
    useCall.getState().end();
    await p;
  });

  it('records a missed call and a callback task for a ringing inbound call', () => {
    const before = useData.getState().tasks.length;
    useCall.getState().receiveIncoming(pop(), 'voip', false);
    useCall.getState().decline();
    expect(useCall.getState().call).toBeNull();
    expect(useData.getState().calls[0].outcome).toBe('missed');
    expect(useData.getState().tasks).toHaveLength(before + 1);
  });
});

describe('finishWrapUp', () => {
  it('prunes the note and task link of the wrapped-up call', () => {
    useCall.setState({ wrapUpCallId: 'cl_a', notes: { cl_a: 'x', cl_b: 'y' }, taskLinks: { cl_a: 'tk_1' } });
    useCall.getState().finishWrapUp();
    expect(useCall.getState().notes).toEqual({ cl_b: 'y' });
    expect(useCall.getState().taskLinks).toEqual({});
  });
});
