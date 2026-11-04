import { useEffect } from 'react';
import { AppState } from 'react-native';
import { USE_BACKEND } from '@/api/http';
import { useSession } from '@/store/session';
import { useSipPhone } from './sipPhone';

/** Keeps the in-app webphone registered while an agent is signed in on the SIP login type; unregisters on logout */
export function useSipRegistration() {
  const token = useSession((s) => s.token);
  const loginMode = useSession((s) => s.loginMode);
  const wanted = USE_BACKEND && !!token && loginMode === 'webrtc';

  useEffect(() => {
    if (!wanted) return;
    void useSipPhone.getState().start();
    // JsSIP reconnects a dropped socket itself; a refused registration only gets another go on the way back in
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && useSipPhone.getState().status === 'failed') void useSipPhone.getState().retry();
    });
    return () => {
      sub.remove();
      useSipPhone.getState().stop();
    };
  }, [wanted]);
}
