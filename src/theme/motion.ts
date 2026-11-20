import { Easing, withSpring, withTiming, type WithSpringConfig } from 'react-native-reanimated';

export const duration = { fast: 150, base: 220, slow: 320 } as const;

// Close to critically damped: a slight settle, no visible bounce.
export const spring = {
  snappy: { damping: 34, stiffness: 420, mass: 1 },
  gentle: { damping: 29, stiffness: 260, mass: 1 },
} satisfies Record<string, WithSpringConfig>;

// Custom curves: the built-in cubic is too soft to feel intentional. No ease-in anywhere:
// it starts slow, so the UI feels late at the exact moment the user is watching.
export const easing = {
  /** Strong ease-out: moves at once, settles gently */
  enter: Easing.bezier(0.23, 1, 0.32, 1),
  /** iOS-style drawer curve: quick to leave, no sluggish start */
  exit: Easing.bezier(0.32, 0.72, 0, 1),
};

/** Spring to `to`, or a short timed move when Reduce Motion is on. */
export function animateTo(to: number, kind: keyof typeof spring, reduced: boolean) {
  'worklet';
  return reduced ? withTiming(to, { duration: duration.fast }) : withSpring(to, spring[kind]);
}
