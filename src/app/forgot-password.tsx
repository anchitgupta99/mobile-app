import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ApiError, api } from '@/api/client';
import { keyboardBehavior } from '@/components/keyboard';
import { PageHeader } from '@/components/PageHeader';
import { Button, Field, Icon, IconButton, T } from '@/components/ui';
import { useTheme } from '@/theme';
import { duration } from '@/theme/motion';

type Step = 'email' | 'code' | 'password' | 'done';

const RESEND_SECONDS = 30;

const stepCopy: Record<Step, { title: string; hint: (email: string) => string }> = {
  email: {
    title: 'Reset your password',
    hint: () => 'Enter the email linked to your Claritel account. We will send you a confirmation code.',
  },
  code: { title: 'Check your email', hint: (email) => `We sent a 6-digit code to ${email}. It expires in 10 minutes.` },
  password: { title: 'Set a new password', hint: () => 'Use at least 8 characters. You will log in with it on web and mobile.' },
  done: { title: 'Password updated', hint: () => 'Your password has been reset. Log in with your new password.' },
};

function message(e: unknown) {
  if (e instanceof ApiError && e.code === 'offline') return 'No connection. Try again when you are online.';
  return e instanceof Error ? e.message : 'Something went wrong';
}

export default function ForgotPassword() {
  const { c } = useTheme();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const confirmRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const attempt = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    attempt(async () => {
      const res = await api.auth.requestPasswordReset(email.trim());
      setRequestId(res.requestId);
      setCode('');
      setResendIn(RESEND_SECONDS);
      setStep('code');
    });

  const verifyCode = () =>
    attempt(async () => {
      if (!requestId) return;
      const res = await api.auth.verifyResetCode(requestId, code);
      setResetToken(res.resetToken);
      setStep('password');
    });

  const savePassword = () =>
    attempt(async () => {
      if (!resetToken) return;
      if (password.length < 8) throw new Error('Use at least 8 characters');
      if (password !== confirm) throw new Error('Passwords do not match');
      await api.auth.resetPassword(resetToken, password);
      setStep('done');
    });

  const copy = stepCopy[step];

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={{ flex: 1, backgroundColor: c.surface }}>
      <PageHeader title="Forgot password" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 24, gap: 18, flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          <Animated.View key={step} entering={FadeIn.duration(duration.base)} style={{ gap: 4 }}>
            {step === 'done' && <Icon name="check-circle" size={40} color={c.purple} />}
            <T v="h2" accessibilityRole="header">
              {copy.title}
            </T>
            <T v="caption">{copy.hint(email.trim())}</T>
          </Animated.View>

          {step === 'email' && (
            <>
              <Field
                label="Email"
                icon="mail-outline"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                keyboardType="email-address"
                returnKeyType="send"
                autoFocus
                onSubmitEditing={() => void sendCode()}
                error={error}
              />
              <Button label="Send code" size="lg" full loading={busy} disabled={!email.trim() || busy} onPress={() => void sendCode()} />
            </>
          )}

          {step === 'code' && (
            <>
              <Field
                label="Confirmation code"
                icon="pin"
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                returnKeyType="done"
                autoFocus
                onSubmitEditing={() => void verifyCode()}
                error={error}
              />
              <Button
                label="Verify code"
                size="lg"
                full
                loading={busy}
                disabled={code.length !== 6 || busy}
                onPress={() => void verifyCode()}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setError(null);
                    setStep('email');
                  }}
                  hitSlop={12}
                  style={{ minHeight: 32, justifyContent: 'center' }}
                >
                  <T v="label" color={c.purple}>
                    Change email
                  </T>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: resendIn > 0 || busy }}
                  disabled={resendIn > 0 || busy}
                  onPress={() => void sendCode()}
                  hitSlop={12}
                  style={{ minHeight: 32, justifyContent: 'center' }}
                >
                  <T v="label" color={resendIn > 0 ? c.ink3 : c.purple} nums>
                    {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
                  </T>
                </Pressable>
              </View>
            </>
          )}

          {step === 'password' && (
            <>
              <Field
                label="New password"
                icon="lock-outline"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!show}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                autoFocus
                onSubmitEditing={() => confirmRef.current?.focus()}
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
              <Field
                ref={confirmRef}
                label="Confirm new password"
                icon="lock-outline"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!show}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={() => void savePassword()}
                error={error}
              />
              <Button
                label="Reset password"
                size="lg"
                full
                loading={busy}
                disabled={password.length < 8 || !confirm || busy}
                onPress={() => void savePassword()}
              />
            </>
          )}

          {step === 'done' && (
            <Button label="Back to Log In" size="lg" full onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
