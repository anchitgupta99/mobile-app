import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal, Platform, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  Keyframe,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { feedback, type FeedbackEvent } from '@/feedback';
// callStore imports `notify` from here; the cycle is safe because each side only uses the other at call/render time
import { useCall } from '@/telephony/callStore';
import { useTheme, type Tone, tone as toneOf } from '@/theme';
import { animateTo, duration } from '@/theme/motion';
import { Button, Icon, T, tap, type IconName } from './ui';
import { Tappable } from './motion/Tappable';

/** An action may return a promise; the toast then shows a spinner on it until it settles */
type ToastActionT = { label: string; onPress: () => void | Promise<unknown> };
/** `title` is the bold first line of the web's toasts, e.g. "Call Failed" over the reason */
type Toast = { id: number; title?: string; message: string; tone: Tone; action?: ToastActionT; duration?: number };
export type ToastOptions = Omit<Toast, 'id' | 'tone'> & { tone?: Tone; silent?: boolean };

/** Distance from the safe-area top: below the top bar */
const TOAST_TOP = 64;
type DialogAction = { label: string; variant?: 'primary' | 'outline' | 'danger' | 'call'; onPress?: () => void };
type Dialog = { title: string; message: string; icon?: IconName; tone?: Tone; actions: DialogAction[] };

type FeedbackState = {
  toast: Toast | null;
  dialog: Dialog | null;
  showToast: (t: Omit<Toast, 'id'>) => void;
  hideToast: () => void;
  showDialog: (d: Dialog) => void;
  hideDialog: () => void;
  /** Open sheets, oldest first. Sheets are Modals above the root host, so the top-most one renders the toast. */
  sheets: number[];
  pushSheet: (id: number) => void;
  popSheet: (id: number) => void;
};

export const useFeedback = create<FeedbackState>((set) => ({
  toast: null,
  dialog: null,
  showToast: (t) => set({ toast: { ...t, id: Date.now() } }),
  hideToast: () => set({ toast: null }),
  showDialog: (dialog) => set({ dialog }),
  hideDialog: () => set({ dialog: null }),
  sheets: [],
  pushSheet: (id) => set((s) => ({ sheets: [...s.sheets, id] })),
  popSheet: (id) => set((s) => ({ sheets: s.sheets.filter((x) => x !== id) })),
}));

const toastEvents: Partial<Record<Tone, FeedbackEvent>> = { success: 'toast.success', warning: 'toast.warning', error: 'toast.error' };

/**
 * Shows a toast. Either `notify(message, tone, action?, { title, silent })`, or one options object:
 * `notify({ title, message, tone, action, duration })`.
 */
export function notify(options: ToastOptions): void;
export function notify(message: string, tone?: Tone, action?: ToastActionT, opts?: { silent?: boolean; title?: string }): void;
export function notify(
  arg: string | ToastOptions,
  tone: Tone = 'neutral',
  action?: ToastActionT,
  opts?: { silent?: boolean; title?: string },
) {
  const o: ToastOptions = typeof arg === 'string' ? { message: arg, tone, action, ...opts } : arg;
  const t = o.tone ?? 'neutral';
  const ev = toastEvents[t];
  if (ev && !o.silent) feedback(ev);
  useFeedback.getState().showToast({ title: o.title, message: o.message, tone: t, action: o.action, duration: o.duration });
}

export function alertDialog(d: Dialog) {
  tap('warning');
  useFeedback.getState().showDialog(d);
}

const toneIcon: Record<Tone, IconName> = {
  success: 'check-circle',
  error: 'error',
  warning: 'warning',
  info: 'info',
  purple: 'info',
  neutral: 'info',
};

// Keyframe entering animations never start inside a Modal on web (the view stays visibility:hidden),
// so the web build uses a plain fade; native keeps the scale-in.
const dialogIn =
  Platform.OS === 'web'
    ? FadeIn.duration(duration.base)
    : new Keyframe({
        0: { opacity: 0, transform: [{ scale: 0.96 }] },
        100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
      }).duration(duration.base);

/** Errors and warnings get a tinted card; the rest the inverted one */
const tinted = (t: Tone) => t === 'error' || t === 'warning';

/** How long a toast stays: longer when there's something to do or something went wrong */
export function toastDuration(t: Pick<Toast, 'tone' | 'action' | 'duration'>) {
  if (t.duration) return t.duration;
  return t.action || t.tone === 'error' ? 6000 : 4000;
}

