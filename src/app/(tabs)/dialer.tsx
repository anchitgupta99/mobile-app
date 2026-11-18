import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { PressableScale } from '@/components/motion/PressableScale';
import { Icon, T, tap } from '@/components/ui';
import { formatDialed } from '@/domain/format';
import { feedback } from '@/feedback';
import { useDialpad } from '@/store/dialpad';
import { font, useTheme } from '@/theme';
import { animateTo } from '@/theme/motion';

const keys: [string, string][] = [
  ['1', ''],
  ['2', 'ABC'],
  ['3', 'DEF'],
  ['4', 'GHI'],
  ['5', 'JKL'],
  ['6', 'MNO'],
  ['7', 'PQRS'],
  ['8', 'TUV'],
  ['9', 'WXYZ'],
  ['*', ''],
  ['0', '+'],
  ['#', ''],
];

// Keys shrink on short screens (or large system font) so the number display never gets squeezed.
const KEY_MAX = 76;
const KEY_MIN = 54;
const DISPLAY_MIN = 112;

function Key({
  d,
  sub,
  size,
  onPress,
  onLongPress,
}: {
  d: string;
  sub: string;
  size: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { c } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={d === '*' ? 'star' : d === '#' ? 'pound' : d}
      scaleTo={0.94}
      onPress={() => {
        feedback('dial.key', { digit: d });
        onPress();
      }}
      onLongPress={onLongPress}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: c.surface,
        borderWidth: 1,
        borderColor: c.divider,
      }}
      pressedStyle={{ backgroundColor: c.lavender }}
    >
      <T
        maxFontSizeMultiplier={1.15}
        style={{ fontFamily: font.regular, fontSize: Math.round(size * 0.39), lineHeight: Math.round(size * 0.45) }}
        color={c.inkStrong}
      >
        {d}
      </T>
      <T v="overline" maxFontSizeMultiplier={1.15} color={c.ink3} style={{ fontSize: 9, lineHeight: 11, minHeight: 11 }}>
        {sub}
      </T>
    </PressableScale>
  );
}

export default function Dialer() {
  const { c } = useTheme();
  const num = useDialpad((s) => s.num);
  const setNum = useDialpad((s) => s.setNum);
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const prevLen = useRef(0);
  const [rootH, setRootH] = useState(0);

  useEffect(() => {
    const grew = num.length > prevLen.current;
    prevLen.current = num.length;
    if (reduced || !num) return;
    // Grows slightly on a new digit, dips on delete
    pop.set(withSequence(withTiming(grew ? 1.04 : 0.97, { duration: 60 }), animateTo(1, 'snappy', false)));
  }, [num, reduced, pop]);

  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  // 4 digit rows; the call button lives in the tab bar
  const rows = 4 + 3 * 0.2;
  const keypadBudget = rootH ? rootH - DISPLAY_MIN - 16 : Infinity;
  const key = Math.max(KEY_MIN, Math.min(KEY_MAX, Math.floor(keypadBudget / rows)));
  const rowGap = Math.round(key * 0.2);
  const colGap = Math.round(key * 0.3);
  const padW = 3 * key + 2 * colGap;

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setRootH(e.nativeEvent.layout.height)}>
      <View style={{ flex: 1, minHeight: DISPLAY_MIN, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 8 }}>
          <View style={{ width: 48 }} />
          <Animated.View style={[popStyle, { flex: 1 }]}>
            <T
              accessibilityLiveRegion="polite"
              numberOfLines={1}
              adjustsFontSizeToFit
              nums
              style={{ fontFamily: font.regular, fontSize: 36, lineHeight: 46, minHeight: 46, textAlign: 'center' }}
              color={num ? c.inkStrong : c.inkPlaceholder}
            >
              {num ? formatDialed(num) : 'Enter number'}
            </T>
          </Animated.View>
          <View style={{ width: 48, alignItems: 'center' }}>
            {!!num && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete digit"
                onPress={() => {
                  tap();
                  setNum((n) => n.slice(0, -1));
                }}
                onLongPress={() => {
                  tap('medium');
                  setNum(() => '');
                }}
                hitSlop={10}
                style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="backspace" size={24} color={c.ink2} />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      <View style={{ alignItems: 'center', gap: rowGap, paddingBottom: 28 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: padW, rowGap, columnGap: colGap, justifyContent: 'center' }}>
          {keys.map(([d, sub]) => (
            <Key
              key={d}
              d={d}
              sub={sub}
              size={key}
              onPress={() => setNum((n) => (n + d).slice(0, 16))}
              onLongPress={d === '0' ? () => setNum((n) => (n + '+').slice(0, 16)) : undefined}
            />
          ))}
        </View>
      </View>
    </View>
  );
}
