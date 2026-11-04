import { useEffect } from 'react';
import { AppState } from 'react-native';
import { USE_BACKEND } from '@/api/http';
import { connectAgentSocket, disconnectAgentSocket, wakeAgentSocket } from '@/api/socket';
import { useSession } from '@/store/session';

/** Keeps the agent's live socket to the backend open while signed in (see api/socket.ts) */
export function useAgentSocket() {
  const token = useSession((s) => s.token);

  useEffect(() => {
    if (!USE_BACKEND || !token) return;
    connectAgentSocket(token, {
      forcedLogout: (message) => useSession.getState().logout(message, { serverEnded: true }),
      // The server's view wins, as on the web: a break set elsewhere, or PAUSED after a dropped connection.
      // INCALL / DISPO / RINGING belong to the call itself and leave the status pill alone.
      sessionUpdate: ({ status, activeBreak }) => {
        const s = useSession.getState();
        if (!s.live) return;
        if (activeBreak?.break_type_id) s.setStatus('break', { remote: true, breakCode: activeBreak.break_type_id });
        else if (status === 'READY') s.setStatus('available', { remote: true });
        else if (status === 'PAUSED' || status === 'BREAK') s.setStatus('offline', { remote: true });
      },
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') wakeAgentSocket();
    });
    return () => {
      sub.remove();
      disconnectAgentSocket();
    };
  }, [token]);
}
