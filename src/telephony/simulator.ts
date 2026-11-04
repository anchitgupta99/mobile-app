import { realtime } from '@/api/realtime';
import type { CallMode } from '@/domain/types';
import { useData } from '@/store/data';
import { useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { buildPop } from './callStore';

export function simulateIncoming(opts: { appUnreachable?: boolean; unknown?: boolean } = {}) {
  const contacts = useData.getState().contacts.filter((c) => !c.dnc);
  const contact = opts.unknown ? null : (contacts[Math.floor(Math.random() * contacts.length)] ?? null);
  const number = contact?.phone ?? '+9198' + Math.floor(10000000 + Math.random() * 89999999);
  const ring = useSettings.getState().ringDevice;
  const pref = useSettings.getState().callMode;
  const fallback = !!opts.appUnreachable && ring !== 'phone';
  const mode: CallMode = ring === 'phone' || fallback || pref === 'bridge' ? 'bridge' : 'voip';
  const callId = `in_${Date.now().toString(36)}`;
  const deliver = () => {
    if (useSession.getState().status !== 'available') return;
    if (fallback) realtime.emit('call.fallback_triggered', { callId, reason: 'VoIP push not acknowledged in 5 s' });
    realtime.emit('call.incoming', { callId, mode, pop: buildPop(number, contact?.id), fallback });
  };
  if (fallback) setTimeout(deliver, useData.getState().server.inboundFallbackSeconds * 1000);
  else deliver();
}
