import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { feedback } from '@/feedback';
import { useTheme } from '@/theme';
import { animateTo, duration, easing } from '@/theme/motion';
import { keyboardBehavior } from '../keyboard';

const DISMISS = 120; // px dragged down
const FLING = 900; // px/s downward velocity

export function AnimatedSheet({
  open,
  onClose,
  handle,
  children,
  sheetStyle,
}: {
  open: boolean;
  onClose: () => void;
  /** The draggable area: grabber and title. Content below it scrolls normally. */
  handle: ReactNode;
  children: ReactNode;
  sheetStyle?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  // Adjust state during render (not in an effect) so the Modal mounts in the same pass as `open` flips.
  if (open && !mounted) setMounted(true);
  const y = useSharedValue(height);
  const start = useSharedValue(0);
  const armed = useSharedValue(false);
  const openSV = useSharedValue(open);
  const shown = useSharedValue(open);

  const hide = () => setMounted(false);

  const exit = () => {
    'worklet';
    y.set(
      withTiming(height, { duration: reduced ? duration.fast : duration.base, easing: easing.exit }, (done) => {
        // Only unmount if the exit finished and the sheet was not reopened meanwhile
        if (done && !openSV.get()) {
          shown.set(false);
          runOnJS(hide)();
        }
      }),
    );
  };

  useEffect(() => {
    openSV.set(open);
    if (open) {
      // A fresh mount starts below the current window height (rotation while closed); a reopen mid-close continues from y.
      if (!shown.get()) y.set(height);
      shown.set(true);
      y.set(animateTo(0, 'gentle', reduced));
    } else {
      exit();
    }
    // Only react to open/close. Re-running on `mounted` would restart the enter animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(open)
        .activeOffsetY([-8, 8])
        .failOffsetX([-20, 20])
        .onStart(() => {
          cancelAnimation(y);
          start.set(y.get());
        })
        .onUpdate((e) => {
          const next = start.get() + e.translationY;
          // Rubber band when pulled up past the top
          y.set(next > 0 ? next : next / 4);
          const past = y.get() > DISMISS;
          if (past !== armed.get()) {
            armed.set(past);
            if (past) runOnJS(feedback)('sheet.snap');
          }
        })
        .onEnd((e) => {
          armed.set(false);
          if (!openSV.get()) exit();
          else if (y.get() > DISMISS || e.velocityY > FLING) runOnJS(onClose)();
          else y.set(animateTo(0, 'gentle', reduced));
        })
        .onFinalize((_e, success) => {
          // Cancelled (e.g. gesture disabled mid-drag because the sheet closed): make sure the exit still completes
          if (!success && !openSV.get()) exit();
        }),
    // `exit` only closes over shared values plus height/reduced, which are listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, onClose, height, reduced],
  );

  const sheetAnim = useAnimatedStyle(() => ({ transform: [{ translateY: Math.max(y.value, -24) }] }));
  const backdropAnim = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, height], [1, 0], Extrapolation.CLAMP) }));

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {/* Android Modals render outside the root view and need their own gesture root */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={keyboardBehavior} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: c.overlay }, backdropAnim]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ flex: 1 }} />
          </Animated.View>
          <Animated.View style={[sheetStyle, sheetAnim]}>
            <GestureDetector gesture={pan}>
              <View>{handle}</View>
            </GestureDetector>
            {children}
          </Animated.View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}
