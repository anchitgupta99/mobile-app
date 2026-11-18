import { useSession } from '@/store/session';
import { useData } from '@/store/data';
import type { IncomingSipCall } from '../sip/sipPhone';
import { useCall } from '../callStore';

// The toasts are UI (Reanimated), and the call audio is native (InCallManager): neither loads under Jest
jest.mock('@/components/feedback', () => ({ alertDialog: jest.fn(), notify: jest.fn() }));
jest.mock('../sip/audioRoute', () => ({ startCallAudio: jest.fn(), stopCallAudio: jest.fn(), setCallAudioRoute: jest.fn() }));

/** An inbound call with accept/reject, as the server's INVITE describes it: it rings until Accept or Decline */
const ringing = (): IncomingSipCall => ({
  customerNumber: '+919800000000',
  callType: 'Inbound',
  autoAnswer: true,
  transfer: false,
  conference: false,
  intervention: false,
  acceptReject: true,
  callUuid: '00000000-0000-4000-8000-000000000001',
  agentCallUuid: '00000000-0000-4000-8000-000000000002',
  leadId: null,
  campaignId: null,
});

beforeEach(() => {
  useCall.getState().reset();
});

// reset() also clears the ring timer and status polling a call leaves behind
afterAll(() => {
  useCall.getState().reset();
});

describe('a call from the server', () => {
  it('rings when the agent is idle', () => {
    expect(useCall.getState().takeSipCall(ringing())).toBe(true);
    expect(useCall.getState().call?.state).toBe('ringing');
    expect(useCall.getState().call?.callType).toBe('Inbound');
  });

  it('is turned down while a wrap-up is still pending', () => {
    useCall.setState({ wrapUpCallId: 'cl_prev' });
    expect(useCall.getState().takeSipCall(ringing())).toBe(false);
    expect(useCall.getState().call).toBeNull();
    expect(useCall.getState().wrapUpCallId).toBe('cl_prev');
  });
});

describe('signing out', () => {
  it('drops the active call and any pending wrap-up', () => {
    useSession.setState({ token: 'tok' });
    useCall.getState().takeSipCall(ringing());
    useCall.setState({ wrapUpCallId: 'cl_prev' });
    useSession.setState({ token: null });
    expect(useCall.getState().call).toBeNull();
    expect(useCall.getState().wrapUpCallId).toBeNull();
  });
});

describe('ending an outbound call before it rings', () => {
  it('records it as failed and skips the mandatory wrap-up', async () => {
    useSession.setState({ token: 'tok', agent: null });
    const p = useCall.getState().startOutbound({ number: '+911111111111', source: 'keypad' });
    expect(useCall.getState().call?.state).toBe('dialing');
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
    const p = useCall.getState().startOutbound({ number: '+911111111111', source: 'keypad' });
    useCall.getState().decline();
    expect(useCall.getState().call).not.toBeNull();
    expect(useData.getState().calls).toHaveLength(before);
    useCall.getState().end();
    await p;
  });

  // As the web: a declined inbound call is in the history, with no reminder task
  it('records a missed call and no reminder for a declined inbound call', () => {
    const before = useData.getState().tasks.length;
    useCall.getState().takeSipCall(ringing());
    useCall.getState().decline();
    expect(useCall.getState().call).toBeNull();
    expect(useData.getState().calls[0].outcome).toBe('missed');
    expect(useData.getState().tasks).toHaveLength(before);
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
