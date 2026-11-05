import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { USE_BACKEND } from '@/api/http';
import { useSession } from '@/store/session';
import { useCall } from '@/telephony/callStore';
import { useSipPhone, type SipStatus } from '@/telephony/sip/sipPhone';

const DOWN: SipStatus[] = ['failed', 'disconnected'];

/**
 * As the web (layout/agent/AgentLayout.tsx), which opens its system check when the webphone disconnects or fails
 * to register: once live, Diagnostics opens the moment that happens, with the reason and Try again. Not over a
 * call or a wrap-up in progress, and not when Diagnostics is already open.
 */
export function useWebphoneWatch() {
  const live = useSession((s) => s.live);
  const pathname = usePathname();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!USE_BACKEND || !live) return;
    return useSipPhone.subscribe((s, prev) => {
      if (!DOWN.includes(s.status) || DOWN.includes(prev.status)) return;
      const call = useCall.getState();
      if (call.call || call.wrapUpCallId || path.current === '/diagnostics') return;
      router.push('/diagnostics');
    });
  }, [live]);
}
