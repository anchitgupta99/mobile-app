import { useEffect, useState } from 'react';
import { api } from '@/api/client';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CampaignScript = { campaignId: string; enabled: boolean; text: string };

/**
 * The call's campaign script, loaded when the call screen opens, as the web's call page loads it for every call
 * (CallDashboard → GET /api/tenant/campaigns/:id). Null until it has loaded, when the campaign isn't known yet
 * (an auto-dial group before the server picks its campaign), or when it couldn't be loaded; the web then shows no
 * Script tab either.
 */
export function useCampaignScript(campaignId: string | undefined): CampaignScript | null {
  const [script, setScript] = useState<CampaignScript | null>(null);

  useEffect(() => {
    if (!campaignId || !UUID.test(campaignId)) return;
    let gone = false;
    api.campaigns
      .script(campaignId)
      .then((s) => {
        if (!gone) setScript({ campaignId, ...s });
      })
      // As the web: a script that can't be loaded just isn't shown
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [campaignId]);

  // A script loaded for another campaign (the call's campaign changed) isn't this call's
  return script && script.campaignId === campaignId ? script : null;
}
