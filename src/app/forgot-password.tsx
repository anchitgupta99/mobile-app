import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { ApiError, api, type PasswordRules } from '@/api/client';
import { webText } from '@/api/errors';
import { TIMED_OUT } from '@/api/http';
import { keyboardBehavior } from '@/components/keyboard';
import { PageHeader } from '@/components/PageHeader';
import { Button, Field, Icon, IconButton, T } from '@/components/ui';
import { font, useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { Tappable } from '@/components/motion/Tappable';

/**
 * Forgot password, step for step and word for word the web's (pages/auth/ForgotPassword.tsx): email or username,
 * a 4-digit code from the registered email, then the new password against the server's rules. Opened from the
 * login screen, or straight on "Create new password" when the login said the password has expired.
 */
type Step = 'email' | 'code' | 'password' | 'success' | 'inactive';

const OTP_LENGTH = 4;
const REDIRECT_DELAY_MS = 3000;
const SUPPORT_EMAIL = 'product@claritel.ai';

// Used only if the server's answer has no rules (backend passwordPolicy.ts values), as on the web
const FALLBACK_RULES: PasswordRules = { minLength: 8, uppercase: true, lowercase: true, number: true, symbol: true, historyDepth: 5 };

type ChecklistItem = { label: string; met: boolean };

// The web's checklist (the same as its Settings › Change password), built from the server's rules
function buildChecklist(rules: PasswordRules, newPassword: string, confirmPassword: string, reusedPassword: string) {
  const ruleItems: ChecklistItem[] = [
    { label: `At least ${rules.minLength} characters`, met: newPassword.length >= rules.minLength },
    ...(rules.uppercase ? [{ label: 'An uppercase letter', met: /[A-Z]/.test(newPassword) }] : []),
    ...(rules.lowercase ? [{ label: 'A lowercase letter', met: /[a-z]/.test(newPassword) }] : []),
    ...(rules.number ? [{ label: 'A number', met: /[0-9]/.test(newPassword) }] : []),
    ...(rules.symbol ? [{ label: 'A symbol', met: /[^A-Za-z0-9]/.test(newPassword) }] : []),
  ];
  return {
    checklist: [
      ...ruleItems,
      // Only the server can check this: met until it rejects the password
      ...(rules.historyDepth > 0
        ? [{ label: `Not one of your last ${rules.historyDepth} passwords`, met: newPassword.length > 0 && newPassword !== reusedPassword }]
        : []),
      { label: 'Both passwords match', met: confirmPassword.length > 0 && confirmPassword === newPassword },
    ],
    rulesMet: ruleItems.every((i) => i.met),
  };
}

// The web's extractApiError: a timeout, no answer at all, else the server's error, its message, the fallback
function errorText(e: unknown, fallback: string) {
  if (e instanceof ApiError && e.reason === TIMED_OUT) return 'The request timed out. Please try again.';
  if (!(e instanceof ApiError) || !e.server) return 'Unable to reach the server. Please check your connection.';
  return webText(e, ['error', 'message'], fallback);
}

function serverBody(e: unknown): { code?: string; error?: string; resendIn?: unknown } {
  const body = e instanceof ApiError ? e.server?.body : undefined;
  return body && typeof body === 'object' ? (body as { code?: string; error?: string; resendIn?: unknown }) : {};
}

/**
 * The server's rules checked field by field: anything missing or of the wrong type takes the fallback's value, so
 * rules without a usable minLength can't ask for a password no one can type
 */
function checkedRules(raw: unknown): PasswordRules {
  if (!raw || typeof raw !== 'object') return FALLBACK_RULES;
  const r = raw as Partial<Record<keyof PasswordRules, unknown>>;
  const flag = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  const count = (v: unknown, d: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : d);
  return {
    minLength: typeof r.minLength === 'number' && Number.isInteger(r.minLength) && r.minLength > 0 ? r.minLength : FALLBACK_RULES.minLength,
    uppercase: flag(r.uppercase, FALLBACK_RULES.uppercase),
    lowercase: flag(r.lowercase, FALLBACK_RULES.lowercase),
    number: flag(r.number, FALLBACK_RULES.number),
    symbol: flag(r.symbol, FALLBACK_RULES.symbol),
    historyDepth: count(r.historyDepth, FALLBACK_RULES.historyDepth),
  };
}

/** The `rules` route param the login passes on (JSON) */
function parseRules(raw?: string): PasswordRules | null {
  if (!raw) return null;
  try {
    return checkedRules(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Back to the login screen this was opened from, rather than a second one on top of it */
function backToLogin() {
  router.dismissTo('/login');
}

export default function ForgotPassword() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ identifier?: string; expired?: string; resetToken?: string; rules?: string }>();
  const expired = params.expired === '1';
  // From sign-in with a right but expired password: straight to "Create new password", no email code
  const fromExpiredLogin = expired && !!params.resetToken;

  const [step, setStep] = useState<Step>(fromExpiredLogin ? 'password' : 'email');
  const [identifier, setIdentifier] = useState(params.identifier ?? '');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState(fromExpiredLogin ? (params.resetToken ?? '') : '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rules, setRules] = useState<PasswordRules>(() => parseRules(params.rules) ?? FALLBACK_RULES);
  // The password the server turned down as one of the last N
  const [reusedPassword, setReusedPassword] = useState('');
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeInfo, setCodeInfo] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitConfirmError, setSubmitConfirmError] = useState('');
  const [inactiveMessage, setInactiveMessage] = useState('');
  const [resendIn, setResendIn] = useState(0);
  // When a new code may be requested (ms); the countdown is worked out from it, so time away still counts
  const resendAt = useRef(0);
  // A step's request is on its way: a second Send / Next (keyboard Go, double tap) is ignored until it ends
  const busy = useRef(false);
  const otpRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const { checklist, rulesMet: passwordValid } = useMemo(
    () => buildChecklist(rules, newPassword, confirmPassword, reusedPassword),
    [rules, newPassword, confirmPassword, reusedPassword],
  );
  // The web shows "Passwords do not match" once the confirm field has been left with a different password
  const confirmError = submitConfirmError || (confirmTouched && confirmPassword && confirmPassword !== newPassword ? 'Passwords do not match' : '');

  const startResendCountdown = (seconds: number) => {
    resendAt.current = Date.now() + seconds * 1000;
    setResendIn(Math.max(0, seconds));
  };

  // Timers pause while the phone is in the agent's email app, so each tick (and coming back) reads the clock
  const counting = resendIn > 0;
  useEffect(() => {
    if (!counting) return;
    const tick = () => setResendIn(Math.max(0, Math.ceil((resendAt.current - Date.now()) / 1000)));
    const t = setInterval(tick, 1000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [counting]);

  useEffect(() => {
    if (step !== 'success') return;
    const t = setTimeout(backToLogin, REDIRECT_DELAY_MS);
    return () => clearTimeout(t);
  }, [step]);

  const showInactive = (message?: string) => {
    setInactiveMessage(message || 'This account is marked inactive. Please contact your Admin.');
    setStep('inactive');
  };

  const sendCode = async (isResend: boolean) => {
    const trimmed = identifier.trim();
    if (!trimmed) {
      setEmailError('Please enter your email or username.');
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setEmailError('');
    setCodeError('');
    setCodeInfo('');
    try {
      const data = await api.auth.requestPasswordReset(trimmed);
      setMaskedEmail(data.maskedEmail);
      startResendCountdown(Number(data.resendIn) || 0);
      setOtp('');
      setStep('code');
      if (isResend) {
        setCodeInfo('A new code has been sent to your email.');
        otpRef.current?.focus();
      }
    } catch (e) {
      const data = serverBody(e);
      if (data.code === 'USER_INACTIVE') return showInactive(data.error);
      const retry = Number(data.resendIn);
      if (retry > 0) startResendCountdown(retry);
      const msg = errorText(e, 'Could not send the code. Please try again.');
      if (isResend) setCodeError(msg);
      else setEmailError(msg);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (otp.length !== OTP_LENGTH) {
      setCodeError(`Please enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setCodeError('');
    setCodeInfo('');
    try {
      const data = await api.auth.verifyResetCode(identifier.trim(), otp);
      setResetToken(data.resetToken);
      setRules(checkedRules(data.rules));
      setStep('password');
    } catch (e) {
      setCodeError(errorText(e, 'Verification failed. Please try again.'));
      setOtp('');
      otpRef.current?.focus();
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const savePassword = async () => {
    // Already saving: a second Go would only get "session expired" once the first has reset the password
    if (busy.current) return;
    setConfirmTouched(true);
    if (!passwordValid) {
      setPasswordError('Password does not meet all the requirements');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSubmitConfirmError('Passwords do not match');
      return;
    }
    busy.current = true;
    setLoading(true);
    setPasswordError('');
    try {
      await api.auth.resetPassword(resetToken, newPassword, confirmPassword);
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
      setStep('success');
    } catch (e) {
      const data = serverBody(e);
      if (data.code === 'USER_INACTIVE') return showInactive(data.error);
      if (data.code === 'RESET_EXPIRED') {
        setResetToken('');
        setNewPassword('');
        setConfirmPassword('');
        setConfirmTouched(false);
        setEmailError('Your session expired. Please request a new code.');
        setStep('email');
        return;
      }
      if (data.code === 'PASSWORD_REUSED') setReusedPassword(newPassword);
      setPasswordError(errorText(e, 'Could not update password. Please try again.'));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  const heading = (title: string, lines: string[]) => (
    <Animated.View key={step} entering={FadeIn.duration(duration.base)} style={{ gap: 4 }}>
      <T v="h2" accessibilityRole="header">
        {title}
      </T>
      <T v="caption">{lines.join('\n')}</T>
    </Animated.View>
  );

  const contactLine = (
    <T v="caption" color={c.ink2} style={{ textAlign: 'center' }}>
      Do not have your credentials? Contact:{' '}
      <T v="caption" color={c.purple} accessibilityRole="link" onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}>
        {SUPPORT_EMAIL}
      </T>
    </T>
  );

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={{ flex: 1, backgroundColor: c.surface }}>
      <PageHeader title="Forgot password" />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={{ padding: 24, gap: 18, flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          {step === 'email' && (
            <>
              {heading(
                'Reset your password',
                expired
                  ? ['Your password has expired. Please enter your email or username.', 'We will send a code to your registered email']
                  : ['Please enter your email or username.', 'We will send a code to your registered email'],
              )}
              <Field
                label="Email / Username"
                icon="person-outline"
                placeholder="Your email or username"
                value={identifier}
                onChangeText={(v) => {
                  setIdentifier(v);
                  if (emailError) setEmailError('');
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="send"
                autoFocus
                onSubmitEditing={() => void sendCode(false)}
                error={emailError || null}
              />
              <Button label={loading ? 'Sending...' : 'Send'} size="lg" full loading={loading} disabled={loading} onPress={() => void sendCode(false)} />
              {contactLine}
            </>
          )}

          {step === 'code' && (
            <>
              {heading('Code verification', [
                `We sent you a code to ${maskedEmail || 'your registered email'}.`,
                'Please enter that code in the field below',
              ])}
              <View>
                <Pressable
                  accessibilityRole="none"
                  onPress={() => otpRef.current?.focus()}
                  style={{ flexDirection: 'row', gap: 12 }}
                >
                  {Array.from({ length: OTP_LENGTH }, (_, i) => {
                    const digit = otp[i] ?? '';
                    return (
                      <View
                        key={i}
                        style={{
                          flex: 1,
                          height: 56,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: codeError ? c.errorFg : digit ? c.purple : c.controlBorder,
                          backgroundColor: c.surface,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <T v="h2" nums>
                          {digit}
                        </T>
                      </View>
                    );
                  })}
                </Pressable>
                {/* One field behind the boxes, so the phone can fill the code in and paste works */}
                <TextInput
                  ref={otpRef}
                  value={otp}
                  onChangeText={(v) => {
                    setOtp(v.replace(/\D/g, '').slice(0, OTP_LENGTH));
                    if (codeError) setCodeError('');
                  }}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={OTP_LENGTH}
                  autoFocus
                  caretHidden
                  accessibilityLabel={`${OTP_LENGTH}-digit code`}
                  onSubmitEditing={() => void verifyCode()}
                  style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 }}
                />
              </View>
              {!!codeError && (
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="warning-amber" size={16} color={c.errorFg} />
                  <T v="caption" color={c.errorFg}>
                    {codeError}
                  </T>
                </View>
              )}
              {!!codeInfo && !codeError && (
                <T v="caption" color={c.successFg} style={{ textAlign: 'center' }}>
                  {codeInfo}
                </T>
              )}
              <View style={{ alignItems: 'center', gap: 6 }}>
                <T v="caption" color={c.ink3}>
                  {"Didn't get the email?"}
                </T>
                {resendIn > 0 ? (
                  <T v="body" color={c.ink2} nums>
                    Request a new code in{' '}
                    <T v="h3" color={c.purple} nums>
                      {resendIn}
                    </T>{' '}
                    s
                  </T>
                ) : (
                  <Tappable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: loading }}
                    disabled={loading}
                    onPress={() => void sendCode(true)}
                    hitSlop={12}
                    style={{ minHeight: 32, justifyContent: 'center' }}
                  >
                    <T v="label" color={c.purple} style={{ textDecorationLine: 'underline' }}>
                      Request a new code
                    </T>
                  </Tappable>
                )}
              </View>
              <Button label={loading ? 'Verifying...' : 'Next'} size="lg" full loading={loading} disabled={loading} onPress={() => void verifyCode()} />
            </>
          )}

          {step === 'password' && (
            <>
              {heading(
                'Create new password',
                fromExpiredLogin && resetToken ? ['Your password has expired. Please choose a new one.'] : ['Please enter new password.'],
              )}
              <Field
                label="New Password"
                icon="lock-outline"
                placeholder="Your new password"
                value={newPassword}
                onChangeText={(v) => {
                  setNewPassword(v);
                  if (passwordError) setPasswordError('');
                  if (submitConfirmError) setSubmitConfirmError('');
                }}
                secureTextEntry={!show}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                autoFocus
                onSubmitEditing={() => confirmRef.current?.focus()}
                error={passwordError || null}
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
                label="Confirm new Password"
                icon="lock-outline"
                placeholder="Confirm your new password"
                value={confirmPassword}
                onChangeText={(v) => {
                  setConfirmPassword(v);
                  if (submitConfirmError) setSubmitConfirmError('');
                }}
                onBlur={() => setConfirmTouched(true)}
                secureTextEntry={!show}
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={() => void savePassword()}
                error={confirmError || null}
              />
              <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
                <T v="label" style={{ fontFamily: font.semibold }}>
                  Your password needs
                </T>
                {checklist.map((item) => (
                  <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon
                      name={item.met ? 'check-circle' : 'radio-button-unchecked'}
                      size={16}
                      color={item.met ? c.successFg : c.ink3}
                    />
                    <T v="caption" color={item.met ? c.ink : c.ink2} accessibilityLabel={`${item.label}, ${item.met ? 'met' : 'not met yet'}`}>
                      {item.label}
                    </T>
                  </View>
                ))}
              </View>
              <Button label={loading ? 'Saving...' : 'Next'} size="lg" full loading={loading} disabled={loading} onPress={() => void savePassword()} />
            </>
          )}

          {step === 'success' && (
            <Animated.View entering={FadeIn.duration(duration.base)} style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
              <Icon name="check-circle" size={64} color={c.successFg} />
              <T v="h2" style={{ textAlign: 'center' }} accessibilityRole="header">
                Your new password was successfully created
              </T>
              <T v="body" color={c.ink2} style={{ textAlign: 'center' }}>
                {"Please wait...\nIt won't take long."}
              </T>
            </Animated.View>
          )}

          {step === 'inactive' && (
            <Animated.View entering={FadeIn.duration(duration.base)} style={{ alignItems: 'center', gap: 12, paddingVertical: 24 }}>
              <Icon name="warning-amber" size={64} color={c.errorFg} />
              <T v="h2" style={{ textAlign: 'center' }} accessibilityRole="header">
                User is inactive.
              </T>
              <Button label="Back to Login" size="lg" full style={{ marginTop: 24 }} onPress={backToLogin} />
              <T v="body" color={c.ink2} style={{ textAlign: 'center' }}>
                {inactiveMessage}
              </T>
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
