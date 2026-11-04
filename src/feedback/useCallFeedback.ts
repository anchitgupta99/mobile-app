import { useEffect } from 'react';
import { useCall } from '@/telephony/callStore';
import { feedback } from './index';

/** Fires call.connected / call.ended from call state transitions, so screens don't have to. */
export function useCallFeedback() {
  useEffect(
    () =>
      useCall.subscribe((s, prev) => {
        const was = prev.call?.state;
        const is = s.call?.state;
        // held -> connected is a resume, not a new connection
        if (is === 'connected' && was !== 'connected' && was !== 'held') feedback('call.connected');
        if (prev.call && !s.call && prev.call.connectedAt) feedback('call.ended');
      }),
    [],
  );
}
