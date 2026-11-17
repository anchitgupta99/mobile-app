import { router, useLocalSearchParams, useNavigation, useRootNavigationState } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { webText } from '@/api/errors';
import { USE_BACKEND } from '@/api/http';
import { useNetwork } from '@/api/network';
import { DispositionPicker } from '@/components/DispositionPicker';
import { feedback } from '@/feedback';
import { duration } from '@/theme/motion';
import { InfoTip } from '@/components/InfoTip';
import { helpText } from '@/domain/helpText';
import { notify } from '@/components/feedback';
import { useStatusSheet } from '@/components/StatusSheet';
import { ModeBadge } from '@/components/ModeBadge';
import { usePhoneDisplay } from '@/components/PhoneText';
import { Button, Field, Icon, IconButton, Pill, T, tap, Toggle, type IconName } from '@/components/ui';
import { formatDuration, formatWhen, uid } from '@/domain/format';
import { findPath, isComplete, isRetryDisposition, pathLabel, type DispositionPath } from '@/domain/dispositions';
import type { DispositionConfig, DispositionField } from '@/domain/types';
import { useNow } from '@/hooks/useNow';
import { findCampaign } from '@/store/campaigns';
import { useData } from '@/store/data';
import { useSession } from '@/store/session';
import { scheduleAutoCall } from '@/telephony/autoCall';
import { sendableName, useCall } from '@/telephony/callStore';
import { font, useTheme } from '@/theme';
import { keyboardBehavior } from '@/components/keyboard';

function presets(now: Date) {
  const at = (d: Date, h: number, m = 0) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x;
  };
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const monday = new Date(now);
  monday.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  const inHour = new Date(now.getTime() + 3600000);
  inHour.setMinutes(Math.ceil(inHour.getMinutes() / 15) * 15, 0, 0);
  const evening = at(now, 18);
  return [
    { label: 'In 1 hour', value: inHour },
    ...(evening.getTime() - now.getTime() > 2 * 3600000 ? [{ label: 'This evening', value: evening }] : []),
    { label: 'Tomorrow 10 AM', value: at(tomorrow, 10) },
    { label: 'Tomorrow 4 PM', value: at(tomorrow, 16) },
    { label: 'Next Monday', value: at(monday, 10) },
  ];
}

function DateTimeField({ field, value, onChange }: { field: DispositionField; value: string; onChange: (v: string) => void }) {
  const { c } = useTheme();
  const opts = useMemo(() => presets(new Date()), []);
  const cur = value ? new Date(value) : null;
  const nudge = (min: number) => {
    const base = cur ?? opts[0].value;
    onChange(new Date(base.getTime() + min * 60000).toISOString());
  };
  return (
    <View style={{ gap: 10 }}>
      <T v="label">
        {field.label}
        {field.required ? ' *' : ''}
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {opts.map((o) => (
          <Pill
            key={o.label}
            label={o.label}
            active={!!cur && Math.abs(cur.getTime() - o.value.getTime()) < 60000}
            onPress={() => onChange(o.value.toISOString())}
          />
        ))}
      </View>
      {cur && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: c.selected,
            borderRadius: 10,
            padding: 8,
            paddingLeft: 14,
          }}
        >
          <Icon name="event" size={20} color={c.purple} />
          <T v="bodyStrong" style={{ flex: 1 }} nums>
            {formatWhen(cur.toISOString())}
          </T>
          <IconButton icon="remove" label="15 minutes earlier" size={40} onPress={() => nudge(-15)} />
          <IconButton icon="add" label="15 minutes later" size={40} onPress={() => nudge(15)} />
        </View>
      )}
    </View>
  );
}

