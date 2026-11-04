import { useEffect, useRef, type ComponentProps } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { T } from '@/components/ui';
import { duration, easing } from '@/theme/motion';

type TProps = Omit<ComponentProps<typeof T>, 'children'>;

/**
 * One character that rolls up into place when it changes. It animates its own transform and
 * opacity instead of using an `entering` layout animation: on web, entering animations take
 * siblings out of flow and the characters stack on top of each other.
 */
function Digit({ ch, reduced, t }: { ch: string; reduced: boolean; t: TProps }) {
  const progress = useSharedValue(1);
  const prev = useRef(ch);

  useEffect(() => {
    if (prev.current === ch) return;
    prev.current = ch;
    if (reduced) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: duration.fast, easing: easing.enter }));
  }, [ch, reduced, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 6 }],
  }));

  return (
    <Animated.View style={style}>
      <T {...t} nums>
        {ch}
      </T>
    </Animated.View>
  );
}

/** Timer text where each changed character rolls up into place. Tabular numerals keep the width stable. */
export function RollingDigits({ text, accessible = true, ...t }: { text: string; accessible?: boolean } & TProps) {
  const reduced = useReducedMotion();
  return (
    <View
      style={{ flexDirection: 'row' }}
      {...(accessible
        ? { accessible: true, accessibilityLabel: text }
        : { accessible: false, importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true })}
    >
      {/* Keyed by position from the right so 9:59 -> 10:00 keeps the seconds digits in place */}
      {text.split('').map((ch, i, all) => (
        <Digit key={all.length - i} ch={ch} reduced={reduced} t={t} />
      ))}
    </View>
  );
}
