import type { ReactNode } from 'react';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { duration } from '@/theme/motion';

/**
 * Opacity-only enter/exit for list rows. Fades are kept under Reduce Motion. Pass `enter={false}` inside
 * FlatList/SectionList rows: virtualized rows remount as they scroll back into view, and would fade in again each time.
 */
export function FadeInItem({ children, enter = true }: { children: ReactNode; enter?: boolean }) {
  return (
    <Animated.View entering={enter ? FadeIn.duration(duration.base) : undefined} exiting={FadeOut.duration(duration.fast)}>
      {children}
    </Animated.View>
  );
}
