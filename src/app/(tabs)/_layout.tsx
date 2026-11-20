import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppMenu } from '@/components/AppMenu';
import { StatusBanners } from '@/components/StatusBanners';
import { StatusSheet } from '@/components/StatusSheet';
import { TopBar } from '@/components/TopBar';
import { CountBadge, Icon, T, tap, type IconName } from '@/components/ui';
import { feedback } from '@/feedback';
import { useDial, useDialAvailability } from '@/hooks/useDial';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/store/data';
import { useDialpad } from '@/store/dialpad';
import { useCall } from '@/telephony/callStore';
import { font, useTheme } from '@/theme';
import { animateTo } from '@/theme/motion';
import { Tappable } from '@/components/motion/Tappable';

const tabs: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Home', icon: 'home' },
  calls: { label: 'Calls', icon: 'history' },
  dialer: { label: 'Dialer', icon: 'dialpad' },
  contacts: { label: 'Contacts', icon: 'people-alt' },
  callbacks: { label: 'Callbacks', icon: 'phone-callback' },
};

function useBadges() {
  // The clock comes from useNow, not from inside the selector: a selector only reruns when the store changes, so a
  // callback falling overdue would never update the badge
  const tasks = useData((s) => s.tasks);
  const now = useNow(30000);
  const overdue = useMemo(() => tasks.filter((t) => !t.done && new Date(t.dueAt).getTime() < now).length, [tasks, now]);
  return { callbacks: overdue } as Record<string, number>;
}

function TabIcon({ name, focused, color }: { name: IconName; focused: boolean; color: string }) {
  const reduced = useReducedMotion();
  const s = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (focused && !reduced) s.set(withSequence(withTiming(1.12, { duration: 90 }), animateTo(1, 'snappy', false)));
  }, [focused, reduced, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.get() }] }));
  return (
    <Animated.View style={style}>
      <Icon name={name} size={22} color={color} />
    </Animated.View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Raised center tab. On the Dialer tab it morphs into the green call button and places the call. */
function DialButton({ focused, onCall, label, onNavigate }: { focused: boolean; onCall: boolean; label: string; onNavigate: () => void }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const dial = useDial();
  const num = useDialpad((s) => s.num);
  const armed = focused && !onCall;
  // Dimmed when the call wouldn't go through, but still tappable so the agent is told why
  const block = useDialAvailability('keypad');
  const blocked = armed && !!block;
  const p = useSharedValue(armed ? 1 : 0);
  const press = useSharedValue(1);

  useEffect(() => {
    p.set(reduced ? withTiming(armed ? 1 : 0, { duration: 0 }) : animateTo(armed ? 1 : 0, 'gentle', false));
  }, [armed, reduced, p]);

  const from = onCall ? c.call : c.primary;
  const bg = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(p.get(), [0, 1], [from, c.call]),
    transform: [{ scale: press.get() }],
  }));
  const padIcon = useAnimatedStyle(() => ({
    opacity: 1 - p.get(),
    transform: [{ rotate: `${p.get() * 90}deg` }, { scale: 1 - p.get() * 0.4 }],
  }));
  const callIcon = useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: [{ rotate: `${(1 - p.get()) * -90}deg` }, { scale: 0.6 + p.get() * 0.4 }],
  }));

  const onPress = () => {
    if (!armed) return onNavigate();
    if (!num) {
      tap('warning');
      return;
    }
    // Not online, or manual calls turned off in the campaign: useDial says why and doesn't dial
    void dial({ number: num, source: 'keypad' }).then((ok) => ok && useDialpad.getState().clear());
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', opacity: blocked ? 0.45 : 1 }}>
      <AnimatedPressable
        accessibilityRole={armed ? 'button' : 'tab'}
        accessibilityHint={blocked ? "Calls can't start right now. Tap to see why." : undefined}
        accessibilityLabel={armed ? (num ? `Call ${num}` : 'Call. Enter a number first') : label}
        accessibilityState={{ selected: focused, disabled: armed && !num }}
        onPress={onPress}
        onPressIn={() => {
          if (!reduced) press.set(animateTo(0.92, 'snappy', false));
        }}
        onPressOut={() => press.set(animateTo(1, 'snappy', reduced))}
        style={[
          {
            marginTop: -26,
            width: 64,
            height: 64,
            borderRadius: 32,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 4,
            borderColor: c.surface,
            shadowColor: c.shadow,
            shadowOpacity: 1,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          },
          bg,
        ]}
      >
        <Animated.View style={[{ position: 'absolute' }, padIcon]}>
          <Icon name={onCall ? 'phone-in-talk' : 'dialpad'} size={28} color={onCall ? c.onCall : c.onPrimary} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute' }, callIcon]}>
          <Icon name="call" size={30} color={c.onCall} />
        </Animated.View>
      </AnimatedPressable>
      <T v="caption" color={focused ? c.accentInk : c.ink2} style={{ marginTop: 2, fontFamily: focused ? font.bold : font.medium }}>
        {armed ? 'Call' : label}
      </T>
    </View>
  );
}

function TabBar({ state, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const badges = useBadges();
  const onCall = useCall((s) => !!s.call);

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.divider,
        paddingBottom: Math.max(insets.bottom, 8),
        paddingTop: 6,
        paddingHorizontal: 4,
      }}
      accessibilityRole="tablist"
    >
      {state.routes.map((route, i) => {
        const meta = tabs[route.name];
        if (!meta) return null;
        const focused = state.index === i;
        const onPress = () => {
          feedback('select');
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        };
        if (route.name === 'dialer') {
          return <DialButton key={route.key} focused={focused} onCall={onCall} label={meta.label} onNavigate={onPress} />;
        }
        return (
          <Tappable
            key={route.key}
            accessibilityRole="tab"
            accessibilityLabel={`${meta.label}${badges[route.name] ? `, ${badges[route.name]} need attention` : ''}`}
            accessibilityState={{ selected: focused }}
            onPress={onPress}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 52, gap: 2 }}
          >
            {({ pressed }) => (
              <>
                <View
                  style={{
                    width: 56,
                    height: 30,
                    borderRadius: 15,
                    alignItems: 'center',
                    justifyContent: 'center',
                    // The pill shows on press too, so a tap is acknowledged before the screen changes
                    backgroundColor: focused ? c.tabSelected : pressed ? c.pressed : 'transparent',
                  }}
                >
                  <TabIcon name={meta.icon} focused={focused} color={focused ? c.accentInk : c.ink2} />
                  {!!badges[route.name] && (
                    <View style={{ position: 'absolute', top: -4, right: 6 }}>
                      <CountBadge n={badges[route.name]} />
                    </View>
                  )}
                </View>
                <T v="caption" color={focused ? c.accentInk : c.ink2} style={{ fontFamily: focused ? font.bold : font.medium }}>
                  {meta.label}
                </T>
              </>
            )}
          </Tappable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {/* One TopBar for all tabs, above the navigator: as each screen's header, every visited tab kept its own copy
          mounted, with its own timers and status-change feedback */}
      <TopBar />
      <StatusBanners />
      <Tabs
        tabBar={(p) => <TabBar {...p} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: c.page },
        }}
      >
        <Tabs.Screen name="index" />
        <Tabs.Screen name="calls" />
        <Tabs.Screen name="dialer" />
        <Tabs.Screen name="contacts" />
        <Tabs.Screen name="callbacks" />
      </Tabs>
      <StatusSheet />
      <AppMenu />
    </View>
  );
}