/** One of the web's two callback choices: "For Me" (routes back to this agent) or "Campaign" (any available agent) */
function RouteChoice({ icon, title, body, on, onPress }: { icon: IconName; title: string; body: string; on: boolean; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${title}, ${body}`}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        padding: 12,
        borderRadius: 10,
        borderWidth: on ? 2 : 1,
        borderColor: on ? c.purple : c.line,
        backgroundColor: pressed ? c.subtle : on ? c.selected : c.surface,
      })}
    >
      <Icon name={icon} size={18} color={on ? c.purple : c.ink2} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" color={on ? c.purple : c.ink}>
          {title}
        </T>
        <T v="caption" numberOfLines={1}>
          {body}
        </T>
      </View>
    </Pressable>
  );
}

/** Calls onTimeout once, when the wrap-up time has run out */
function WrapUpTimeout({ secondsLeft, onTimeout }: { secondsLeft: number; onTimeout: () => void }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || secondsLeft > 0) return;
    fired.current = true;
    onTimeout();
  }, [secondsLeft, onTimeout]);
  return null;
}

export default function WrapUp() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const call = useData((s) => s.calls.find((x) => x.id === id));
  const contact = useData((s) => s.contacts.find((x) => x.id === call?.contactId));
  const storeConfig = useData((s) => s.dispositions);
  const tasks = useData((s) => s.tasks);
  const saveDisposition = useData((s) => s.saveDisposition);
  const upsertTask = useData((s) => s.upsertTask);
  const navigation = useNavigation();
  const rootState = useRootNavigationState();
  const draft = useCall((s) => (id ? (s.notes[id] ?? '') : ''));
  const taskId = useCall((s) => (id ? s.taskLinks[id] : undefined));
  const finishWrapUp = useCall((s) => s.finishWrapUp);
  const setStatus = useSession((s) => s.setStatus);
  const quality = useNetwork((s) => s.quality);
  const phone = usePhoneDisplay();
  const now = useNow();
  const [opened] = useState(() => Date.now());

  // Wrap-up only exists right after a call; once it's submitted the call is read-only. Latched on
  // mount: submit() clears the store's wrapUpCallId before this screen has finished closing, and
  // the read-only branch must not flash during that exit.
  const [postCall] = useState(() => useCall.getState().wrapUpCallId === id);
  const blocking = postCall;

  // Against the backend the options are the call's own campaign's, fetched for this wrap-up (as the web's
  // disposition panel does): an inbound or auto-dial-group call can be in another campaign than the agent's
  const fromServer = USE_BACKEND && postCall;
  const campaignId = call?.campaignId;
  const [remote, setRemote] = useState<DispositionConfig | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!fromServer || !campaignId) return;
    let gone = false;
    api.dispositions
      .config(campaignId, findCampaign(campaignId)?.wrapUpSeconds)
      .then((cfg) => !gone && setRemote(cfg))
      .catch((e) => !gone && setRemoteError(e instanceof Error ? e.message : 'Could not load the dispositions'));
    return () => {
      gone = true;
    };
  }, [fromServer, campaignId, attempt]);
  const config: DispositionConfig = fromServer
    ? (remote ?? { ...storeConfig, dispositions: [], acwSeconds: findCampaign(campaignId)?.wrapUpSeconds ?? 30 })
    : storeConfig;
  const loadingDispositions = fromServer && !remote;
  // Wrap-up replaced the active-call screen, so the route under it is wherever the call started.
  // Only unwind to the callbacks list when that was the tab group; from a contact or task page a
  // plain back keeps the agent's place.
  const [fromTabs] = useState(() => {
    const routes = rootState?.routes ?? [];
    return routes.length >= 2 && routes[routes.length - 2]?.name === '(tabs)';
  });

  const [path, setPath] = useState<DispositionPath>(() => findPath(config.dispositions, call?.disposition) ?? []);
  const chosen = isComplete(path) ? path[path.length - 1] : null;
  // Fields can sit on any level of the path, e.g. "Sale" asks for the amount whichever product was sold
  const pathFields = useMemo(() => path.flatMap((d) => d.fields), [path]);
  const [notes, setNotes] = useState(call?.notes || draft);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  // Which Submit is with the server, and why the server last turned it down (shown above the buttons, as the web's)
  const [saving, setSaving] = useState<'available' | 'break' | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Backend, as the web's panel: Mark DND, and Schedule Callback with who gets it (For Me / Campaign) and when
  const [dnd, setDnd] = useState(false);
  const [scheduleCallback, setScheduleCallback] = useState(false);
  const [routeToMe, setRouteToMe] = useState(true);
  const [callbackAt, setCallbackAt] = useState('');

  // Nothing leaves a pending wrap-up: hardware back, swipe, or browser back. The store is read
  // live because submit() clears the wrap-up and closes in the same tick.
  useEffect(() => {
    if (!blocking) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (useCall.getState().wrapUpCallId === id) e.preventDefault();
    });
  }, [navigation, blocking, id]);

  if (!call) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.page, gap: 12 }}>
        <T v="h3">Call not found</T>
        <Button label="Close" variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </View>
    );
  }

  const close = () => {
    if (postCall && taskId && fromTabs) router.dismissTo('/callbacks');
    else if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (!postCall) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <View
          style={{
            backgroundColor: c.topbar,
            paddingTop: insets.top + 8,
            paddingBottom: 12,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <T v="h2" color={c.onTopbar} style={{ flex: 1 }} accessibilityRole="header">
            Call closed
          </T>
          <IconButton icon="close" label="Close" variant="topbar" size={40} onPress={close} />
        </View>
        <View style={{ padding: 24, gap: 12, alignItems: 'center' }}>
          <Icon name="lock-outline" size={36} color={c.ink3} />
          <T v="h3" style={{ textAlign: 'center' }}>
            This call is read-only
          </T>
          <T v="body" color={c.ink2} style={{ textAlign: 'center' }}>
            Disposition and notes are added in wrap-up right after a call and can’t be changed or added later.
          </T>
          <Button label="View call details" variant="outline" onPress={() => router.replace(`/call-detail/${call.id}`)} />
        </View>
      </View>
    );
  }

  const acwLeft = config.acwSeconds - Math.floor((now - opened) / 1000);
  const missing = pathFields.filter((f) => f.required && !fields[f.key]?.trim());
  // A campaign without a disposition template has nothing to pick; the call still gets closed
  const noOptions = fromServer && !!remote && remote.dispositions.length === 0;
  // Backend: the template's switches (all on when the list didn't say, as the web) and the deepest outcome
  // picked so far, which decides a required callback or a do-not-call outcome as on the web
  const prefs = fromServer ? (config.prefs ?? { callbackEnabled: true, dncEnabled: true, notesEnabled: true, notesRequired: false }) : null;
  const deepest = path[path.length - 1] ?? null;
  const notesShown = prefs ? prefs.notesEnabled : true;
  const notesNeeded = prefs ? prefs.notesRequired : !!config.notesRequired || !!chosen?.requiresNotes;
  const notesMissing = notesNeeded && !notes.trim();
  // A control the admin turned off carries nothing into the submit, as on the web
  const sentNotes = notesShown ? notes.trim() : '';
  const autoDnc = !!prefs && !!deepest?.doNotCall;
  const showDnc = !!prefs && (prefs.dncEnabled || autoDnc);
  const dndOn = showDnc && (dnd || autoDnc);
  const requiresCallback = !!prefs && !!deepest?.requiresCallback;
  const showCallback = !!prefs && (prefs.callbackEnabled || requiresCallback);
  const callbackActive = showCallback && (scheduleCallback || requiresCallback);
  const callbackIncomplete = callbackActive && !callbackAt;
  const callbackCampaign = findCampaign(call.campaignId)?.name ?? call.campaignName ?? '';
  const valid =
    (noOptions || !!chosen) && missing.length === 0 && !notesMissing && !loadingDispositions && !callbackIncomplete;

  /** The web's /api/leads/disposition body; a timed-out wrap-up goes in as it stands (isTimeout) */
  const serverBody = (timeout: boolean) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const raw = fields.value?.trim();
    const valueField = pathFields.find((f) => f.key === 'value');
    // A date disposition's value is the local calendar date, as the web's date input gives it
    const fieldValue =
      raw && valueField?.kind === 'datetime'
        ? (() => {
            const d = new Date(raw);
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          })()
        : raw || undefined;
    return {
      // As the web: the deepest outcome picked. A manual submit is only let through once that is a complete
      // choice; the timer's auto-submit sends whatever was picked so far, even with its sub-disposition missing
      dispositionId: (timeout ? deepest : chosen)?.code ?? null,
      isTimeout: timeout,
      path: path.map((d) => d.code),
      notes: sentNotes,
      wrapUpTime: Math.round((Date.now() - opened) / 1000),
      call_uuid: call.uuid ?? null,
      agentUuid: null,
      campaignId: call.campaignId,
      // The lead's list and the campaign's prefix from the call's context, as the web sends them
      listId: call.leadId ? (call.listId ?? '') : '',
      customerNumber: call.number,
      campaignPrefix: call.campaignPrefix ?? '',
      fieldValue,
      leadId: call.leadId ?? null,
      // A number that isn't a lead yet becomes one, as on the web (never with a name the server masked)
      ...(!call.leadId && { leadData: { phone_number: call.number, name: sendableName(call.customerName), status: 'IDLE' } }),
    };
  };

  const submit = async (next: 'available' | 'break' | 'stay', timeout = false) => {
    if (saving) return;
    setTouched(true);
    if (!timeout && !valid) {
      tap('warning');
      return;
    }
    setSubmitError(null);
    setSaving(next === 'break' ? 'break' : 'available');
    // Backend: what goes in on the timer's auto-submit is the outcome picked so far (see serverBody)
    const sent = fromServer && timeout ? deepest : chosen;
    try {
      await saveDisposition(
        {
          callId: call.id,
          code: sent?.code ?? 'none',
          notes: sentNotes,
          fields,
          submittedAt: new Date().toISOString(),
          ...(fromServer && { server: serverBody(timeout) }),
        },
        { label: sent ? pathLabel(path) : timeout ? 'Auto-disposed' : 'No disposition' },
      );
    } catch (e) {
      // The web's failed Submit: the agent stays on wrap-up with the server's message (else the web's
      // fallback) in red and in a toast, fixes it and submits again. The "fill and save in Lead Details"
      // message reads as the web shows it, under "Required Fields Missing".
      const message = webText(e, ['message'], 'Failed to submit. Please try again.');
      setSubmitError(message);
      setSaving(null);
      notify(message, 'error', undefined, {
        title: message.startsWith('Please fill and save in Lead Details') ? 'Required Fields Missing' : 'Submission Failed',
      });
      return;
    }
    // The web's "Mark DND": the number onto the campaign's DND list (a do-not-call outcome is left to the server,
    // which adds it itself). The web sends it before the disposition, after checking the lead's required fields
    // itself; here the server does that check with the disposition, so the DND goes in only once that is saved.
    // If it fails the disposition stays saved, as on the web.
    if (fromServer && dndOn && !autoDnc && call.campaignId) {
      void api.dnc
        .add({ phoneNumber: call.number, leadName: sendableName(call.customerName), campaignId: call.campaignId })
        .catch(() => undefined);
    }
    const cbField = pathFields.find((f) => f.kind === 'datetime' && f.createsTask);
    // As the web, once the disposition is saved (also on an auto-submit when a time was set): the callback, for
    // this agent or for the campaign. Its failure reads as the web's ("Submission Failed"); the disposition stays saved.
    if (fromServer && callbackActive && callbackAt && call.campaignId) {
      api.callbacks
        .create({
          leadId: call.leadId ?? null,
          campaignId: call.campaignId,
          name: sendableName(call.customerName),
          phoneNumber: call.number,
          at: new Date(callbackAt),
          remarks: sentNotes,
          routeToAgent: routeToMe,
        })
        // On the server now: the Callbacks tab picks it up from there
        .then(() => useData.getState().sync())
        .catch((e) =>
          notify(webText(e, ['message'], 'Failed to submit. Please try again.'), 'error', undefined, { title: 'Submission Failed' }),
        );
    }
    if (!fromServer && cbField && fields[cbField.key]) {
      upsertTask({
        id: uid('tk'),
        kind: 'callback',
        title: notes.trim().split('\n')[0]?.slice(0, 60) || 'Callback',
        contactId: call.contactId,
        number: call.number,
        dueAt: fields[cbField.key],
        slaDueAt: null,
        notes: notes.trim(),
        done: false,
        createdFromCallId: call.id,
        updatedAt: new Date().toISOString(),
      });
    }
    // The callback that was being worked is done unless the customer still has to be reached
    if (taskId && chosen && !isRetryDisposition(chosen.code)) {
      const t = tasks.find((x) => x.id === taskId);
      if (t && !t.done) upsertTask({ ...t, done: true });
    }
    if (chosen?.code === 'dnc' && call.contactId) useData.getState().updateContact(call.contactId, { dnc: true });

    feedback('disposition.saved');
    if (postCall) finishWrapUp();
    // Against the backend the disposition itself makes the agent READY; a break needs its type, picked next
    if (next === 'available' || (next === 'break' && !fromServer)) setStatus(next);
    if (next === 'break') setTimeout(() => useStatusSheet.getState().show(true), 350);
    close();
    if (fromServer) {
      // The web's success toasts
      notify(
        timeout ? 'Wrap-up timer expired — disposition saved automatically.' : 'Your disposition has been saved successfully.',
        'success',
        undefined,
        { silent: true, title: timeout ? 'Disposition Auto-Submitted' : 'Disposition Submitted' },
      );
      return;
    }
    if (postCall && next === 'available' && scheduleAutoCall()) return;

    const offline = quality === 'offline';
    const following = postCall
      ? tasks.filter((t) => !t.done && t.id !== taskId && t.contactId).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
      : undefined;
    if (following && taskId) {
      const who = useData.getState().contacts.find((x) => x.id === following.contactId)?.name ?? 'next contact';
      setTimeout(
        () =>
          notify(
            `Saved${offline ? ' on this phone' : ''}. Next: ${who}`,
            'success',
            {
              label: 'Open',
              onPress: () => router.push(`/task/${following.id}`),
            },
            { silent: true },
          ),
        250,
      );
    } else {
      notify(offline ? 'Saved on this phone. Will sync when online.' : 'Disposition saved', 'success', undefined, { silent: true });
    }
  };

  const renderField = (f: DispositionField) => {
    const v = fields[f.key] ?? '';
    const set = (val: string) => setFields((s) => ({ ...s, [f.key]: val }));
    const err = touched && f.required && !v.trim() ? 'Required' : null;
    if (f.kind === 'datetime')
      return (
        <View>
          <DateTimeField field={f} value={v} onChange={set} />
          {err && (
            <T v="caption" color={c.errorFg} style={{ marginTop: 6 }}>
              Choose when to call back
            </T>
          )}
        </View>
      );
    if (f.kind === 'select')
      return (
        <View style={{ gap: 10 }}>
          <T v="label">
            {f.label}
            {f.required ? ' *' : ''}
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {f.options.map((o) => (
              <Pill key={o} label={o} active={v === o} onPress={() => set(o)} />
            ))}
          </View>
          {err && (
            <T v="caption" color={c.errorFg}>
              {err}
            </T>
          )}
        </View>
      );
    return (
      <Field
        label={`${f.label}${f.required ? ' *' : ''}`}
        value={v}
        onChangeText={set}
        keyboardType={f.key === 'amount' ? 'number-pad' : 'default'}
        error={err}
      />
    );
  };

  return (
    <KeyboardAvoidingView behavior={keyboardBehavior} style={{ flex: 1, backgroundColor: c.page }}>
      {/* As the web: when the campaign's wrap-up time runs out, the disposition goes in as it stands, even when
          the list of dispositions didn't load (then with none, which the server saves as auto-disposed) */}
      {fromServer && <WrapUpTimeout secondsLeft={acwLeft} onTimeout={() => void submit('available', true)} />}
      <View style={{ backgroundColor: c.topbar, paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 16, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T v="h2" color={c.onTopbar} style={{ flex: 1 }} accessibilityRole="header">
            Wrap-up
          </T>
          <InfoTip {...helpText.acw}>
            <View
              accessibilityLabel={acwLeft >= 0 ? `After-call work, ${acwLeft} seconds left` : `After-call work over by ${-acwLeft} seconds`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                height: 32,
                paddingHorizontal: 12,
                borderRadius: 16,
                backgroundColor: acwLeft < 0 ? c.errorBg : c.topbarControl,
              }}
            >
              <Icon name="timer" size={16} color={acwLeft < 0 ? c.errorFg : c.onTopbar} />
              <T v="label" nums color={acwLeft < 0 ? c.errorFg : c.onTopbar}>
                {acwLeft >= 0 ? `ACW ${formatDuration(acwLeft)}` : `+${formatDuration(-acwLeft)}`}
              </T>
              <Icon name="info-outline" size={14} color={acwLeft < 0 ? c.errorFg : c.onTopbar} />
            </View>
          </InfoTip>
          {!blocking && <IconButton icon="close" label="Close" variant="topbar" size={40} onPress={close} />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <T v="bodyStrong" color={c.onTopbar} numberOfLines={1}>
              {contact?.name || call.customerName || (call.displayNumber ?? phone(call.number))}
            </T>
            <T v="caption" color={c.onTopbar} style={{ opacity: 0.8 }} nums>
              {call.direction === 'inbound' ? 'Inbound' : 'Outbound'} ·{' '}
              {call.durationSec ? formatDuration(call.durationSec) : call.outcome === 'missed' ? 'Missed' : 'Not connected'} ·{' '}
              {formatWhen(call.startedAt)}
            </T>
          </View>
          <ModeBadge mode={call.mode} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* The web's "Mark DND" (in its panel's header): shown when the template allows it, locked on for a
            do-not-call outcome */}
        {showDnc && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <T v="label">Mark DND</T>
            <Toggle label="Mark DND" value={dndOn} onChange={setDnd} disabled={autoDnc} activeColor={c.errorFg} />
          </View>
        )}
        {loadingDispositions ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }}>
            {remoteError ? (
              <>
                <Icon name="error-outline" size={20} color={c.errorFg} />
                <T v="caption" color={c.errorFg} style={{ flex: 1 }}>
                  {remoteError}
                </T>
                <Button
                  label="Try again"
                  icon="refresh"
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    setRemoteError(null);
                    setAttempt((n) => n + 1);
                  }}
                />
              </>
            ) : (
              <>
                <ActivityIndicator color={c.purple} />
                <T v="caption">Loading this campaign’s dispositions…</T>
              </>
            )}
          </View>
        ) : noOptions ? (
          <T v="caption" color={c.ink2}>
            No dispositions are set up for this campaign. Add a note if needed and submit to close the call.
          </T>
        ) : (
          <DispositionPicker
            options={config.dispositions}
            path={path}
            showErrors={touched}
            onChange={(p) => {
              // As the web: leaving an outcome that required the callback turns the switch back off
              if (path[path.length - 1]?.requiresCallback && !p[p.length - 1]?.requiresCallback) setScheduleCallback(false);
              setPath(p);
              setFields((prev) => {
                // Keep values for fields that are still on the new path
                const keep = new Set(p.flatMap((d) => d.fields.map((f) => f.key)));
                return Object.fromEntries(Object.entries(prev).filter(([k]) => keep.has(k)));
              });
            }}
          />
        )}

        {pathFields.map((f) => (
          <Animated.View
            key={f.key}
            entering={FadeIn.duration(duration.base)}
            exiting={FadeOut.duration(duration.fast)}
            layout={LinearTransition.duration(duration.base)}
          >
            {renderField(f)}
          </Animated.View>
        ))}

        {/* Backend: the web's "Additional Note", shown and required as the template says */}
        {notesShown && (
          <Animated.View layout={LinearTransition.duration(duration.base)}>
            <Field
              label={`${fromServer ? 'Additional Note' : 'Notes'}${notesNeeded ? ' *' : ''}`}
              multiline
              value={notes}
              onChangeText={setNotes}
              placeholder={fromServer ? 'Add a note...' : "What happened, what's next"}
              error={
                touched && notesMissing
                  ? fromServer
                    ? 'Additional notes are required'
                    : 'A note is required for this disposition'
                  : null
              }
            />
          </Animated.View>
        )}

        {/* Backend: the web's "Schedule Callback": offered when the template allows it, on and required when the
            outcome requires a callback; for this agent or for the campaign, at a date and time */}
        {showCallback && (
          <Animated.View layout={LinearTransition.duration(duration.base)} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <T v="label">
                Schedule Callback{requiresCallback ? ' *' : ''}
              </T>
              <Toggle label="Schedule Callback" value={callbackActive} onChange={setScheduleCallback} disabled={requiresCallback} />
            </View>
            {callbackActive && (
              <>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <RouteChoice icon="person" title="For Me" body="Routes back to you" on={routeToMe} onPress={() => setRouteToMe(true)} />
                  <RouteChoice
                    icon="groups"
                    title="Campaign"
                    body={callbackCampaign || 'Any available agent'}
                    on={!routeToMe}
                    onPress={() => setRouteToMe(false)}
                  />
                </View>
                <DateTimeField
                  field={{ kind: 'datetime', key: 'callback', label: 'Callback date & time', required: true, createsTask: true }}
                  value={callbackAt}
                  onChange={setCallbackAt}
                />
                {touched && !callbackAt && (
                  <T v="caption" color={c.errorFg}>
                    Choose when to call back
                  </T>
                )}
              </>
            )}
          </Animated.View>
        )}

        {quality === 'offline' && (
          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              backgroundColor: c.infoBg,
              borderColor: c.infoLine,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Icon name="cloud-off" size={20} color={c.infoFg} />
            <T v="caption" color={c.infoFg} style={{ flex: 1 }}>
              You are offline. This saves on your phone and syncs automatically.
            </T>
          </View>
        )}
      </ScrollView>

      <View
        style={{
          padding: 16,
          paddingBottom: insets.bottom + 12,
          gap: 10,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.divider,
        }}
      >
        {submitError && (
          <Animated.View entering={FadeIn.duration(duration.base)} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Icon name="error-outline" size={18} color={c.errorFg} />
            <T v="caption" color={c.errorFg} style={{ flex: 1 }} accessibilityLiveRegion="polite">
              {submitError}
            </T>
          </Animated.View>
        )}
        <Button
          label={saving === 'available' ? 'Submitting...' : 'Submit and go online'}
          icon="check"
          size="lg"
          full
          loading={saving === 'available'}
          onPress={() => void submit('available')}
          disabled={(touched && !valid) || !!saving}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button
            label={saving === 'break' ? 'Submitting...' : 'Submit and break'}
            variant="outline"
            style={{ flex: 1 }}
            loading={saving === 'break'}
            onPress={() => void submit('break')}
            disabled={!!saving}
          />
        </View>
        <T v="caption" color={c.ink3} style={{ textAlign: 'center', fontFamily: font.regular }}>
          {helpText.requiredFields}
        </T>
      </View>
    </KeyboardAvoidingView>
  );
}
