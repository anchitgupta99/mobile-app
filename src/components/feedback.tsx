import { useEffect, useMemo } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeInUp, FadeOut, Keyframe, runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';
import { feedback, type FeedbackEvent } from '@/feedback';
import { useTheme, type Tone, tone as toneOf } from '@/theme';
import { animateTo, duration } from '@/theme/motion';
import { Button, Icon, T, tap, type IconName } from './ui';

/** `title` is the bold first line of the web's toasts, e.g. "Call Failed" over the reason */
type Toast = { id: number; title?: string; message: string; tone: Tone; action?: { label: string; onPress: () => void } };
type DialogAction = { label: string; variant?: 'primary' | 'outline' | 'danger' | 'call'; onPress?: () => void };
type Dialog = { title: string; message: string; icon?: IconName; tone?: Tone; actions: DialogAction[] };

type FeedbackState = {
  toast: Toast | null;
  dialog: Dialog | null;
  showToast: (t: Omit<Toast, 'id'>) => void;
  hideToast: () => void;
  showDialog: (d: Dialog) => void;
  hideDialog: () => void;
};

export const useFeedback = create<FeedbackState>((set) => ({
  toast: null,
  dialog: null,
  showToast: (t) => set({ toast: { ...t, id: Date.now() } }),
  hideToast: () => set({ toast: null }),
  showDialog: (dialog) => set({ dialog }),
  hideDialog: () => set({ dialog: null }),
}));

const toastEvents: Partial<Record<Tone, FeedbackEvent>> = { success: 'toast.success', warning: 'toast.warning', error: 'toast.error' };

export function notify(message: string, tone: Tone = 'neutral', action?: Toast['action'], opts?: { silent?: boolean; title?: string }) {
  const ev = toastEvents[tone];
  if (ev && !opts?.silent) feedback(ev);
  useFeedback.getState().showToast({ title: opts?.title, message, tone, action });
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

  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        entering={FadeInUp.duration(duration.base)}
        exiting={FadeOut.duration(duration.fast)}
        accessibilityLiveRegion="polite"
        accessibilityRole="alert"
        style={[
          {
            maxWidth: 520,
            width: '100%',
            backgroundColor: c.invert,
            borderRadius: 12,
            paddingVertical: 12,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            shadowColor: c.shadow,
            shadowOpacity: 1,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          },
          drag,
        ]}
      >
        <Icon name={toneIcon[toast.tone]} size={20} color={c.onInvert} />
        <View style={{ flex: 1 }}>
          {!!toast.title && (
            <T v="bodyStrong" color={c.onInvert}>
              {toast.title}
            </T>
          )}
          <T v="body" color={c.onInvert}>
            {toast.message}
          </T>
        </View>
        {toast.action && (
          <Pressable
            accessibilityRole="button"
            hitSlop={12}
            onPress={() => {
              toast.action?.onPress();
              onHide();
            }}
          >
            <T v="label" color={c.lavender}>
              {toast.action.label}
            </T>
          </Pressable>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

export function FeedbackHost() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useFeedback((s) => s.toast);
  const dialog = useFeedback((s) => s.dialog);
  const hideToast = useFeedback((s) => s.hideToast);
  const hideDialog = useFeedback((s) => s.hideDialog);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(hideToast, toast.action ? 5000 : 3000);
    return () => clearTimeout(t);
  }, [toast, hideToast]);

  const dt = dialog ? toneOf(c, dialog.tone ?? 'warning') : null;

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 92, alignItems: 'center' }}
      >
        {toast && <ToastCard key={toast.id} toast={toast} onHide={hideToast} />}
      </View>
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
