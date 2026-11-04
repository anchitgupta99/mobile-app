import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { useTheme } from '@/theme';
import { tap } from './ui';

/** 0–1 slider: drag or tap anywhere on the track. Steps of 5% for screen readers. */
export function Slider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(1);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  const set = (x: number) => onChange(Math.round(clamp(x / width) * 100) / 100);

  // Horizontal-only: the pan activates after a sideways move and fails on a vertical one, so starting
  // a scroll on the track hands off to the parent ScrollView without writing a value. A plain tap
  // (no movement) is handled by the Tap gesture; the two race so only one of them fires.
  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX([-6, 6])
      .failOffsetY([-8, 8])
      .onStart((e) => runOnJS(set)(e.x))
      .onUpdate((e) => runOnJS(set)(e.x))
      .onEnd((_e, success) => {
        if (success) runOnJS(tap)('light');
      });
    const press = Gesture.Tap()
      .maxDistance(6)
      .onEnd((e, success) => {
        if (!success) return;
        runOnJS(set)(e.x);
        runOnJS(tap)('light');
      });
    return Gesture.Race(pan, press);
    // `set` closes over width/onChange, which are the only inputs that change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, onChange]);

  const pct = `${clamp(value) * 100}%` as const;
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100), text: `${Math.round(value * 100)}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => onChange(clamp(value + (e.nativeEvent.actionName === 'increment' ? 0.05 : -0.05)))}
        onLayout={(e) => setWidth(Math.max(1, e.nativeEvent.layout.width))}
        style={{ height: 32, justifyContent: 'center', flex: 1 }}
      >
        <View style={{ height: 6, borderRadius: 3, backgroundColor: c.mutedFill, borderWidth: 1, borderColor: c.divider }}>
          <View style={{ width: pct, height: '100%', borderRadius: 3, backgroundColor: c.purple }} />
        </View>
        <View
          style={{
            position: 'absolute',
            left: pct,
            marginLeft: -11,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: c.surface,
            borderWidth: 2,
            borderColor: c.purple,
          }}
        />
      </View>
    </GestureDetector>
  );
}
