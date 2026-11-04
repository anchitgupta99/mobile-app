import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useFirstLoad } from '@/hooks/useRefresh';
import { useData } from '@/store/data';
import { useTheme } from '@/theme';
import { Divider, EmptyState } from './ui';

function Bar({ w, h = 12 }: { w: number | `${number}%`; h?: number }) {
  const { c } = useTheme();
  return <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: c.mutedFill }} />;
}

/** Grey rows shaped like a list item, pulsing while data loads. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduced) return;
    o.set(withRepeat(withTiming(0.45, { duration: 800 }), -1, true));
    return () => {
      // Toggling Reduce Motion mid-pulse must not leave the skeleton stuck half-faded
      cancelAnimation(o);
      o.set(1);
    };
  }, [reduced, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.get() }));

  return (
    <Animated.View style={style} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <View key={i}>
          {i > 0 && <Divider inset={68} />}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.mutedFill }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Bar w={i % 2 ? '45%' : '60%'} h={14} />
              <Bar w={i % 3 ? '70%' : '35%'} />
            </View>
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

/**
 * Use as a list's empty component. Before the first sync it shows placeholders (or a retry if that sync
 * failed), so "nothing here" only appears once we actually know there is nothing.
 */
export function ListPlaceholder({ empty, count }: { empty: ReactNode; count?: number }) {
  const { loading, failed } = useFirstLoad();
  const refreshing = useData((s) => s.refreshing);
  if (loading || (failed && refreshing)) return <SkeletonRows count={count} />;
  if (failed)
    return (
      <EmptyState
        icon="cloud-off"
        title="Couldn't load your data"
        body="Check your connection and try again."
        action="Retry"
        onAction={() => void useData.getState().sync()}
      />
    );
  return <>{empty}</>;
}
