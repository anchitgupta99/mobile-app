import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS } from 'react-native-reanimated';
import { CallMeta } from '@/components/call/CallMeta';
import { ConferencePanel, ConsultView, TargetPicker } from '@/components/call/Transfer';
import { PressableScale } from '@/components/motion/PressableScale';
import { RollingDigits } from '@/components/motion/RollingDigits';
import { feedback } from '@/feedback';
import { duration } from '@/theme/motion';
import { useCallParty } from '@/components/PhoneText';
import { Sheet } from '@/components/Sheet';
import { Avatar, Icon, Segmented, StatusChip, T, tap, type IconName } from '@/components/ui';
import { formatDuration } from '@/domain/format';
import { useCampaignScript } from '@/hooks/useCampaignScript';
import { useNow } from '@/hooks/useNow';
import { useSession } from '@/store/session';
import type { AudioRoute } from '@/store/settings';
import { useCall } from '@/telephony/callStore';
import { font, useTheme } from '@/theme';

function Control({
  icon,
  label,
  active,
  onPress,
  disabled,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: 6, width: 80 }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: !!active, disabled: !!disabled }}
        disabled={disabled}
        scaleTo={0.92}
        onPress={() => {
          feedback('toggle');
          onPress();
        }}
        style={{
          width: 68,
          height: 68,
          borderRadius: 34,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? c.callControlActive : c.callControl,
          opacity: disabled ? 0.35 : 1,
        }}
        pressedStyle={{ opacity: 0.8 }}
      >
        {/* Keyed so a mic/mic-off or pause/play swap cross-fades */}
        <Animated.View key={icon} entering={FadeIn.duration(duration.fast)}>
          <Icon name={icon} size={28} color={active ? c.onCallControlActive : c.onCallScreen} />
        </Animated.View>
      </PressableScale>
      <T v="caption" color={c.onCallScreen} style={{ fontFamily: font.medium }}>
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
  const notes = useCall((s) => (s.call ? (s.notes[s.call.id] ?? '') : ''));
  const { toggleMute, toggleHold, setRoute, sendDigit, end, setNote } = useCall.getState();
  // The campaign's script, only when the admin turned it on, as the web's call page shows it
  const agentCampaignId = useSession((s) => s.agent?.campaignId);
  const script = useCampaignScript(call?.campaignId ?? agentCampaignId);
  const showScript = !!script?.enabled;
  const party = useCallParty();
  const now = useNow(500);
  const [panel, setPanel] = useState<'none' | 'keypad' | 'audio' | 'info'>('none');
  const [infoTab, setInfoTab] = useState<'contact' | 'notes' | 'script'>('notes');
  const [flow, setFlow] = useState<'transfer' | 'conference' | null>(null);
  const [minimisedAt, setMinimisedAt] = useState<number | null>(null);
  const consult = useCall((s) => s.consult);
  const conference = useCall((s) => s.conference);

  if (!call) return <View style={{ flex: 1, backgroundColor: c.callScreen }} />;
  // The Script tab can go away (the call's campaign changed to one without a script): back to Notes then
  const tab = infoTab === 'script' && !showScript ? 'notes' : infoTab;
  const who = party(call);
  const name = who.name;
  const live = call.state === 'connected' || call.state === 'held';
  const stateText =
    call.state === 'checking' || call.state === 'dialing'
      ? 'Calling…'
      : call.state === 'ringing'
        ? 'Ringing…'
        : call.state === 'held'
          ? 'On hold'
          : formatDuration((now - (call.connectedAt ?? now)) / 1000);
  const routeIcon: IconName = call.route === 'speaker' ? 'volume-up' : call.route === 'bluetooth' ? 'bluetooth-audio' : 'phone-in-talk';

  const openInfo = () => setPanel('info');
  const swipeUp = Gesture.Pan()
    .activeOffsetY(-12)
    .onEnd((e) => {
      if (e.translationY < -40) runOnJS(openInfo)();
    });

  return (
    <View style={{ flex: 1, backgroundColor: c.callScreen, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 20 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap', paddingHorizontal: 16 }}>
        {live && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              height: 26,
              borderRadius: 13,
              backgroundColor: c.callControl,
            }}
          >
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.signalDown }} />
            <T v="caption" color={c.onCallScreen} style={{ fontFamily: font.semibold }}>
              Recording
            </T>
          </View>
        )}
      </View>

      {consult && minimisedAt === consult.startedAt && (
        <Pressable
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
        </Pressable>
      )}

      {conference ? (
        <View style={{ marginTop: 20 }}>
          <ConferencePanel />
        </View>
      ) : (
        <View style={{ alignItems: 'center', gap: 6, marginTop: 28, paddingHorizontal: 24 }}>
          <Avatar name={who.named ? name : '#'} size={84} tone="invert" />
          <T
            v="title"
            color={c.onCallScreen}
            style={{ fontSize: 28, lineHeight: 34, marginTop: 10, textAlign: 'center' }}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {name}
          </T>
          {who.named && (
            <T v="body" color={c.onCallScreen2} nums selectable>
              {who.number}
            </T>
          )}
          {call.state === 'connected' ? (
            <View>
              <RollingDigits v="h3" color={c.onCallScreen2} text={stateText} />
            </View>
          ) : (
            <T v="h3" color={c.onCallScreen2} nums accessibilityLiveRegion="polite">
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
                }}
                pressedStyle={{ backgroundColor: c.callControlActive }}
              >
                {({ pressed }) => (
                  <T
                    style={{ fontSize: 26, lineHeight: 30, fontFamily: font.regular }}
                    color={pressed ? c.onCallControlActive : c.onCallScreen}
                  >
                    {d}
                  </T>
                )}
              </PressableScale>
            ))}
          </View>
        </View>
      ) : (
        <GestureDetector gesture={swipeUp}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showScript ? 'Open contact, notes and script' : 'Open contact and notes'}
            onPress={() => setPanel('info')}
            style={{ marginHorizontal: 20, marginBottom: 20, borderRadius: 16, backgroundColor: c.callControl, padding: 14, gap: 4 }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: c.onCallScreen2,
                opacity: 0.6,
                marginBottom: 6,
              }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="notes" size={18} color={c.onCallScreen} />
              <T v="bodyStrong" color={c.onCallScreen} style={{ flex: 1 }} numberOfLines={1}>
                {notes ? notes : showScript ? 'Contact · Notes · Script' : 'Contact · Notes'}
              </T>
              <Icon name="expand-less" color={c.onCallScreen} />
            </View>
          </Pressable>
        </GestureDetector>
      )}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-evenly',
          rowGap: 12,
          width: '100%',
          maxWidth: 300,
          alignSelf: 'center',
          marginBottom: 14,
        }}
      >
        <Control
          icon={call.muted ? 'mic-off' : 'mic'}
          label={call.muted ? 'Unmute' : 'Mute'}
          active={call.muted}
          onPress={toggleMute}
          disabled={!live}
        />
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
          active={call.state === 'held'}
          onPress={toggleHold}
          disabled={!live || !!consult || !!call.holdPending}
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

      <View style={{ alignItems: 'center' }}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="End call"
          accessibilityState={{ disabled: !!call.dialPending, busy: !!call.dialPending }}
          scaleTo={0.96}
          // The server is still placing the call: End waits for its answer, as the web's dial button stays busy
          disabled={!!call.dialPending}
          onPress={() => {
            if (!call.connectedAt) feedback('press');
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
        >
          {call.dialPending ? (
            <ActivityIndicator color={c.onDanger} />
          ) : (
            <Icon name="call-end" size={30} color={c.onDanger} />
          )}
          <T v="h3" color={c.onDanger}>
            End
          </T>
        </PressableScale>
      </View>

      {((consult && minimisedAt !== consult.startedAt) || (!consult && flow)) && (
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
        ).map(([r, label, icon]) => (
          <Pressable
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
              borderColor: call.route === r ? c.purple : c.line,
              backgroundColor: call.route === r ? c.selected : c.surface,
            }}
          >
            <Icon name={icon} color={c.ink2} />
            <T v="bodyStrong" style={{ flex: 1 }}>
              {label}
            </T>
            {call.route === r && <Icon name="check" color={c.purple} />}
          </Pressable>
        ))}
      </Sheet>

      <Sheet open={panel === 'info'} onClose={() => setPanel('none')} title={name} scroll={false}>
        <Segmented
          value={tab}
          onChange={setInfoTab}
          options={[
            { value: 'contact', label: 'Contact' },
            { value: 'notes', label: 'Notes' },
            // Only for a campaign with its script turned on, as the web
            ...(showScript ? [{ value: 'script' as const, label: 'Script' }] : []),
          ]}
        />
        {tab === 'notes' && (
          <TextInput
            multiline
            autoFocus
            value={notes}
            onChangeText={(t) => setNote(call.id, t)}
            placeholder="Type notes. They carry into wrap-up."
            placeholderTextColor={c.inkPlaceholder}
            accessibilityLabel="Call notes"
            style={{
              minHeight: 160,
              borderWidth: 1,
              borderColor: c.line,
              borderRadius: 10,
              padding: 14,
              fontFamily: font.regular,
              fontSize: 16,
              color: c.ink,
              textAlignVertical: 'top',
            }}
          />
        )}
        {/* The web's Script tab: its heading and line, then the campaign's text as written */}
        {tab === 'script' && script && (
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 12 }}>
            <View style={{ gap: 2 }}>
              <T v="bodyStrong">Campaign Script</T>
              <T v="caption">Read-only script for this campaign</T>
            </View>
            {script.text ? (
              <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 10, padding: 14, backgroundColor: c.subtle }}>
                <T v="body" selectable>
                  {script.text}
                </T>
              </View>
            ) : (
              <T v="body" color={c.ink2} style={{ textAlign: 'center', paddingVertical: 16 }}>
                No script text provided for this campaign.
              </T>
            )}
          </ScrollView>
        )}
        {tab === 'contact' && (
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12, minHeight: 160 }} keyboardShouldPersistTaps="handled">
            {/* The customer as the server has them (call context), with the web's Lead Details labels */}
            <InfoLine label="Customer Name" value={call.customerName || '—'} />
            <InfoLine label="Mobile Number" value={who.number || '—'} />
          </ScrollView>
        )}
      </Sheet>
    </View>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <T v="caption">{label}</T>
      <T v="bodyStrong">{value}</T>
    </View>
  );
}
