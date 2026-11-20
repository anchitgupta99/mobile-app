import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Linking, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiError } from '@/api/client';
import { DEMO, TIMED_OUT } from '@/api/http';
import { InfoTip } from '@/components/InfoTip';
import { Logo } from '@/components/Logo';
import { helpText } from '@/domain/helpText';
import { Button, Field, Icon, IconButton, Segmented, T } from '@/components/ui';
import type { LoginMode } from '@/domain/types';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { keyboardBehavior } from '@/components/keyboard';
import { Tappable } from '@/components/motion/Tappable';

const modeCopy: Record<LoginMode, { title: string; hint: string }> = {
  webrtc: { title: 'Log In', hint: 'Calls ring in the app over the internet (SIP webphone).' },
  mobile: { title: 'Log In', hint: 'Calls ring on your mobile number through the phone line.' },
};

const SUPPORT_EMAIL = 'product@claritel.ai';

// The app's webphone (SIP over the internet) is the only way calls reach the agent for now; the phone-line
// login type (calls to the agent's own number) stays in the code, hidden, in case it's wanted later
const PHONE_LINE_LOGIN = false;

export default function Login() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const login = useSession((s) => s.login);
  const revokedReason = useSession((s) => s.revokedReason);
  const [mode, setMode] = useState<LoginMode>('webrtc');
  // The mock backend accepts any agent; prefill so a demo starts in one tap
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pwRef = useRef<TextInput>(null);
  // Set synchronously, unlike `busy`: the keyboard's Go skips the button's disabled state, and a double tap would
  // otherwise send two logins whose replies can arrive out of order (a stale token, then "session expired")
  const running = useRef(false);

  const run = async () => {
    if (running.current || !loginId || !password) return;
    running.current = true;
    setError(null);
    setBusy(true);
    try {
      await login(loginId, password, mode);
    } catch (e) {
      // As the web's login (pages/auth/Login.tsx): the password was right but has expired, so the reset opens
      // on "Create new password" with the server's reset token and rules (without a token, on the email step)
      if (e instanceof ApiError && e.reason === 'PASSWORD_EXPIRED') {
        const body = (e.server?.body ?? {}) as { resetToken?: unknown; rules?: unknown };
        router.push({
          pathname: '/forgot-password',
          params: {
            identifier: loginId.trim(),
            expired: '1',
            ...(typeof body.resetToken === 'string' && { resetToken: body.resetToken }),
            ...(typeof body.rules === 'object' && body.rules !== null ? { rules: JSON.stringify(body.rules) } : {}),
          },
        });
        return;
      }
      setError(
        // A timed-out request keeps its own words ("timed out"): it may be a slow server, not a missing connection
        e instanceof ApiError && e.code === 'offline' && e.reason !== TIMED_OUT
          ? 'No connection. Logging in needs the internet once.'
          : e instanceof Error
            ? e.message
            : 'Log in failed',
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={{ flex: 1, backgroundColor: c.surface }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View
          style={{
            backgroundColor: c.lavender,
            paddingTop: insets.top + 40,
            paddingBottom: 40,
            paddingHorizontal: 28,
            borderBottomLeftRadius: 32,
            borderBottomRightRadius: 32,
            alignItems: 'center',
          }}
        >
          <Logo height={28} color={c.onLavender} />
        </View>

        <View style={{ padding: 24, gap: 18, flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          <Animated.View key={mode} entering={FadeIn.duration(duration.base)} style={{ gap: 4 }}>
            <T v="h2" accessibilityRole="header">
              {modeCopy[mode].title}
            </T>
            <T v="caption">{modeCopy[mode].hint}</T>
          </Animated.View>
          {revokedReason && (
            <View
              style={{
                flexDirection: 'row',
                gap: 10,
                backgroundColor: c.warningBg,
                borderColor: c.warningLine,
                borderWidth: 1,
                borderRadius: 12,
                padding: 12,
              }}
            >
              <Icon name="logout" size={20} color={c.warningFg} />
              <T v="caption" color={c.warningFg} style={{ flex: 1 }}>
                {revokedReason}
              </T>
            </View>
          )}
          {PHONE_LINE_LOGIN && (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                <T v="label" color={c.ink2}>
                  Login type
                </T>
                <InfoTip {...helpText.loginType} size={15} />
              </View>
              <Segmented<LoginMode>
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'webrtc', label: 'SIP' },
                  { value: 'mobile', label: 'Mobile' },
                ]}
              />
            </View>
          )}
          <Field
            label="Login ID"
            icon="person-outline"
            value={loginId}
            onChangeText={setLoginId}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => pwRef.current?.focus()}
          />
          <Field
            ref={pwRef}
            label="Password"
            icon="lock-outline"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!show}
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void run()}
            error={error}
            right={
              <IconButton
                icon={show ? 'visibility-off' : 'visibility'}
                label={show ? 'Hide password' : 'Show password'}
                variant="plain"
                size={40}
                onPress={() => setShow(!show)}
              />
            }
          />
          <Tappable
            accessibilityRole="link"
            onPress={() => router.push('/forgot-password')}
            hitSlop={12}
            style={{ alignSelf: 'flex-end', minHeight: 32, justifyContent: 'center', marginTop: -8 }}
          >
            <T v="label" color={c.purple}>
              Forgot your password?
            </T>
          </Tappable>
          {DEMO && (
            <View
              accessibilityRole="text"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, backgroundColor: c.infoBg }}
            >
              <Icon name="science" size={18} color={c.infoFg} />
              <T v="caption" color={c.ink} style={{ flex: 1 }}>
                Demo mode: no server is connected. Any login ID and password work, and calls answer by themselves.
              </T>
            </View>
          )}
          <Button label="Log In" size="lg" full loading={busy} disabled={!loginId || !password || busy} onPress={() => void run()} />
          <T v="caption" color={c.ink2} style={{ textAlign: 'center' }}>
            Do not have your credentials? Contact:{' '}
            <T v="caption" color={c.purple} accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
              {SUPPORT_EMAIL}
            </T>
          </T>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
