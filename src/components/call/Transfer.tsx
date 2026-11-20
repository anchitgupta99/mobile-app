import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api, type BackendAgent } from '@/api/client';
import { feedback } from '@/feedback';
import { formatDuration } from '@/domain/format';
import { useNow } from '@/hooks/useNow';
import { useCall, type Consult, type Leg } from '@/telephony/callStore';
import { font, useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { PressableScale } from '../motion/PressableScale';
import { useCallParty } from '../PhoneText';
import { Avatar, Icon, T, tap, type IconName } from '../ui';
import { Tappable } from '@/components/motion/Tappable';

const pad: [string, string][] = [
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

/** A colleague to transfer to or add: one of the server's signed-in agents */
type Colleague = { id: string; name: string; team: string; ext: string; presence: 'available' | 'away' | 'busy' };

function RoundButton({
  icon,
  label,
  onPress,
  bg,
  fg,
  size = 40,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  bg: string;
  fg: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={Math.max(0, (48 - size) / 2)}
      scaleTo={0.9}
      onPress={() => {
        tap();
        onPress();
      }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={fg} />
    </PressableScale>
  );
}

/** Compact live-call header used while transferring or conferencing. */
export function CallStrip({ onMinimise, title }: { onMinimise: () => void; title?: ReactNode }) {
  const { c } = useTheme();
  const call = useCall((s) => s.call);
  const party = useCallParty();
  const now = useNow(500);
  if (!call) return null;
  const name = party(call).name;
  const t = call.connectedAt ? formatDuration((now - call.connectedAt) / 1000) : '0:00';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: c.callControl,
        borderRadius: 16,
        paddingVertical: 8,
        paddingLeft: 12,
        paddingRight: 8,
      }}
    >
      <Icon name={call.direction === 'inbound' ? 'call-received' : 'call-made'} size={18} color={c.onCallScreen} />
      <View style={{ flex: 1 }}>
        {title ?? (
          <T v="bodyStrong" color={c.onCallScreen} numberOfLines={1}>
            {name}
          </T>
        )}
        <T v="caption" color={c.onCallScreen2} nums>
          {t}
        </T>
      </View>
      <RoundButton
        icon={call.muted ? 'mic-off' : 'mic'}
        label={call.muted ? 'Unmute' : 'Mute'}
        bg={call.muted ? c.callControlActive : 'transparent'}
        fg={call.muted ? c.onCallControlActive : c.onCallScreen}
        onPress={() => useCall.getState().toggleMute()}
      />
      <RoundButton icon="close-fullscreen" label="Minimise" bg="transparent" fg={c.onCallScreen} onPress={onMinimise} />
      <RoundButton icon="call-end" label="End call" bg={c.danger} fg={c.onDanger} onPress={() => useCall.getState().end()} />
    </View>
  );
}

function PresenceAvatar({ name, presence }: { name: string; presence?: Colleague['presence'] }) {
  const { c } = useTheme();
  const dot = presence === 'available' ? c.signalOk : presence === 'busy' ? c.signalDown : c.signalWarn;
  return (
    <View>
      <Avatar name={name} size={44} tone="invert" />
      {presence && (
        <View
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: dot,
            borderWidth: 2,
            borderColor: c.callScreen,
          }}
        />
      )}
    </View>
  );
}

function toColleague(a: BackendAgent): Colleague {
  return {
    id: a.id,
    name: a.name,
    team: a.campaigns[0]?.name ?? '',
    ext: a.extension ?? '',
    presence: a.status === 'READY' ? 'available' : a.status === 'PAUSED' || a.status === 'BREAK' ? 'away' : 'busy',
  };
}

/** Colleagues to pick: the server's signed-in agents, searched as you type */
function useColleagues(q: string) {
  const [remote, setRemote] = useState<Colleague[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    const t = setTimeout(() => {
      api.liveCalls
        .searchAgents(q.trim())
        .then((agents) => {
          if (gone) return;
          setError(null);
          setRemote(agents.map(toColleague));
        })
        .catch((e) => !gone && setError(e instanceof Error ? e.message : 'Could not load your colleagues'));
    }, 300);
    return () => {
      gone = true;
      clearTimeout(t);
    };
  }, [q]);
  return { list: remote ?? [], loading: remote === null && !error, error };
}

