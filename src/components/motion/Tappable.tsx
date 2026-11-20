import { forwardRef, useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type PressableStateCallbackType, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { animateTo } from '@/theme/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children'> & {
  /** A plain style, or a function of `{ pressed }` like Pressable's. */
  style?: StyleProp<ViewStyle> | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: PressableStateCallbackType) => ReactNode);
  /**
   * How far the control shrinks while held. 0.97 suits buttons, chips and icons;
   * pass 1 for full-width rows, where a shrink looks like the layout moving.
   */
  scaleTo?: number;
};

/**
 * Drop-in for Pressable: same props, same `({ pressed })` style and children, plus a quick
 * spring shrink on press-in so every tap is acknowledged the moment a finger lands.
 * The hit area is unchanged; only the visual scales. Reduce Motion skips the shrink.
 */
export const Tappable = forwardRef<View, Props>(function Tappable(
  { style, children, scaleTo = 0.97, disabled, onPressIn, onPressOut, ...rest },
  ref,
) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const [pressed, setPressed] = useState(false);
  const state = { pressed, hovered: false } as PressableStateCallbackType;
  const shrink = scaleTo < 1 && !reduced;

  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      disabled={disabled}
      onPressIn={(e) => {
        setPressed(true);
        if (shrink) scale.set(animateTo(scaleTo, 'snappy', false));
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        if (shrink) scale.set(animateTo(1, 'snappy', reduced));
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? style(state) : style, shrink && anim]}
    >
      {typeof children === 'function' ? children(state) : children}
    </AnimatedPressable>
  );
});
