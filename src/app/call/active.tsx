import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { CallMeta } from '@/components/call/CallMeta';
import { DETAILS_BAR_H, DetailsPanel } from '@/components/call/DetailsPanel';
import { useDetails } from '@/store/details';
import { ConferencePanel, ConsultView, TargetPicker } from '@/components/call/Transfer';
import { PressableScale } from '@/components/motion/PressableScale';
import { RollingDigits } from '@/components/motion/RollingDigits';
import { feedback } from '@/feedback';
import { duration } from '@/theme/motion';
import { useCallParty } from '@/components/PhoneText';
import { Sheet } from '@/components/Sheet';
import { Avatar, Icon, StatusChip, T, tap, type IconName } from '@/components/ui';
import { formatDuration } from '@/domain/format';
import { useNow } from '@/hooks/useNow';
import type { AudioRoute } from '@/store/settings';
import { useCall } from '@/telephony/callStore';
import { font, useTheme } from '@/theme';
import { Tappable } from '@/components/motion/Tappable';

function Control({
  icon,
  label,
  active,
  onPress,
  disabled,
  size = 68,
  a11yLabel,
}: {
  icon: IconName;
  label: string;
  /** What a screen reader says, when the short caption isn't enough on its own */
  a11yLabel?: string;
  active?: boolean;
  onPress: () => void;
  disabled?: boolean;
  /** Circle diameter: Mute and Hold, nearest the thumb, are larger */
  size?: number;
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 6, width: size + 8 }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={a11yLabel ?? label}
        accessibilityState={{ selected: !!active, disabled: !!disabled }}
        disabled={disabled}
        scaleTo={0.92}
        onPress={() => {
          feedback('toggle');
          onPress();
        }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? c.callControlActive : c.callControl,
          // A visible edge so the circle reads against the call screen, not by fill alone
          borderWidth: 1.5,
          borderColor: active ? c.callControlActive : c.callControlBorder,
          opacity: disabled ? 0.4 : 1,
        }}
        // A fill change, not a fade: fading reads as disabled
        pressedStyle={{ backgroundColor: active ? c.callControlActive : c.callControlPressed }}
      >
        {/* Keyed so a mic/mic-off or pause/play swap cross-fades */}
        <Animated.View key={icon} entering={FadeIn.duration(duration.fast)}>
          <Icon name={icon} size={28} color={active ? c.onCallControlActive : c.onCallScreen} />
        </Animated.View>
      </PressableScale>
      <T v="caption" color={c.onCallScreen} style={{ fontFamily: font.medium }} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

const pad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

