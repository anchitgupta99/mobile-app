import { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Extrapolation, interpolate, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { Icon, type IconName } from '@/components/ui';
import { feedback } from '@/feedback';
import { animateTo } from '@/theme/motion';

export type SwipeAction = { icon: IconName; bg: string; fg: string; onTrigger: () => void };

const THRESHOLD = 84;
const MAX = THRESHOLD * 1.3;

/**
 * `left` is revealed on the left edge and fires on a swipe RIGHT; `right` fires on a swipe LEFT.
 * Give the child Pressable matching accessibilityActions; swipes are not reachable by screen readers.
 */
export function SwipeRow({ left, right, children }: { left?: SwipeAction; right?: SwipeAction; children: ReactNode }) {
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const zone = useSharedValue(0); // -1 | 0 | 1
  const hasLeft = !!left;
  const hasRight = !!right;
  const fireLeft = () => left?.onTrigger();
  const fireRight = () => right?.onTrigger();

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(hasLeft || hasRight)
        .activeOffsetX([-12, 12])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          const nx = Math.min(hasLeft ? MAX : 0, Math.max(hasRight ? -MAX : 0, e.translationX));
          x.set(nx);
          const z = nx > THRESHOLD ? 1 : nx < -THRESHOLD ? -1 : 0;
          if (z !== zone.get()) {
            zone.set(z);
            if (z !== 0) runOnJS(feedback)('swipe.threshold');
          }
        })
        .onEnd((_e, success) => {
          if (!success) return;
          if (zone.get() === 1) runOnJS(fireLeft)();
          else if (zone.get() === -1) runOnJS(fireRight)();
        })
        .onFinalize(() => {
          zone.set(0);
          x.set(animateTo(0, 'snappy', reduced));
        }),
    // The action callbacks are read through fireLeft/fireRight at trigger time
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasLeft, hasRight, reduced, left?.onTrigger, right?.onTrigger],
  );

  const row = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  const leftPane = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [0, THRESHOLD], [0, 1], Extrapolation.CLAMP) }));
  const rightPane = useAnimatedStyle(() => ({ opacity: interpolate(x.get(), [-THRESHOLD, 0], [1, 0], Extrapolation.CLAMP) }));

  return (
    <View style={{ overflow: 'hidden' }}>
      {left && (
        <Animated.View
          style={[{ position: 'absolute', inset: 0, backgroundColor: left.bg, justifyContent: 'center', paddingLeft: 24 }, leftPane]}
        >
          <Icon name={left.icon} color={left.fg} />
        </Animated.View>
      )}
      {right && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              inset: 0,
              backgroundColor: right.bg,
              justifyContent: 'center',
              alignItems: 'flex-end',
              paddingRight: 24,
            },
            rightPane,
          ]}
        >
          <Icon name={right.icon} color={right.fg} />
        </Animated.View>
      )}
      <GestureDetector gesture={pan}>
        <Animated.View style={row}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
