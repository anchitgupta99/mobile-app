import type { CallMode } from '@/domain/types';

export type DialInput = { number: string; contactId: string | null };

export interface CallAdapter {
  readonly mode: CallMode;
  /** callId is the server's call UUID when there is a backend, which also says the lead and the actual campaign */
  dial(input: DialInput): Promise<{ callId: string; leadId?: string | null; campaignId?: string }>;
  answer(callId: string): Promise<void>;
  /** Takes the call's UUID (ActiveCall.uuid), which the server knows the call by */
  hold(callUuid: string, on: boolean): Promise<void>;
  mute(callId: string, on: boolean): Promise<void>;
  dtmf(callId: string, digit: string): Promise<void>;
  end(callId: string): Promise<void>;
}
