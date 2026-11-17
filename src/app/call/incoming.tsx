import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CallMeta } from '@/components/call/CallMeta';
import { InfoTip } from '@/components/InfoTip';
import { ModeBadge } from '@/components/ModeBadge';
import { helpText } from '@/domain/helpText';
import { PressableScale } from '@/components/motion/PressableScale';
import { feedback } from '@/feedback';
import { useCallParty } from '@/components/PhoneText';
import { Avatar, Icon, T, tap, type IconName } from '@/components/ui';
import { useCall } from '@/telephony/callStore';
import { font, useTheme } from '@/theme';

function RoundAction({
  icon,
  label,
  bg,
  fg,
  onPress,
  breathe,
  haptic = true,
  disabled,
  busy,
}: {
  icon: IconName;
  label: string;
  bg: string;
  fg: string;
  onPress: () => void;
  breathe?: boolean;
  haptic?: boolean;
  disabled?: boolean;
  /** A spinner in place of the icon while its request is with the server */
  busy?: boolean;
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const b = useSharedValue(1);

  useEffect(() => {
    if (!breathe || reduced) return;
    b.set(withRepeat(withSequence(withTiming(1.04, { duration: 900 }), withTiming(1, { duration: 900 })), -1));
    return () => cancelAnimation(b);
  }, [breathe, reduced, b]);

  const breatheStyle = useAnimatedStyle(() => ({ transform: [{ scale: b.get() }] }));

  return (
    <View style={{ alignItems: 'center', gap: 8 }}>
      <Animated.View style={breatheStyle}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!disabled, busy: !!busy }}
          scaleTo={0.94}
          disabled={disabled}
          onPress={() => {
            if (haptic) tap('medium');
            onPress();
          }}
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: bg,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled && !busy ? 0.6 : 1,
          }}
        >
          {busy ? <ActivityIndicator color={fg} /> : <Icon name={icon} size={34} color={fg} />}
        </PressableScale>
      </Animated.View>
      <T v="label" color={c.onCallScreen}>
        {label}
      </T>
    </View>
  );
}

export default function Incoming() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const call = useCall((s) => s.call);
  const answer = useCall((s) => s.answer);
  const decline = useCall((s) => s.decline);
  const party = useCallParty();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduced) return;
    pulse.set(withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);

  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.get(), [0, 1], [0.9, 0]),
    transform: [{ scale: interpolate(pulse.get(), [0, 1], [1, 1.9]) }],
  }));

  if (!call) return <View style={{ flex: 1, backgroundColor: c.callScreen }} />;
  const { pop } = call;
  // The lead's name as the server has it, else the web's "Unknown caller"; the number masked as the campaign says
  const who = party(call, pop.contact?.name);
  const name = who.named ? who.name : 'Unknown caller';

  return (
    <View style={{ flex: 1, backgroundColor: c.callScreen, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }}>
      <View style={{ alignItems: 'center', gap: 8, paddingHorizontal: 24 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <InfoTip {...helpText.callMode}>
          <ModeBadge mode={call.mode} onDark />
        </InfoTip>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              height: 26,
              borderRadius: 13,
              backgroundColor: c.callControl,
            }}
          >
            <Icon name="support-agent" size={14} color={c.onCallScreen} />
            <T v="caption" color={c.onCallScreen} style={{ fontFamily: font.semibold }}>
              {pop.queue}
            </T>
          </View>
        </View>
        <T v="label" color={c.onCallScreen2} style={{ marginTop: 12 }}>
          Incoming call
        </T>
        <View style={{ alignItems: 'center', justifyContent: 'center', marginVertical: 12 }}>
          <Animated.View
            style={[{ position: 'absolute', width: 96, height: 96, borderRadius: 48, backgroundColor: c.callControl }, ring]}
          />
          <Avatar name={name} size={96} tone="invert" />
        </View>
        <T v="title" color={c.onCallScreen} style={{ fontSize: 28, lineHeight: 34, textAlign: 'center' }} accessibilityRole="header">
          {name}
        </T>
        <T v="body" color={c.onCallScreen2} nums>
          {pop.contact ? `${pop.contact.company} · ` : ''}
          {who.number}
        </T>
      </View>

      <ScrollView style={{ flex: 1, marginTop: 20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}>
        {call.mode === 'bridge' && (
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              backgroundColor: c.warningBg,
              borderColor: c.warningLine,
              borderWidth: 1,
              borderRadius: 14,
              padding: 14,
            }}
          >
            <Icon name="sim-card" color={c.warningFg} />
            <T v="body" color={c.warningFg} style={{ flex: 1 }}>
              {call.fallback
                ? 'The app could not ring, so your phone line is ringing. Answer it there; this screen is your control panel.'
                : 'Your phone line is ringing. Answer it there; this screen is your control panel.'}
            </T>
          </View>
        )}
        <CallMeta call={call} />
      </ScrollView>

      <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 32, paddingTop: 20 }}>
        <RoundAction icon="call-end" label="Decline" bg={c.danger} fg={c.onDanger} onPress={decline} disabled={!!call.accepting} />
        <RoundAction
          icon="call"
          label={call.mode === 'bridge' ? 'Answered' : 'Answer'}
          bg={c.call}
          fg={c.onCall}
          breathe
          haptic={false}
          disabled={!!call.accepting}
          busy={!!call.accepting}
          onPress={() => {
            if (useCall.getState().call?.state === 'ringing') feedback('call.answered');
            void answer();
          }}
        />
      </View>
    </View>
  );
}
