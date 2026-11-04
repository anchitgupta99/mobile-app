import type { ReactNode } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { duration } from '@/theme/motion';

/** Opacity-only enter/exit for list rows. Fades are kept under Reduce Motion. */
export function FadeInItem({ children }: { children: ReactNode }) {
  return (
    <Animated.View entering={FadeIn.duration(duration.base)} exiting={FadeOut.duration(duration.fast)}>
      {children}
    </Animated.View>
  );
}