export default function ActiveCall() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const call = useCall((s) => s.call);
  const { toggleMute, toggleHold, setRoute, sendDigit, end } = useCall.getState();
  const party = useCallParty();
  const now = useNow(500);
  const [panel, setPanel] = useState<'none' | 'keypad' | 'audio'>('none');
  const [flow, setFlow] = useState<'transfer' | 'conference' | null>(null);
  const [minimisedAt, setMinimisedAt] = useState<number | null>(null);
  const [topH, setTopH] = useState(0);
  const hasDetails = useDetails((s) => !!(call && s.byCall[call.id]?.fields.length));
  const consult = useCall((s) => s.consult);
  const conference = useCall((s) => s.conference);
  const overlayOpen = consult ? minimisedAt !== consult.startedAt : !!flow;
  // The agent pressed End: that press gives its own cue
  const endPressed = useRef(false);

  // A call the other side ended before it connected (no answer, busy) gets the end cue too, as it goes to wrap-up;
  // a connected call's end cue comes from useCallFeedback
  useEffect(
    () =>
      useCall.subscribe((s, prev) => {
        if (prev.call && !s.call && !prev.call.connectedAt && !endPressed.current && s.wrapUpCallId === prev.call.id) {
          feedback('call.ended');
        }
      }),
    [],
  );

  // Android Back closes what's open over the call (transfer / conference, the keypad); otherwise it does nothing:
  // popping this screen would only have the call routing push it straight back, losing its state
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (consult && overlayOpen) setMinimisedAt(consult.startedAt);
      else if (flow) setFlow(null);
      else if (panel !== 'none') setPanel('none');
      return true;
    });
    return () => sub.remove();
  }, [consult, overlayOpen, flow, panel]);

  if (!call) return <View style={{ flex: 1, backgroundColor: c.callScreen }} />;
  const who = party(call);
  const name = who.name;
  const live = call.state === 'connected' || call.state === 'held';
  // Required details: once the call connects (not while it rings), for campaigns that ask for any
  const showDetails = live && hasDetails && !conference;
  const stateText =
    call.state === 'checking' || call.state === 'dialing'
      ? 'Calling…'
      : call.state === 'ringing'
        ? 'Ringing…'
        : call.state === 'held'
          ? 'On hold'
          : formatDuration((now - (call.connectedAt ?? now)) / 1000);
  const routeIcon: IconName = call.route === 'speaker' ? 'volume-up' : call.route === 'bluetooth' ? 'bluetooth-audio' : 'phone-in-talk';

  return (
    <View style={{ flex: 1, backgroundColor: c.callScreen, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}>
      {/* Everything above the call controls. The details panel opens over this area only, never the controls. */}
      <View style={{ flex: 1 }} onLayout={(e) => setTopH(e.nativeEvent.layout.height)}>
        {showDetails && <View style={{ height: DETAILS_BAR_H + 12 }} />}

        {consult && minimisedAt === consult.startedAt && (
          <Tappable
            accessibilityRole="button"
            accessibilityLabel={`Return to ${consult.target.name}`}
            onPress={() => setMinimisedAt(null)}
            style={{
              marginTop: 12,
              marginHorizontal: 20,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 14,
              backgroundColor: c.callControlActive,
            }}
          >
            <Icon name={consult.kind === 'transfer' ? 'phone-forwarded' : 'call-merge'} size={18} color={c.onCallControlActive} />
            <T v="label" color={c.onCallControlActive} style={{ flex: 1 }} numberOfLines={1}>
              {consult.kind === 'transfer' ? 'Consulting' : 'Adding'} {consult.target.name}
            </T>
            <T v="label" color={c.onCallControlActive}>
              Return
            </T>
          </Tappable>
        )}

        {conference ? (
          <View style={{ marginTop: 20 }}>
            <ConferencePanel />
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: 6, marginTop: 28, paddingHorizontal: 24 }}>
            {/* Room for the keypad on short screens: the name and timer stay, the avatar goes */}
            {panel !== 'keypad' && <Avatar name={who.named ? name : '#'} size={64} tone="invert" />}
            <T
              v="display"
              color={c.onCallScreen}
              style={{ marginTop: 10, textAlign: 'center' }}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {name}
            </T>
            {who.named && (
              <T v="title" color={c.onCallScreen} nums selectable style={{ fontFamily: font.regular }}>
                {who.number}
              </T>
            )}
            {call.state === 'connected' ? (
              <View>
                <RollingDigits v="title" color={c.onCallScreen} nums text={stateText} />
              </View>
            ) : (
              <T v="title" color={c.onCallScreen} nums accessibilityLiveRegion="polite">
                {stateText}
              </T>
            )}
            {!!call.error && <StatusChip tone="error" label={call.error} />}
          </View>
        )}

        {!conference && panel === 'none' && (
          <View style={{ marginTop: 20, paddingHorizontal: 20 }}>
            <CallMeta call={call} />
          </View>
        )}

        <View style={{ flex: 1 }} />
        {showDetails && (
          <DetailsPanel
            callId={call.id}
            maxHeight={Math.max(DETAILS_BAR_H, topH - 12)}
            style={{ position: 'absolute', top: 12, left: 12, right: 12 }}
          />
        )}
      </View>

      {panel === 'keypad' ? (
        <View style={{ alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <T v="h2" color={c.onCallScreen} nums style={{ minHeight: 26, letterSpacing: 2 }}>
            {call.dtmf}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: 3 * 64 + 2 * 24, gap: 10, columnGap: 24 }}>
            {pad.map((d) => (
              <PressableScale
                key={d}
                accessibilityRole="button"
                accessibilityLabel={d}
                scaleTo={0.92}
                onPress={() => {
                  feedback('dial.key', { digit: d });
                  sendDigit(d);
                }}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: c.callControl,
                  borderWidth: 1.5,
                  borderColor: c.callControlBorder,
                }}
                pressedStyle={{ backgroundColor: c.callControlActive, borderColor: c.callControlActive }}
              >
                {({ pressed }) => (
                  <T v="display" style={{ fontFamily: font.regular }} color={pressed ? c.onCallControlActive : c.onCallScreen}>
                    {d}
                  </T>
                )}
              </PressableScale>
            ))}
          </View>
        </View>
      ) : null}

      {/* Less frequent controls on top; Mute and Hold sit in the row nearest End, within thumb reach */}
      <View style={{ gap: 14, marginBottom: 18, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', width: '100%', maxWidth: 360, alignSelf: 'center' }}>
          <Control
            icon="dialpad"
            label="Keypad"
            active={panel === 'keypad'}
            onPress={() => setPanel(panel === 'keypad' ? 'none' : 'keypad')}
            disabled={!live}
          />
          <Control
            icon={routeIcon}
            label={call.route === 'speaker' ? 'Speaker' : call.route === 'bluetooth' ? 'Bluetooth' : 'Audio'}
            active={call.route !== 'earpiece'}
            onPress={() => setPanel('audio')}
          />
          <Control
            icon="phone-forwarded"
            label="Transfer"
            active={consult?.kind === 'transfer'}
            onPress={() => (consult ? setMinimisedAt(null) : setFlow('transfer'))}
            disabled={!live || (!!consult && consult.kind !== 'transfer')}
          />
          <Control
            icon="call-merge"
            label="Conf"
            active={!!conference || consult?.kind === 'conference'}
            onPress={() => (consult ? setMinimisedAt(null) : setFlow('conference'))}
            disabled={!live || (!!consult && consult.kind !== 'conference')}
          />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 48 }}>
          <Control
            size={76}
            icon={call.muted ? 'mic-off' : 'mic'}
            label={call.muted ? 'Unmute' : 'Mute'}
            active={call.muted}
            onPress={toggleMute}
            disabled={!live}
          />
          <Control
            size={76}
            icon={call.state === 'held' ? 'play-arrow' : 'pause'}
            label={
              call.holdPending
                ? call.state === 'held'
                  ? 'Resuming…'
                  : 'Holding…'
                : call.holdFailed
                  ? 'Failed'
                  : call.state === 'held'
                    ? 'Resume'
                    : 'Hold'
            }
            a11yLabel={
              call.holdFailed && !call.holdPending ? `${call.state === 'held' ? 'Resume' : 'Hold'} failed, tap to retry` : undefined
            }
            active={call.state === 'held'}
            onPress={toggleHold}
            disabled={!live || !!consult || !!call.holdPending}
          />
        </View>
      </View>

      <View style={{ alignItems: 'center' }}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="End call"
          accessibilityState={{ disabled: !!call.dialPending, busy: !!call.dialPending }}
          scaleTo={0.96}
          // The server is still placing the call: End waits for its answer, as the web's dial button stays busy
          disabled={!!call.dialPending}
          onPress={() => {
            // A connected call's end is signalled by useCallFeedback when the call clears; one that never connected, here
            endPressed.current = true;
            if (!call.connectedAt) feedback('call.ended');
            end();
          }}
          style={{
            width: 200,
            height: 64,
            borderRadius: 32,
            backgroundColor: c.danger,
            opacity: call.dialPending ? 0.6 : 1,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 10,
          }}
          pressedStyle={{ backgroundColor: c.dangerPressed }}
        >
          {call.dialPending ? <ActivityIndicator color={c.onDanger} /> : <Icon name="call-end" size={30} color={c.onDanger} />}
          <T v="h3" color={c.onDanger}>
            End
          </T>
        </PressableScale>
      </View>

      {overlayOpen && (
        <Animated.View
          entering={FadeIn.duration(duration.base)}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            backgroundColor: c.callScreen,
            paddingTop: insets.top + 12,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 16,
          }}
        >
          {consult ? (
            <ConsultView onMinimise={() => setMinimisedAt(consult.startedAt)} />
          ) : (
            flow && <TargetPicker kind={flow} onBack={() => setFlow(null)} onMinimise={() => setFlow(null)} />
          )}
        </Animated.View>
      )}

      <Sheet open={panel === 'audio'} onClose={() => setPanel('none')} title="Audio output" scroll={false}>
        {(
          [
            ['earpiece', 'Phone', 'phone-in-talk'],
            ['speaker', 'Speaker', 'volume-up'],
            ['bluetooth', 'Bluetooth headset', 'bluetooth-audio'],
          ] as [AudioRoute, string, IconName][]
        )
          // Only the routes there is a device for, where the system lists them (no headset, no Bluetooth row)
          .filter(([r]) => !call.routes || call.routes.includes(r) || call.route === r)
          .map(([r, label, icon]) => (
            <Tappable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ checked: call.route === r }}
              onPress={() => {
                tap();
                setRoute(r);
                setPanel('none');
              }}
              style={{
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 14,
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: call.route === r ? c.purple : c.controlBorder,
                backgroundColor: call.route === r ? c.selected : c.surface,
              }}
            >
              <Icon name={icon} color={c.ink2} />
              <T v="bodyStrong" style={{ flex: 1 }}>
                {label}
              </T>
              {call.route === r && <Icon name="check" color={c.purple} />}
            </Tappable>
          ))}
      </Sheet>
    </View>
  );
}
