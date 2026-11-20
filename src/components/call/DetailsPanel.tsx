import { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeInUp, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { keyboardBehavior } from '@/components/keyboard';
import { detailProgress } from '@/domain/details';
import { feedback } from '@/feedback';
import { useDetails } from '@/store/details';
import { useTheme } from '@/theme';
import { animateTo } from '@/theme/motion';
import { Icon, T, tap } from '../ui';
import { DetailFields } from './DetailFields';
import { Tappable } from '@/components/motion/Tappable';

/** Height of the collapsed bar; the call screen keeps this much room for it */
export const DETAILS_BAR_H = 56;
/** How far a drag must go to open or close it */
const SNAP = 40;
const FLING = 600;

/**
 * "Required details", at the top of the call screen once the call connects. Collapsed it's a slim bar with the
 * progress ("Required details · 1 of 2 captured"); drag it down (or tap) to fill the fields in, drag up to put
 * it away. It sits at the top so the keyboard, which opens from the bottom, never fights it for space, and it
 * never grows past `maxHeight`, the room above the call controls, so End, Mute and Hold stay reachable.
 */
export function DetailsPanel({ callId, maxHeight, style }: { callId: string; maxHeight: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const d = useDetails((s) => s.byCall[callId]);
  const [open, setOpen] = useState(false);
  const [contentH, setContentH] = useState(0);
  const openH = Math.max(DETAILS_BAR_H, Math.min(maxHeight, DETAILS_BAR_H + contentH));

  const h = useSharedValue(DETAILS_BAR_H);
  const start = useSharedValue(DETAILS_BAR_H);
  useEffect(() => {
    h.set(animateTo(open ? openH : DETAILS_BAR_H, 'gentle', reduced));
  }, [open, openH, reduced, h]);

  const toggle = (next: boolean) => {
    setOpen(next);
    feedback('sheet.snap');
  };

  const drag = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .failOffsetX([-20, 20])
        .onStart(() => {
          start.set(h.get());
        })
        .onUpdate((e) => {
          h.set(Math.max(DETAILS_BAR_H, Math.min(openH, start.get() + e.translationY)));
        })
        .onEnd((e) => {
          const wasOpen = start.get() > DETAILS_BAR_H + 1;
          const next = wasOpen ? !(e.translationY < -SNAP || e.velocityY < -FLING) : e.translationY > SNAP || e.velocityY > FLING;
          h.set(animateTo(next ? openH : DETAILS_BAR_H, 'gentle', reduced));
          runOnJS(toggle)(next);
        }),
    [openH, reduced, h, start],
  );
  const sized = useAnimatedStyle(() => ({ height: h.get() }));

  if (!d) return null;
  const p = detailProgress(d.fields, d.entries);
  const done = p.captured === p.total;
  const summary = `${p.requiredOnly ? 'Required details' : 'Details'} · ${p.captured} of ${p.total} captured`;

  return (
    <Animated.View
      entering={FadeInUp.duration(320)}
      style={[
        {
          borderRadius: 16,
          backgroundColor: c.surface,
          borderWidth: 1,
          borderColor: done ? c.successLine : c.line,
          overflow: 'hidden',
          shadowColor: c.shadow,
          shadowOpacity: open ? 1 : 0,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: open ? 8 : 0,
        },
        sized,
        style,
      ]}
    >
      <GestureDetector gesture={drag}>
        <Tappable scaleTo={1}
          accessibilityRole="button"
          accessibilityLabel={summary}
          accessibilityHint={open ? 'Hides the details' : 'Shows the details to fill in'}
          accessibilityState={{ expanded: open }}
          onPress={() => {
            tap();
            toggle(!open);
          }}
          style={({ pressed }) => ({
            height: DETAILS_BAR_H,
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            backgroundColor: pressed ? c.pressed : 'transparent',
          })}
        >
          <Icon name={done ? 'task-alt' : 'assignment'} size={20} color={done ? c.successFg : c.purple} />
          <View style={{ flex: 1, gap: 4 }}>
            <T v="label" numberOfLines={1}>
              {summary}
            </T>
            {/* Progress, as a bar as well as the count */}
            <View style={{ height: 4, borderRadius: 2, backgroundColor: c.mutedFill, overflow: 'hidden' }}>
              <View
                style={{
                  height: 4,
                  width: `${p.total ? (p.captured / p.total) * 100 : 0}%`,
                  backgroundColor: done ? c.successFg : c.purple,
                }}
              />
            </View>
          </View>
          {/* The drag handle */}
          <View style={{ alignItems: 'center', gap: 2 }}>
            <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: c.line }} />
            <Icon name={open ? 'expand-less' : 'expand-more'} size={20} color={c.ink2} />
          </View>
        </Tappable>
      </GestureDetector>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={keyboardBehavior === 'padding'}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 12 }}
        onContentSizeChange={(_w, ch) => setContentH(ch)}
        style={{ borderTopWidth: 1, borderColor: c.divider }}
      >
        <DetailFields callId={callId} />
      </ScrollView>
    </Animated.View>
  );
}
