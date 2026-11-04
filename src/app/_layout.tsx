import { Roboto_400Regular, Roboto_500Medium, Roboto_600SemiBold, Roboto_700Bold, useFonts } from '@expo-google-fonts/roboto';
import { router, useSegments } from 'expo-router';
import { Stack } from 'expo-router/stack';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useState } from 'react';
import { AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { confirmLogout } from '@/components/AppMenu';
import { Logo } from '@/components/Logo';
import { Avatar, Button, T } from '@/components/ui';
import { duration } from '@/theme/motion';
import { api } from '@/api/client';
import { sampleNetwork, useNetwork } from '@/api/network';
import { realtime } from '@/api/realtime';
import { preloadSounds } from '@/feedback';
import { useCallFeedback } from '@/feedback/useCallFeedback';
import { useAgentSocket } from '@/hooks/useAgentSocket';
import { useSyncFailureToast } from '@/hooks/useSyncFailureToast';
import { useData } from '@/store/data';
import { useOutbox } from '@/store/outbox';
import { syncCampaign, useSession } from '@/store/session';
import { useSettings } from '@/store/settings';
import { useCall } from '@/telephony/callStore';
import { useSipRegistration } from '@/telephony/sip/useSipRegistration';
import { FeedbackHost } from '@/components/feedback';
import { SplashOverlay } from '@/components/splash/SplashOverlay';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

/** Lock when the agent has been away longer than the idle limit; otherwise just note they're active */
function lockIfIdle() {
  const s = useSession.getState();
  const settings = useSettings.getState();
  const idle =
    Platform.OS !== 'web' &&
    !!s.token &&
    settings.biometricLock &&
    Date.now() - s.lastActiveAt > settings.idleLockMinutes * 60000 &&
    !useCall.getState().call &&
    !useCall.getState().wrapUpCallId;
  if (idle) s.lock();
  else s.touch();
}

function useAppLifecycle() {
  const token = useSession((s) => s.token);
  const quality = useNetwork((s) => s.quality);
  useAgentSocket();
  useSipRegistration();

  useEffect(() => {
    if (quality !== 'offline' && token) {
      void useOutbox.getState().flush();
      void useData.getState().sync();
    }
  }, [quality, token]);

  // After login and on every app start, like the web on page load: the agent's campaigns and their active one
  useEffect(() => {
    if (token) void syncCampaign();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const beat = () => {
      if (useSession.getState().status === 'available') void api.agents.heartbeat(sampleNetwork()).catch(() => undefined);
    };
    beat();
    const t = setInterval(beat, 30000);
    return () => clearInterval(t);
  }, [token]);

  // Cold start is an "active" transition too: the idle check must not trust what was persisted
  const hydrated = useSession((s) => s.hydrated);
  useEffect(() => {
    if (hydrated) lockIfIdle();
  }, [hydrated]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const s = useSession.getState();
      if (state === 'active') {
        lockIfIdle();
        if (s.token) void useData.getState().sync();
      } else s.touch();
    });
    return () => sub.remove();
  }, []);

  useEffect(
    () =>
      realtime.on('device.revoked', ({ reason }) => {
        useSession.getState().logout(reason);
      }),
    [],
  );

  useEffect(
    () =>
      realtime.on('agent.status_changed', ({ status, breakCode, source }) => {
        if (source === 'web') useSession.getState().setStatus(status, { remote: true, breakCode });
      }),
    [],
  );
}

function useGate(ready: boolean) {
  const segments = useSegments();
  const hydrated = useSession((s) => s.hydrated);
  const token = useSession((s) => s.token);
  const live = useSession((s) => s.live);

  // The idle lock is not a route: it is an overlay drawn above the stack (see LockOverlay), so
  // unlocking leaves the agent exactly where they were.
  useEffect(() => {
    if (!ready || !hydrated) return;
    const top = segments[0] as string | undefined;
    if (!token) {
      if (top !== 'login' && top !== 'forgot-password') router.replace('/login');
    } else if (!live) {
      if (top !== 'preflight') router.replace('/preflight');
    } else if (top === 'login' || top === 'forgot-password' || top === 'preflight' || top === undefined) {
      router.replace('/');
    }
  }, [ready, hydrated, token, live, segments]);
}