function InternalList({ kind, onPick }: { kind: Consult['kind']; onPick: (c: Colleague) => void }) {
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const { list, loading, error } = useColleagues(q);
  return (
    <View style={{ flex: 1, gap: 12 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          backgroundColor: c.callControl,
          borderRadius: 12,
          paddingHorizontal: 12,
          minHeight: 48,
        }}
      >
        <Icon name="search" size={20} color={c.onCallScreen2} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search name or extension"
          placeholderTextColor={c.onCallScreen2}
          accessibilityLabel="Search name or extension"
          autoCorrect={false}
          style={{ flex: 1, color: c.onCallScreen, fontFamily: font.regular, fontSize: 15, paddingVertical: 12 }}
        />
      </View>
      <ScrollView contentContainerStyle={{ gap: 4, paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        {list.map((a) => {
          // On the server only a READY agent can take the call, as on the web
          const blocked = a.presence !== 'available';
          return (
            <Animated.View key={a.id} entering={FadeIn.duration(duration.base)} layout={LinearTransition.duration(duration.base)}>
              <Tappable scaleTo={1}
                accessibilityRole="button"
                accessibilityLabel={`${kind === 'transfer' ? 'Transfer to' : 'Add'} ${a.name}, ${a.team}, extension ${a.ext}, ${a.presence}`}
                accessibilityState={{ disabled: blocked }}
                disabled={blocked}
                onPress={() => onPick(a)}
                style={({ pressed }) => ({
                  opacity: blocked ? 0.45 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 10,
                  paddingHorizontal: 8,
                  borderRadius: 12,
                  backgroundColor: pressed ? c.callControlPressed : 'transparent',
                })}
              >
                <PresenceAvatar name={a.name} presence={a.presence} />
                <View style={{ flex: 1 }}>
                  <T v="bodyStrong" color={c.onCallScreen}>
                    {a.name}
                  </T>
                  <T v="caption" color={c.onCallScreen2}>
                    {a.team} · {a.ext}
                    {a.presence !== 'available' ? ` · ${a.presence === 'away' ? 'Away' : 'Busy'}` : ''}
                  </T>
                </View>
                {/* The whole row is the button; this is its visual affordance */}
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: c.callControlActive,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name={kind === 'transfer' ? 'phone-forwarded' : 'person-add'} size={20} color={c.onCallControlActive} />
                </View>
              </Tappable>
            </Animated.View>
          );
        })}
        {loading && <ActivityIndicator color={c.onCallScreen} style={{ paddingVertical: 24 }} />}
        {!!error && (
          <T v="body" color={c.onCallScreen2} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {error}
          </T>
        )}
        {!loading && !error && list.length === 0 && (
          <T v="body" color={c.onCallScreen2} style={{ textAlign: 'center', paddingVertical: 24 }}>
            {q.trim() ? `No one matches “${q}”` : 'No other agents are signed in'}
          </T>
        )}
      </ScrollView>
    </View>
  );
}

function ExternalPad({ onCall }: { onCall: (num: string) => void }) {
  const { c } = useTheme();
  const [num, setNum] = useState('');
  const ok = num.replace(/\D/g, '').length >= 6;
  return (
    <View style={{ flex: 1, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            flex: 1,
            height: 52,
            borderRadius: 12,
            backgroundColor: c.callControl,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 14,
          }}
        >
          <T
            v="title"
            nums
            numberOfLines={1}
            adjustsFontSizeToFit
            color={num ? c.onCallScreen : c.onCallScreen2}
            style={{ flex: 1, fontFamily: font.regular }}
            accessibilityLiveRegion="polite"
          >
            {num || 'Number'}
          </T>
          {!!num && (
            <RoundButton
              icon="backspace"
              label="Delete digit"
              bg="transparent"
              fg={c.onCallScreen2}
              onPress={() => setNum((n) => n.slice(0, -1))}
            />
          )}
        </View>
        <RoundButton
          icon="call"
          label={ok ? `Call ${num}` : 'Call. Enter a number first'}
          size={52}
          bg={c.purple}
          fg={c.onPurple}
          disabled={!ok}
          onPress={() => onCall(num)}
        />
      </View>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          rowGap: 10,
          columnGap: 22,
          alignSelf: 'center',
          width: 3 * 68 + 2 * 22,
        }}
      >
        {pad.map(([d, sub]) => (
          <PressableScale
            key={d}
            accessibilityRole="button"
            accessibilityLabel={d}
            scaleTo={0.92}
            onPress={() => {
              feedback('dial.key', { digit: d });
              setNum((n) => (n + d).slice(0, 15));
            }}
            onLongPress={d === '0' ? () => setNum((n) => (n + '+').slice(0, 15)) : undefined}
            style={{
              width: 68,
              height: 68,
              borderRadius: 34,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.callControl,
            }}
            pressedStyle={{ backgroundColor: c.callControlActive }}
          >
            <T v="display" style={{ fontFamily: font.regular }} color={c.onCallScreen}>
              {d}
            </T>
            <T v="overline" color={c.onCallScreen2}>
              {d === '0' ? '+' : sub}
            </T>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

/** Internal / External target picker for a transfer or a new conference participant. */
export function TargetPicker({ kind, onBack, onMinimise }: { kind: Consult['kind']; onBack: () => void; onMinimise: () => void }) {
  const { c } = useTheme();
  const [tab, setTab] = useState<'internal' | 'external'>('internal');
  const start = useCall((s) => s.startConsult);

  return (
    <View style={{ flex: 1, gap: 14 }}>
      <CallStrip onMinimise={onMinimise} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <RoundButton icon="arrow-back" label="Back to call" bg="transparent" fg={c.onCallScreen} onPress={onBack} size={44} />
        <View
          style={{ flex: 1, flexDirection: 'row', backgroundColor: c.callControl, borderRadius: 12, padding: 3 }}
          accessibilityRole="radiogroup"
        >
          {(['internal', 'external'] as const).map((t) => {
            const on = tab === t;
            return (
              <Tappable
                key={t}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => {
                  tap();
                  setTab(t);
                }}
                style={{
                  flex: 1,
                  minHeight: 40,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: on ? c.callControlActive : 'transparent',
                }}
              >
                <T v="label" color={on ? c.onCallControlActive : c.onCallScreen}>
                  {t === 'internal' ? 'Internal' : 'External'}
                </T>
              </Tappable>
            );
          })}
        </View>
      </View>
      <T v="overline" color={c.onCallScreen2} style={{ paddingHorizontal: 4 }}>
        {kind === 'transfer' ? 'Transfer to' : 'Add to conference'}
      </T>
      <Animated.View key={tab} entering={FadeIn.duration(duration.base)} style={{ flex: 1 }}>
        {tab === 'internal' ? (
          <InternalList
            kind={kind}
            onPick={(a) => {
              start(kind, { id: a.id, name: a.name, role: a.team, kind: 'agent', dial: a.ext }, a.presence);
              onBack();
            }}
          />
        ) : (
          <ExternalPad
            onCall={(n) => {
              // The server dials through the campaign's gateway and prefix, so it takes the number as typed, digits
              // only (no country code picker: the campaign's prefix decides the country)
              const dial = n.replace(/\D/g, '');
              start(kind, { id: `ext_${n}`, name: n, role: 'External', kind: 'external', dial });
              onBack();
            }}
          />
        )}
      </Animated.View>
    </View>
  );
}

function PartyCard({ name, role, right, sub }: { name: string; role: string; right: ReactNode; sub?: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.callControl, borderRadius: 16, padding: 14 }}>
      <Avatar name={name} size={48} tone="invert" />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyStrong" color={c.onCallScreen} numberOfLines={1}>
          {name}
        </T>
        <T v="caption" color={c.onCallScreen2}>
          {role}
        </T>
        {sub}
      </View>
      {right}
    </View>
  );
}

/** Consult-before-transfer, or calling a participant before merging them in. */
export function ConsultView({ onMinimise }: { onMinimise: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const call = useCall((s) => s.call);
  const consult = useCall((s) => s.consult);
  const { cancelConsult } = useCall.getState();
  const party = useCallParty();
  const now = useNow(500);
  if (!call || !consult) return null;

  const transfer = consult.kind === 'transfer';
  const failed = consult.state === 'busy' || consult.state === 'no-answer' || consult.state === 'declined';
  const customer = party(call).name;
  // The server's consult doesn't hold the customer: say whether they're on hold or can hear the agent
  const held = call.state === 'held';
  const customerState = held ? 'On hold' : 'Can hear you';
  const targetTime = consult.answeredAt ? formatDuration((now - consult.answeredAt) / 1000) : null;

  const targetStatus = failed ? (
    <T v="label" color={c.errorFg}>
      {/* The web's failed transfer / conference reads "Call Failed" over the reason */}
      Call Failed
    </T>
  ) : targetTime ? (
    <T v="label" color={c.successFg} nums>
      {targetTime}
    </T>
  ) : (
    <T v="label" color={c.onCallScreen2}>
      {consult.state === 'merging' ? 'Merging…' : 'Ringing…'}
    </T>
  );

  return (
    <View style={{ flex: 1, gap: 14 }}>
      <CallStrip
        onMinimise={onMinimise}
        title={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T v="bodyStrong" color={c.onCallScreen} numberOfLines={1} style={{ flexShrink: 1 }}>
              {customer}
            </T>
            <View
              style={{ paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: held ? c.warningBg : c.successBg, justifyContent: 'center' }}
            >
              <T v="caption" color={held ? c.warningFg : c.successFg} style={{ fontFamily: font.semibold }}>
                {customerState}
              </T>
            </View>
          </View>
        }
      />
      <T v="overline" color={c.onCallScreen2} style={{ paddingHorizontal: 4 }}>
        {transfer ? 'Transferring' : 'Adding to conference'}
      </T>
      <Animated.View entering={FadeInDown.duration(duration.base)} style={{ gap: 10 }}>
        <PartyCard
          name={customer}
          role="Customer"
          right={
            <T v="label" color={held ? c.warningFg : c.successFg}>
              {customerState}
            </T>
          }
        />
        <PartyCard
          name={consult.target.name}
          role={consult.target.kind === 'agent' ? `Agent · ${consult.target.role}` : 'External'}
          right={targetStatus}
        />
      </Animated.View>

      {/* The server rings them and connects them itself the moment they answer, as on the web */}
      <View style={{ gap: 8, paddingHorizontal: 4 }}>
        {failed && (
          <T v="h3" color={c.errorFg}>
            Call Failed
          </T>
        )}
        <T v="body" color={c.onCallScreen}>
          {failed
            ? (consult.error ?? 'Failed. Please try again.')
            : transfer
              ? `Ringing ${consult.target.name}. ${customer.split(' ')[0]} goes to them as soon as they answer, and this call moves to wrap-up.`
              : `Ringing ${consult.target.name}. They join the call as soon as they answer.`}
        </T>
      </View>

      <View style={{ flex: 1 }} />
      <Animated.View exiting={FadeOut.duration(duration.fast)} style={{ gap: 10, paddingBottom: Math.max(0, 8 - insets.bottom) }}>
        {/* The server's request can't be called off once it's ringing them; after a failure this goes back */}
        {failed && (
          <PressableScale
            accessibilityRole="button"
            scaleTo={0.97}
            onPress={() => {
              tap();
              cancelConsult();
            }}
            style={{
              height: 52,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: c.callControlActive,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <T v="h3" color={c.onCallScreen}>
              Back to call
            </T>
          </PressableScale>
        )}
      </Animated.View>
    </View>
  );
}

/** Participants of an active conference with per-leg mute and remove. */
export function ConferencePanel() {
  const { c } = useTheme();
  const conf = useCall((s) => s.conference);
  const { toggleLegMute, removeLeg } = useCall.getState();
  const now = useNow(500);
  if (!conf) return null;
  return (
    <Animated.View entering={FadeIn.duration(duration.base)} style={{ gap: 10, paddingHorizontal: 20 }}>
      <T v="h3" color={c.onCallScreen} nums accessibilityRole="header" style={{ textAlign: 'center' }}>
        Conference call · {conf.legs.length + 1}-way · {formatDuration((now - conf.startedAt) / 1000)}
      </T>
      <View style={{ backgroundColor: c.callControl, borderRadius: 16, paddingVertical: 4 }}>
        {conf.legs.map((l: Leg, i) => (
          <Animated.View
            key={l.id}
            layout={LinearTransition.duration(duration.base)}
            entering={FadeIn.duration(duration.base)}
            exiting={FadeOut.duration(duration.fast)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderTopWidth: i ? 1 : 0,
              borderTopColor: c.callScreen,
            }}
          >
            <Avatar name={l.name} size={40} tone="invert" />
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" color={c.onCallScreen} numberOfLines={1}>
                {l.name}
              </T>
              <T v="caption" color={c.onCallScreen2}>
                {l.role}
                {l.muted ? ' · Muted' : ''}
              </T>
            </View>
            <RoundButton
              icon={l.muted ? 'mic-off' : 'mic'}
              label={`${l.muted ? 'Unmute' : 'Mute'} ${l.name}`}
              bg={l.muted ? c.callControlActive : 'transparent'}
              fg={l.muted ? c.onCallControlActive : c.onCallScreen}
              onPress={() => toggleLegMute(l.id)}
            />
            <RoundButton icon="call-end" label={`Remove ${l.name}`} bg={c.danger} fg={c.onDanger} onPress={() => removeLeg(l.id)} />
          </Animated.View>
        ))}
      </View>
    </Animated.View>
  );
}