function ToastAction({ action, onDone }: { action: ToastActionT; onDone: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  return (
    <Tappable
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      disabled={busy}
      hitSlop={4}
      onPress={async () => {
        tap('light');
        const res = action.onPress();
        // An action that waits on the server (Go online) keeps the toast up with a spinner until it's done
        if (res && typeof (res as Promise<unknown>).then === 'function') {
          setBusy(true);
          try {
            await res;
          } finally {
            setBusy(false);
          }
        }
        onDone();
      }}
      style={({ pressed }) => ({
        minHeight: 40,
        minWidth: 64,
        paddingHorizontal: 14,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? c.primaryPressed : c.primary,
        opacity: busy ? 0.8 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={c.onPrimary} />
      ) : (
        <T v="label" color={c.onPrimary}>
          {action.label}
        </T>
      )}
    </Tappable>
  );
}

function ToastCard({ toast, onHide }: { toast: Toast; onHide: () => void }) {
  const { c } = useTheme();
  const tx = useSharedValue(0);
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .onUpdate((e) => {
          tx.set(e.translationX);
        })
        .onEnd((e, success) => {
          if (!success) {
            tx.set(animateTo(0, 'snappy', false));
            return;
          }
          if (Math.abs(e.translationX) > 80 || Math.abs(e.velocityX) > 800) runOnJS(onHide)();
          else tx.set(animateTo(0, 'snappy', false));
        }),
    [onHide, tx],
  );
  const drag = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.get() }],
    opacity: 1 - Math.min(Math.abs(tx.get()) / 240, 0.6),
  }));

  // Auto-hide, paused while the agent is touching the toast. With a screen reader on, a toast that asks for
  // something stays until it's used or swiped away.
  const remaining = useRef(toastDuration(toast));
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pause = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(1500, remaining.current - (Date.now() - startedAt.current));
  };
  const resume = () => {
    if (timer.current) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(onHide, remaining.current);
  };
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((on) => {
      if (!cancelled && !(on && toast.action)) resume();
    });
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    // Once per toast
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const t = toneOf(c, toast.tone);
  const isTinted = tinted(toast.tone);
  const fg = isTinted ? c.ink : c.onInvert;

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        entering={FadeInDown.duration(duration.base)}
        exiting={FadeOut.duration(duration.fast)}
        accessibilityLiveRegion={isTinted ? 'assertive' : 'polite'}
        accessibilityRole="alert"
        onTouchStart={pause}
        onTouchEnd={resume}
        onTouchCancel={resume}
        style={[
          {
            maxWidth: 520,
            width: '100%',
            // Tones' backgrounds are see-through in dark mode, so the tint sits on an opaque surface
            backgroundColor: isTinted ? c.surface : c.invert,
            borderRadius: 12,
            borderWidth: isTinted ? 1 : 0,
            borderColor: t.line,
            borderLeftWidth: isTinted ? 4 : 0,
            borderLeftColor: t.fg,
            overflow: 'hidden',
            shadowColor: c.shadow,
            shadowOpacity: 1,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          },
          drag,
        ]}
      >
        <View
          style={{
            backgroundColor: isTinted ? t.bg : 'transparent',
            paddingVertical: 12,
            paddingLeft: isTinted ? 12 : 16,
            paddingRight: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Icon name={toneIcon[toast.tone]} size={22} color={isTinted ? t.fg : c.onInvert} />
          <View style={{ flex: 1 }}>
            {!!toast.title && (
              <T v="bodyStrong" color={fg}>
                {toast.title}
              </T>
            )}
            <T v="body" color={fg}>
              {toast.message}
            </T>
          </View>
          {toast.action && <ToastAction action={toast.action} onDone={onHide} />}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

/**
 * The toast. The root host shows it only while no sheet is open; otherwise the top-most sheet renders this
 * inside its own Modal (`sheetId`), since a Modal covers everything rendered outside it.
 */
export function ToastLayer({ sheetId }: { sheetId?: number }) {
  const insets = useSafeAreaInsets();
  const toast = useFeedback((s) => s.toast);
  const hideToast = useFeedback((s) => s.hideToast);
  const top = useFeedback((s) => s.sheets[s.sheets.length - 1]);
  if (top !== sheetId) return null;
  return (
    // At the top, under the top bar: clear of the tab bar's Call button, the dial pad and the call controls
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, top: insets.top + TOAST_TOP, alignItems: 'center' }}>
      {toast && <ToastCard key={toast.id} toast={toast} onHide={hideToast} />}
    </View>
  );
}

export function FeedbackHost() {
  const { c } = useTheme();
  const dialog = useFeedback((s) => s.dialog);
  const hideDialog = useFeedback((s) => s.hideDialog);
  const inCall = useCall((s) => !!s.call);
  const wasInCall = useRef(inCall);

  // A Modal stays above the incoming-call screen, so a ringing call would go unseen behind the dialog
  useEffect(() => {
    if (inCall && !wasInCall.current && useFeedback.getState().dialog) hideDialog();
    wasInCall.current = inCall;
  }, [inCall, hideDialog]);

  const dt = dialog ? toneOf(c, dialog.tone ?? 'warning') : null;

  return (
    <>
      <ToastLayer />
      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={hideDialog} statusBarTranslucent navigationBarTranslucent>
        <View style={{ flex: 1, backgroundColor: c.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {dialog && dt && (
            <Animated.View
              entering={dialogIn}
              accessibilityRole="alert"
              style={{
                width: '100%',
                maxWidth: 400,
                backgroundColor: c.surface,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: c.divider,
                padding: 24,
                alignItems: 'center',
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: dt.bg,
                  borderWidth: 1,
                  borderColor: dt.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={dialog.icon ?? toneIcon[dialog.tone ?? 'warning']} size={30} color={dt.fg} />
              </View>
              <T v="h2" style={{ textAlign: 'center' }}>
                {dialog.title}
              </T>
              <T v="body" color={c.ink2} style={{ textAlign: 'center' }}>
                {dialog.message}
              </T>
              <View style={{ flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 10 }}>
                {dialog.actions.map((a) => (
                  <Button
                    key={a.label}
                    label={a.label}
                    variant={a.variant ?? 'primary'}
                    style={{ flex: 1 }}
                    onPress={() => {
                      hideDialog();
                      a.onPress?.();
                    }}
                  />
                ))}
              </View>
            </Animated.View>
          )}
        </View>
      </Modal>
    </>
  );
}
