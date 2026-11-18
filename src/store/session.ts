import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { api } from '@/api/client';
import { ApiError } from '@/api/errors';
import { setAuthToken, setSessionExpiredHandler } from '@/api/http';
import type { Agent, AgentStatus, Campaign, LoginMode } from '@/domain/types';
import { setCampaignError, useCampaigns } from './campaigns';
import { useData } from './data';
import { useOutbox } from './outbox';
import { sessionStorage } from './storage';

type SessionState = {
  hydrated: boolean;
  token: string | null;
  agent: Agent | null;
  loginMode: LoginMode;
  /** Passed the "Ready to go live?" checks for this login */
  live: boolean;
  locked: boolean;
  lastActiveAt: number;
  status: AgentStatus;
  statusSince: string;
  breakCode: string | null;
  revokedReason: string | null;
  login: (loginId: string, password: string, mode: LoginMode) => Promise<void>;
  /** Loads the agent's campaigns and makes the chosen one active on the server (paused), as the web does on load */
  syncCampaign: () => Promise<void>;
  /** Tells the server the agent is ready for calls in their campaign */
  goLive: () => Promise<void>;
  setCampaign: (c: Campaign) => Promise<void>;
  /** Backend: switches whether the dialer sends this agent calls by itself */
  setAutoCall: (on: boolean) => Promise<void>;
  updateAgent: (patch: Partial<Pick<Agent, 'name' | 'email' | 'phone'>>) => void;
  setStatus: (status: AgentStatus, opts?: { remote?: boolean; breakCode?: string | null }) => void;
  lock: () => void;
  unlock: () => void;
  touch: () => void;
  /** serverEnded: the server already ended this session (logged in elsewhere, admin logout), so it isn't told again */
  logout: (reason?: string, opts?: { serverEnded?: boolean }) => void;
};

async function afterLogin(set: (p: Partial<SessionState>) => void, token: string, agent: Agent, loginMode: LoginMode) {
  setAuthToken(token);
  set({
    token,
    agent,
    locked: false,
    lastActiveAt: Date.now(),
    loginMode,
    live: false,
    revokedReason: null,
    status: 'offline',
    statusSince: new Date().toISOString(),
  });
  void useData.getState().sync();
}

