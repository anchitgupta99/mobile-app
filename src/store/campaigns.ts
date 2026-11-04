import { create } from 'zustand';
import { USE_BACKEND } from '@/api/http';
import type { Campaign } from '@/domain/types';
import { campaigns as demoCampaigns } from '@/mocks/seed';

type CampaignsState = {
  /** The agent's campaigns (and auto-dial group), loaded after login by useSession.syncCampaign */
  list: Campaign[];
  /** The admin lets this agent pick their campaign (users.allow_campaign_selection) */
  allowSelection: boolean;
  /** Why the last campaign sync failed, shown on "Ready to go live?" */
  error: string | null;
};

export const useCampaigns = create<CampaignsState>(() => ({
  list: USE_BACKEND ? [] : demoCampaigns,
  allowSelection: true,
  error: null,
}));

/** Records why a campaign sync failed (useSession.syncCampaign), for the go-live screen */
export function setCampaignError(e: unknown) {
  const error = e instanceof Error ? e.message : "Couldn't load your campaigns.";
  if (__DEV__) console.log('[Campaign] failed', error);
  useCampaigns.setState({ error });
}

export function findCampaign(id: string | undefined) {
  return useCampaigns.getState().list.find((c) => c.id === id);
}
