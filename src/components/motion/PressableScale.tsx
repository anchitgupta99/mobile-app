import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { animateTo } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

// Values a pressed-only key falls back to when the base style does not set it
const RESET: Partial<Record<keyof ViewStyle, unknown>> = { opacity: 1, backgroundColor: 'transparent' };

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Merged over `style` while pressed (e.g. a pressed background). */
  pressedStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: ReactNode | ((state: { pressed: boolean }) => ReactNode);
};

/** Pressable that springs to `scaleTo` on press-in. The hit area is unchanged; only the visual scales. */
export function PressableScale({ style, pressedStyle, scaleTo = 0.97, disabled, onPressIn, onPressOut, children, ...rest }: Props) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const pressedSV = useSharedValue(false);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  // `pressedStyle` is swapped in on the UI thread from a shared value, so a press never re-renders
  // the subtree. React state is only kept for render-prop children that read `pressed`.
  const needsPressedState = typeof children === 'function';
  const [pressed, setPressed] = useState(false);
  const { on, off } = useMemo(() => {
    const base = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
    const onStyle = (StyleSheet.flatten(pressedStyle) ?? {}) as Record<string, unknown>;
    const offStyle: Record<string, unknown> = {};
    for (const k of Object.keys(onStyle)) offStyle[k] = base[k] ?? (RESET as Record<string, unknown>)[k];
    return { on: onStyle as ViewStyle, off: offStyle as ViewStyle };
  }, [style, pressedStyle]);
  const pressedAnim = useAnimatedStyle(() => (pressedSV.value ? on : off), [on, off]);

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        pressedSV.set(true);
        if (needsPressedState) setPressed(true);
        if (!reduced) scale.set(animateTo(scaleTo, 'snappy', false));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressedSV.set(false);
        if (needsPressedState) setPressed(false);
        scale.set(animateTo(1, 'snappy', reduced));
        onPressOut?.(e);
      }}
      style={[style, anim, pressedAnim]}
    >
      {typeof children === 'function' ? children({ pressed }) : children}
    </AnimatedPressable>
  );
}
