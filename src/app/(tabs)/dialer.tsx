import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { PressableScale } from '@/components/motion/PressableScale';
import { Icon, T, tap } from '@/components/ui';
import { formatDialed } from '@/domain/format';
import { feedback } from '@/feedback';
import { useStatusSheet } from '@/components/StatusSheet';
import { STATUS_DISPLAY } from '@/domain/agentStatus';
import type { DialBlock } from '@/domain/dialGate';
import { useDialAvailability } from '@/hooks/useDial';
import { useDialpad } from '@/store/dialpad';
import { font, tone as toneOf, useTheme } from '@/theme';
import { animateTo } from '@/theme/motion';
import { Tappable } from '@/components/motion/Tappable';

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
/** Room the status chip / banner takes above the number */
const HINT_H = 56;

/** The status chip (not online) or a banner (manual dialing off, no campaign, wrap-up) above the dial pad */
function DialHint({ block }: { block: DialBlock }) {
  const { c } = useTheme();
  if (block.reason === 'on_call') return null;
  if (block.reason === 'status') {
    const d = STATUS_DISPLAY[block.status];
    const t = toneOf(c, d.tone);
    return (
      <View style={{ alignItems: 'center', paddingTop: 8 }}>
        <Tappable
          accessibilityRole="button"
          accessibilityLabel={`Status: ${block.label}. You can't make calls until you go online. Change status`}
          onPress={() => {
            tap();
            useStatusSheet.getState().show();
          }}
          style={({ pressed }) => ({
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 22,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderWidth: 1,
            borderColor: t.line,
            backgroundColor: pressed ? c.pressed : t.bg,
          })}
        >
          <Icon name={d.icon} size={18} color={t.fg} />
          <T v="label" color={c.ink}>
            {block.label} · Go online to call
          </T>
          <Icon name="expand-more" size={18} color={c.ink2} />
        </Tappable>
      </View>
    );
  }
  const text =
    block.reason === 'manual_not_allowed'
      ? `Manual dialing is off for ${block.campaignName}`
      : block.reason === 'wrap_up'
        ? 'Finish wrap-up to make the next call'
        : 'Pick a campaign to start calling';
  const t = toneOf(c, 'warning');
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: 16,
        marginTop: 8,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.bg,
      }}
    >
      <Icon name={block.reason === 'manual_not_allowed' ? 'phone-disabled' : 'info'} size={18} color={t.fg} />
      <T v="label" color={c.ink} style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

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
        borderColor: c.line,
        // Same resting lift as cards, so keys sit above the page rather than blending into it
        boxShadow: c.cardShadow,
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
      <T v="overline" maxFontSizeMultiplier={1.15} color={c.ink2} style={{ lineHeight: 14, minHeight: 14, letterSpacing: 0.4 }}>
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
  const block = useDialAvailability('keypad');
  const keypadBudget = rootH ? rootH - DISPLAY_MIN - 16 - (block ? HINT_H : 0) : Infinity;
  const key = Math.max(KEY_MIN, Math.min(KEY_MAX, Math.floor(keypadBudget / rows)));
  const rowGap = Math.round(key * 0.2);
  const colGap = Math.round(key * 0.3);
  const padW = 3 * key + 2 * colGap;

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setRootH(e.nativeEvent.layout.height)}>
      {/* Why a call wouldn't go through, before the agent tries. Typing still works; only the call is blocked. */}
      {block && <DialHint block={block} />}
      <View style={{ flex: 1, minHeight: DISPLAY_MIN, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 8 }}>
          <View style={{ width: 48 }} />
          <Animated.View style={[popStyle, { flex: 1 }]}>
            <T
              accessibilityLiveRegion="polite"
              numberOfLines={1}
              adjustsFontSizeToFit
              nums
              v="display"
              style={{ fontFamily: font.regular, minHeight: 38, textAlign: 'center' }}
              color={num ? c.inkStrong : c.inkPlaceholder}
            >
              {num ? formatDialed(num) : 'Enter number'}
            </T>
          </Animated.View>
          <View style={{ width: 48, alignItems: 'center' }}>
            {!!num && (
              <Tappable
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
              </Tappable>
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
