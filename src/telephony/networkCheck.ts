import { sampleNetwork } from '@/api/network';
import type { CallMode, NetworkSample, ServerConfig } from '@/domain/types';

export type NetworkVerdict = { sample: NetworkSample; mode: CallMode; reason: string };

export function judge(sample: NetworkSample, t: ServerConfig['modeThresholds']): NetworkVerdict {
  if (sample.type === 'none') return { sample, mode: 'bridge', reason: 'No data connection' };
  if (sample.latencyMs > t.maxLatencyMs) return { sample, mode: 'bridge', reason: `High latency (${sample.latencyMs} ms)` };
  if (sample.lossPct > t.maxLossPct) return { sample, mode: 'bridge', reason: `Packet loss ${sample.lossPct}%` };
  if (sample.jitterMs > t.maxJitterMs) return { sample, mode: 'bridge', reason: `Jitter ${sample.jitterMs} ms` };
  return { sample, mode: 'voip', reason: 'Network is good for data calls' };
}

export async function runNetworkCheck(t: ServerConfig['modeThresholds']): Promise<NetworkVerdict> {
  await new Promise((r) => setTimeout(r, 450 + Math.random() * 350));
  return judge(sampleNetwork(), t);
}

export function qualityLevel(s: NetworkSample): 0 | 1 | 2 | 3 {
  if (s.type === 'none') return 0;
  if (s.latencyMs > 400 || s.lossPct > 5 || s.jitterMs > 60) return 1;
  if (s.latencyMs > 200 || s.lossPct > 2 || s.jitterMs > 30) return 2;
  return 3;
}
