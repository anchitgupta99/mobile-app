import { Easing, withSpring, withTiming, type WithSpringConfig } from 'react-native-reanimated';

export const duration = { fast: 150, base: 220, slow: 320 } as const;

// Close to critically damped: a slight settle, no visible bounce.
export const spring = {
  snappy: { damping: 34, stiffness: 420, mass: 1 },
  gentle: { damping: 29, stiffness: 260, mass: 1 },
} satisfies Record<string, WithSpringConfig>;

export const easing = {
  enter: Easing.out(Easing.cubic),
  exit: Easing.in(Easing.cubic),
};

/** Spring to `to`, or a short timed move when Reduce Motion is on. */
export function animateTo(to: number, kind: keyof typeof spring, reduced: boolean) {
  'worklet';
  return reduced ? withTiming(to, { duration: duration.fast }) : withSpring(to, spring[kind]);
}
