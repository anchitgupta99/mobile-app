import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS } from 'react-native-reanimated';
import { CallMeta } from '@/components/call/CallMeta';
import { ConferencePanel, ConsultView, TargetPicker } from '@/components/call/Transfer';
import { InfoTip } from '@/components/InfoTip';
import { ModeBadge } from '@/components/ModeBadge';
import { helpText } from '@/domain/helpText';
import { PressableScale } from '@/components/motion/PressableScale';
import { RollingDigits } from '@/components/motion/RollingDigits';
import { feedback } from '@/feedback';
import { duration } from '@/theme/motion';
import { usePhoneDisplay } from '@/components/PhoneText';
import { Sheet } from '@/components/Sheet';
import { notify } from '@/components/feedback';
import { Avatar, Button, Field, Icon, Segmented, StatusChip, T, tap, type IconName } from '@/components/ui';
import type { Contact } from '@/domain/types';
import { formatDuration, formatRelative } from '@/domain/format';
import { useNow } from '@/hooks/useNow';
import { useData } from '@/store/data';
import type { AudioRoute } from '@/store/settings';
import { useCall } from '@/telephony/callStore';
import { qualityLevel } from '@/telephony/networkCheck';
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

function QualityBars({ level }: { level: 0 | 1 | 2 | 3 }) {
  const { c } = useTheme();
  const color = level >= 3 ? c.signalOk : level === 2 ? c.signalWarn : c.signalDown;
  const label = level >= 3 ? 'Good' : level === 2 ? 'Fair' : 'Poor';
  return (
    <View
      accessibilityLabel={`Network quality ${label}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        height: 26,
        borderRadius: 13,
        backgroundColor: c.callControl,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 }}>
        {[1, 2, 3].map((b) => (
          <View
            key={b}
            style={{
              width: 3,
              height: 4 * b,
              borderRadius: 1,
              backgroundColor: b <= level ? color : c.onCallScreen2,
              opacity: b <= level ? 1 : 0.35,
            }}
          />
        ))}
      </View>
      <T v="caption" color={c.onCallScreen} style={{ fontFamily: font.semibold }}>
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
  const script = useData((s) => s.dispositions.script);
  const phone = usePhoneDisplay();
  const now = useNow(500);
  const [panel, setPanel] = useState<'none' | 'keypad' | 'audio' | 'info'>('none');
  const [infoTab, setInfoTab] = useState<'contact' | 'notes' | 'script'>('notes');
  const [flow, setFlow] = useState<'transfer' | 'conference' | null>(null);
  const [minimisedAt, setMinimisedAt] = useState<number | null>(null);
  const consult = useCall((s) => s.consult);
  const conference = useCall((s) => s.conference);

  if (!call) return <View style={{ flex: 1, backgroundColor: c.callScreen }} />;
  const name = call.pop.contact?.name ?? phone(call.number);
  const live = call.state === 'connected' || call.state === 'held';
  const stateText =
    call.state === 'checking'
      ? 'Checking network…'
      : call.state === 'dialing'
        ? call.mode === 'bridge'
          ? call.direction === 'inbound'
            ? 'Connecting…'
            : 'Calling your phone line…'
          : 'Calling…'
        : call.state === 'ringing'
          ? call.mode === 'bridge'
            ? 'Answer your phone to connect'
            : 'Ringing…'
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
        <InfoTip {...helpText.callMode}>
          <ModeBadge mode={call.mode} onDark />
        </InfoTip>
        {call.mode === 'voip' && live && call.quality && (
          <Animated.View key={qualityLevel(call.quality)} entering={FadeIn.duration(duration.base)}>
            <QualityBars level={qualityLevel(call.quality)} />
          </Animated.View>
        )}
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
          <Avatar name={call.pop.contact?.name ?? '#'} size={84} tone="invert" />
          <T
            v="title"
            color={c.onCallScreen}
            style={{ fontSize: 28, lineHeight: 34, marginTop: 10, textAlign: 'center' }}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {name}
          </T>
          {!!call.pop.contact && (
            <T v="body" color={c.onCallScreen2} nums selectable>
              {phone(call.number)}
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
          {call.verdict && call.state !== 'connected' && !call.modeOverridden && (
            <T v="caption" color={c.onCallScreen2} style={{ textAlign: 'center' }}>
              {call.verdict.mode === 'bridge' ? `Using phone line: ${call.verdict.reason.toLowerCase()}` : call.verdict.reason}
            </T>
          )}
          {call.mode === 'bridge' && live && (
            <T v="caption" color={c.onCallScreen2} style={{ textAlign: 'center', maxWidth: 300 }}>
              Audio is on your phone line. These controls act on the call.
            </T>
          )}
          {call.mode === 'voip' && live && call.quality && qualityLevel(call.quality) <= 1 && (
            <View style={{ marginTop: 6 }}>
              <StatusChip tone="warning" icon="signal-cellular-alt-1-bar" label="Weak network. Audio may break up." />
            </View>
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
            accessibilityLabel="Open contact, notes and script"
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
                {notes ? notes : 'Contact · Notes · Script'}
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
          disabled={call.mode === 'bridge'}
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
          value={infoTab}
          onChange={setInfoTab}
          options={[
            { value: 'contact', label: 'Contact' },
            { value: 'notes', label: 'Notes' },
            { value: 'script', label: 'Script' },
          ]}
        />
        {infoTab === 'notes' && (
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
        {infoTab === 'script' && (
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 10 }}>
            {script.map((line, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    backgroundColor: c.lavenderSoft,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <T v="label" color={c.navy}>
                    {i + 1}
                  </T>
                </View>
                <T v="body" style={{ flex: 1 }}>
                  {line}
                </T>
              </View>
            ))}
          </ScrollView>
        )}
        {infoTab === 'contact' && (
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12, minHeight: 160 }} keyboardShouldPersistTaps="handled">
            {call.pop.contact ? (
              <>
                <CrmEditor contactId={call.pop.contact.id} live={live} />
                <InfoLine label="Last disposition" value={call.pop.lastDisposition ?? 'First contact'} />
                <InfoLine
                  label="Open callbacks"
                  value={call.pop.openTasks.map((t) => `${t.title} · ${formatRelative(t.dueAt)}`).join('\n') || 'None'}
                />
              </>
            ) : (
              <T v="body" color={c.ink2}>
                Unknown number. There is no lead record to edit for this call.
              </T>
            )}
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

type CrmDraft = Pick<Contact, 'name' | 'company' | 'email' | 'city'>;

/** CRM fields are editable only while the call is live; they lock the moment it ends. */
function CrmEditor({ contactId, live }: { contactId: string; live: boolean }) {
  const { c } = useTheme();
  const contact = useData((s) => s.contacts.find((x) => x.id === contactId));
  const updateContact = useData((s) => s.updateContact);
  const [draft, setDraft] = useState<CrmDraft | null>(null);
  if (!contact) return null;
  const v: CrmDraft = draft ?? { name: contact.name, company: contact.company, email: contact.email, city: contact.city };
  const changed = (Object.keys(v) as (keyof CrmDraft)[]).filter((k) => v[k].trim() !== contact[k]);
  const field = (k: keyof CrmDraft, label: string, extra?: object) => (
    <Field
      label={label}
      value={v[k]}
      editable={live}
      onChangeText={(t) => setDraft({ ...v, [k]: t })}
      autoCapitalize={k === 'email' ? 'none' : 'words'}
      {...extra}
    />
  );
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={live ? 'edit' : 'lock-outline'} size={16} color={c.ink3} />
        <T v="caption" color={c.ink3} style={{ flex: 1 }}>
          {live ? 'Editable while the call is live. Locks when the call ends.' : 'Locked until the call connects.'}
        </T>
      </View>
      {field('name', 'Name')}
      {field('company', 'Company')}
      {field('email', 'Email', { keyboardType: 'email-address' })}
      {field('city', 'City')}
      {live && changed.length > 0 && (
        <Button
          label="Save to CRM"
          icon="check"
          full
          onPress={() => {
            updateContact(contact.id, Object.fromEntries(changed.map((k) => [k, v[k].trim()])));
            setDraft(null);
            notify('Lead updated', 'success');
          }}
        />
      )}
    </View>
  );
}