/** Full-screen cover shown while the session is idle-locked; the stack underneath keeps its place */
function LockOverlay() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const agent = useSession((s) => s.agent);
  const unlock = useSession((s) => s.unlock);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('Unlock');

  const tryUnlock = useCallback(async () => {
    setError(null);
    // The web build never locks (see lockIfIdle); nothing to authenticate against here
    if (Platform.OS === 'web') return unlock();
    // Biometrics or the device passcode both count; only a device with no security at all is let through
    const level = await LocalAuthentication.getEnrolledLevelAsync();
    if (level === LocalAuthentication.SecurityLevel.NONE) return unlock();
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Claritel', fallbackLabel: 'Use passcode' });
    if (res.success) unlock();
    else if (res.error !== 'user_cancel' && res.error !== 'system_cancel' && res.error !== 'app_cancel')
      setError(res.error === 'lockout' ? 'Too many attempts. Use your passcode.' : 'Not recognised. Try again.');
  }, [unlock]);

  useEffect(() => {
    void (async () => {
      if (Platform.OS !== 'web') {
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION))
          setLabel(Platform.OS === 'ios' ? 'Unlock with Face ID' : 'Unlock with face');
        else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) setLabel('Unlock with fingerprint');
      }
      void tryUnlock();
    })();
  }, [tryUnlock]);

  // Hardware back must not pop the screen hiding behind the cover
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  return (
    <Animated.View
      entering={FadeIn.duration(duration.base)}
      exiting={FadeOut.duration(duration.base)}
      accessibilityViewIsModal
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: c.shell,
          paddingTop: insets.top + 48,
          paddingBottom: insets.bottom + 32,
          paddingHorizontal: 28,
          alignItems: 'center',
        },
      ]}
    >
      <Logo height={24} color={c.navy} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <Avatar name={agent?.name ?? 'Agent'} size={88} />
        <T v="h2">{agent?.name}</T>
        <T v="body" color={c.ink2}>
          Locked after inactivity
        </T>
        {error && (
          <T v="caption" color={c.errorFg}>
            {error}
          </T>
        )}
      </View>
      <View style={{ alignSelf: 'stretch', gap: 10, maxWidth: 420, width: '100%' }}>
        <Button label={label} icon="fingerprint" size="lg" full onPress={() => void tryUnlock()} />
        <Button label="Log out" variant="ghost" full onPress={confirmLogout} />
      </View>
    </Animated.View>
  );
}

function useCallRouting() {
  const callId = useCall((s) => s.call?.id ?? null);
  const direction = useCall((s) => s.call?.direction);
  const ringing = useCall((s) => s.call?.state === 'ringing' && s.call.direction === 'inbound');
  const wrap = useCall((s) => s.wrapUpCallId);
  // Call screens only exist inside a live, unlocked session; otherwise the auth gate owns navigation
  const inSession = useSession((s) => !!s.token && s.live && !s.locked);
  const segments = useSegments();

  useEffect(() => {
    if (!inSession) return;
    const here = segments.join('/');
    if (callId && direction === 'inbound' && ringing) {
      if (here !== 'call/incoming') router.push('/call/incoming');
    } else if (callId) {
      if (here !== 'call/active') {
        if (here === 'call/incoming') router.replace('/call/active');
        else router.push('/call/active');
      }
    } else if (wrap) {
      // Wrap-up is mandatory: whatever popped it (browser back, a lock, a reload) it comes straight back
      if (here === 'call/wrap-up') return;
      if (here === 'call/active' || here === 'call/incoming') router.replace({ pathname: '/call/wrap-up', params: { id: wrap } });
      else router.push({ pathname: '/call/wrap-up', params: { id: wrap } });
    } else if (here === 'call/active' || here === 'call/incoming') {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  }, [inSession, callId, direction, ringing, wrap, segments]);
}

function Root() {
  const { c } = useTheme();
  const [loaded] = useFonts({ Roboto_400Regular, Roboto_500Medium, Roboto_600SemiBold, Roboto_700Bold });
  const hydrated = useSession((s) => s.hydrated);
  const ready = loaded && hydrated;
  const [splash, setSplash] = useState(true);
  const endSplash = useCallback(() => setSplash(false), []);

  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(c.page);
  }, [c.page]);

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => {
    if (ready) void preloadSounds();
  }, [ready]);

  useAppLifecycle();
  useSyncFailureToast();
  useGate(ready);
  useCallRouting();
  useCallFeedback();

  return (
    <>
      {ready ? <App splash={splash} /> : <View style={{ flex: 1, backgroundColor: c.shell }} />}
      {splash && <SplashOverlay ready={ready} onDone={endSplash} />}
    </>
  );
}

function App({ splash }: { splash: boolean }) {
  const { c, scheme } = useTheme();
  const locked = useSession((s) => s.locked);
  return (
    <>
      <StatusBar style={splash || scheme !== 'dark' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.page },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="forgot-password" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="preflight" options={{ animation: 'fade' }} />
        <Stack.Screen
          name="call/incoming"
          options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }}
        />
        <Stack.Screen name="call/active" options={{ presentation: 'fullScreenModal', animation: 'fade', gestureEnabled: false }} />
        <Stack.Screen
          name="call/wrap-up"
          options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom', gestureEnabled: false }}
        />
        <Stack.Screen name="profile" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="notifications" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="diagnostics" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="sync" options={{ presentation: 'modal' }} />
      </Stack>
      {locked && <LockOverlay />}
      <FeedbackHost />
    </>
  );
}

export default function Layout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <Root />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