export const useSession = create<SessionState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      token: null,
      agent: null,
      loginMode: 'webrtc',
      live: false,
      locked: false,
      lastActiveAt: Date.now(),
      status: 'offline',
      statusSince: new Date().toISOString(),
      breakCode: null,
      revokedReason: null,
      login: async (loginId, password, mode) => {
        const res = await api.auth.login(loginId.trim(), password, mode);
        await afterLogin(set, res.accessToken, res.agent, mode);
      },
      syncCampaign: async () => {
        const token = get().token;
        useCampaigns.setState({ error: null });
        const { items, defaultId, allowSelection } = await api.campaigns.list();
        if (__DEV__) console.log('[Campaign] list', items.map((c) => c.name), 'default', defaultId);
        useCampaigns.setState({ list: items, allowSelection });
        const a = get().agent;
        if (!a || get().token !== token) return;
        // Same order as the web: the campaign already in use, then the agent's default, then the first one
        const pick = items.find((c) => c.id === a.campaignId) ?? items.find((c) => c.id === defaultId) ?? items[0];
        if (!pick) {
          throw new ApiError('validation', 'You have no active campaign to go live in. Ask your admin to assign one.');
        }
        await api.campaigns.select(pick.id, { initial: true });
        if (__DEV__) console.log('[Campaign] active', pick.name);
        const latest = get().agent;
        if (get().token !== token || !latest) return;
        // The server now has the agent paused in this campaign, so an app restarted while live goes back
        // through "Ready to go live?" (re-registering the webphone) instead of claiming to be available
        set({ agent: { ...latest, campaignId: pick.id, campaignName: pick.name }, live: false, status: 'offline' });
        useData.getState().setCampaign(pick.id);
      },
      goLive: async () => {
        const campaignId = get().agent?.campaignId;
        if (!campaignId) throw new ApiError('validation', 'No active campaign is assigned to you. Please contact your admin.');
        await api.agents.goOnline(campaignId);
        // Already online on the server: nothing to queue
        set({ live: true, status: 'available', breakCode: null, statusSince: new Date().toISOString() });
      },
      setAutoCall: async (on) => {
        const enabled = await api.agents.setAutoCall(on);
        const a = get().agent;
        if (a) set({ agent: { ...a, autoCallEnabled: enabled } });
      },
      setCampaign: async (c) => {
        const a = get().agent;
        if (!a) return;
        // Switching puts the agent on pause in the new campaign on the server
        await api.campaigns.select(c.id, { oldCampaignId: a.campaignId });
        set({ agent: { ...a, campaignId: c.id, campaignName: c.name } });
        useData.getState().setCampaign(c.id);
        // Someone who was taking calls goes straight back online in the new campaign
        if (get().live && get().status === 'available') await api.agents.goOnline(c.id);
      },
      updateAgent: (patch) => {
        const a = get().agent;
        if (a) set({ agent: { ...a, ...patch } });
      },
      setStatus: (status, opts) => {
        const breakCode = status === 'break' ? (opts?.breakCode ?? null) : null;
        if (status === get().status && breakCode === get().breakCode) return;
        set({ status, breakCode, statusSince: new Date().toISOString() });
        // A change made elsewhere (web, supervisor) supersedes anything still queued here; otherwise
        // reconnecting would replay a stale Break over it.
        if (opts?.remote) useOutbox.getState().dropKind('status');
        else
          useOutbox.getState().enqueue({
            kind: 'status',
            label: `Status · ${breakCode ? `${status} (${breakCode})` : status}`,
            // Going online is per campaign on the server
            payload: { status, breakCode, campaignId: get().agent?.campaignId },
          });
      },
      lock: () => set({ locked: true }),
      unlock: () => set({ locked: false, lastActiveAt: Date.now() }),
      touch: () => set({ lastActiveAt: Date.now() }),
      logout: (reason, opts) => {
        // After the server ended the session (say the agent logged in on the web), a logout from here would
        // end the new session instead: the server's logout clears the agent's session row
        if (!opts?.serverEnded) {
          // End the session on the server too; the request takes the token before it's cleared below
          if (get().token) void api.auth.logout().catch(() => undefined);
        }
        setAuthToken(null);
        useCampaigns.setState({ list: [], allowSelection: true });
        useData.getState().wipe();
        useOutbox.getState().clear();
        set({
          token: null,
          agent: null,
          live: false,
          locked: false,
          lastActiveAt: Date.now(),
          status: 'offline',
          statusSince: new Date().toISOString(),
          breakCode: null,
          revokedReason: reason ?? null,
        });
      },
    }),
    {
      name: 'claritel.session',
      storage: sessionStorage,
      // Keychain items must stay small: persist the scalars and the agent card, never the CRM cache
      partialize: ({ hydrated, login, syncCampaign, goLive, setCampaign, setAutoCall, updateAgent, setStatus, lock, unlock, touch, logout, ...rest }) => rest,
      onRehydrateStorage: () => (state) => {
        // A saved login carries on after a restart, so its token goes back on the requests
        setAuthToken(state?.token ?? null);
        useSession.setState({ hydrated: true });
      },
    },
  ),
);

/** Shown on the login screen after the server refused the login (expired after 24 h, or revoked): the backend's wording */
export const SESSION_EXPIRED = 'Your session has expired. Please log in again.';

// A 401 from any request: signed out as on the web. The server already ended this login, so no logout call.
setSessionExpiredHandler(() => {
  const s = useSession.getState();
  if (s.token) s.logout(SESSION_EXPIRED, { serverEnded: true });
});

/** Runs useSession.syncCampaign and keeps why it failed for the go-live screen (which offers Try again) */
export function syncCampaign() {
  return useSession.getState().syncCampaign().catch(setCampaignError);
}
