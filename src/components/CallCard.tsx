import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { api } from '@/api/client';
import { formatDuration, formatWhen } from '@/domain/format';
import { findCampaign } from '@/store/campaigns';
import { findPath, pathLabel } from '@/domain/dispositions';
import type { CallRecord, Contact } from '@/domain/types';
import { useData } from '@/store/data';
import { useTheme } from '@/theme';
import { alertDialog, notify } from './feedback';
import { usePhoneDisplay } from './PhoneText';
import { contactById } from './contactMap';
import { Sheet, useLastWhileOpen } from './Sheet';
import { Button, Divider, Icon, IconButton, T, tap, type IconName } from './ui';
import { Tappable } from './motion/Tappable';

/** Saved dispositions may be a code from an older sync; always show the readable path. */
export function useDispositionLabel() {
  const tree = useData((s) => s.dispositions.dispositions);
  return (saved: string | null) => {
    const p = findPath(tree, saved);
    return p ? pathLabel(p) : saved;
  };
}

/** The campaign's name: the agent's campaigns first, then the name the server's history row carries */
export function campaignName(id: string, fromRecord?: string) {
  return findCampaign(id)?.name ?? fromRecord ?? id;
}

/** Who the call was with: the app's contact, else the name in the server's call history (empty without one) */
export function callName(call: CallRecord, contact: Contact | undefined) {
  return contact?.name || call.customerName || '';
}

function dirIcon(c: CallRecord): { icon: IconName; missed: boolean; label: string } {
  if (c.outcome === 'missed') return { icon: 'call-missed', missed: true, label: 'Missed inbound' };
  if (c.direction === 'inbound') return { icon: 'call-received', missed: false, label: 'Inbound' };
  if (c.outcome !== 'answered') return { icon: 'call-made', missed: true, label: 'Outbound, not answered' };
  return { icon: 'call-made', missed: false, label: 'Outbound' };
}

function Meta({ label, value, right }: { label: string; value: string; right?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, gap: 1 }}>
      <T v="caption" color={c.ink3}>
        {label}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <T v="label" numberOfLines={1} style={{ flexShrink: 1 }}>
          {value}
        </T>
        {right}
      </View>
    </View>
  );
}

export function CallCard({
  call,
  onCallBack,
  callDimmed,
  onLead,
  onPlay,
}: {
  call: CallRecord;
  onCallBack: () => void;
  /** The call can't start right now: looks unavailable but stays tappable, so tapping says why */
  callDimmed?: boolean;
  onLead: () => void;
  onPlay: () => void;
}) {
  const { c } = useTheme();
  const contact = useData((s) => contactById(s.contacts, call.contactId));
  const phone = usePhoneDisplay();
  const d = dirIcon(call);
  const talk = call.talkSec ?? (call.outcome === 'answered' ? call.durationSec : 0);
  const total = Math.max(call.durationSec, talk);
  const label = useDispositionLabel();
  const disposition =
    label(call.disposition) ?? (call.outcome === 'missed' ? 'Missed' : call.outcome === 'answered' ? 'Not dispositioned' : 'No answer');

  return (
    <View
      style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.line, boxShadow: c.cardShadow, padding: 14, gap: 12 }}
    >
      {/* Only the header navigates, so the action buttons below aren't nested inside another button */}
      <Tappable scaleTo={1}
        accessibilityRole="button"
        accessibilityLabel={`${callName(call, contact) || 'Unknown number'}, ${d.label}, ${formatWhen(call.startedAt)}, ${disposition}. Open call details`}
        onPress={() => {
          tap();
          router.push(`/call-detail/${call.id}`);
        }}
        // A tint, not a fade (fading reads as disabled); the -6/+6 keeps the layout where it was
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          margin: -6,
          padding: 6,
          borderRadius: 10,
          backgroundColor: pressed ? c.pressed : 'transparent',
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: d.missed ? c.errorBg : c.successBg,
          }}
        >
          <Icon name={d.icon} size={18} color={d.missed ? c.errorFg : c.successFg} />
        </View>
        <View style={{ flex: 1 }}>
          {/* The name if the server has one, then the number; without a name, just the number (masked per campaign) */}
          <T v="bodyStrong" numberOfLines={1}>
            {callName(call, contact) || (call.displayNumber ?? phone(call.number))}
            {!!callName(call, contact) && (
              <T v="body" color={c.ink2}>
                {' '}
                · {call.displayNumber ?? phone(call.number)}
              </T>
            )}
          </T>
          <T v="caption" nums>
            {formatWhen(call.startedAt)}
          </T>
        </View>
        <Icon name="chevron-right" color={c.ink3} />
      </Tappable>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T v="caption" color={c.ink3}>
            Duration{' '}
            <T v="label" nums>
              {formatDuration(total)}
            </T>
          </T>
          <T v="caption" color={c.ink3}>
            Talk{' '}
            <T v="label" nums>
              {formatDuration(talk)}
            </T>
          </T>
        </View>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: c.mutedFill }}>
          <View style={{ width: `${total ? (talk / total) * 100 : 0}%`, height: 4, borderRadius: 2, backgroundColor: c.violet }} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 12 }}>
        <Meta label="Campaign" value={campaignName(call.campaignId, call.campaignName)} />
        <Meta label="Disconnected by" value={call.disconnectedBy === 'agent' ? 'Agent' : 'Customer'} />
        <Meta
          label="Disposition"
          value={disposition}
          right={
            <Tappable
              accessibilityRole="button"
              accessibilityLabel="Disposition details"
              // 16dp icon + 16 on each side = a 48dp target
              hitSlop={16}
              onPress={() =>
                alertDialog({
                  title: disposition,
                  message: call.notes ? call.notes : 'No notes were added in wrap-up.',
                  icon: 'info',
                  tone: 'info',
                  actions: [{ label: 'Close', variant: 'outline' }],
                })
              }
            >
              <Icon name="info-outline" size={16} color={c.ink2} />
            </Tappable>
          }
        />
      </View>

      <Divider />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T v="caption" color={c.ink3} style={{ flex: 1 }}>
          Read-only
        </T>
        <View style={{ opacity: callDimmed ? 0.4 : 1 }}>
          <IconButton icon="call" label="Call back" size={40} color={c.call} onPress={onCallBack} />
        </View>
        <IconButton icon="visibility" label="View lead details" size={40} onPress={onLead} />
        <IconButton icon="play-arrow" label={call.hasRecording ? 'Play recording' : 'No recording'} size={40} onPress={onPlay} />
      </View>
    </View>
  );
}

/**
 * The lead's fields as the web's "View Lead Profile" lists them (LeadDetailsModal): every field the server sends,
 * masked as the campaign says, with the call's UUID put in after the email field. Readable names: "email_id"
 * becomes "Email Id", "call_uuid" "Call UUID".
 */
function leadEntries(data: Record<string, unknown> | null, callUuid: string | undefined): [string, string][] {
  if (!data || Object.keys(data).length === 0) return [];
  const entries = Object.entries(data);
  const hasUuid = entries.some(([k]) => k.toLowerCase() === 'call_uuid' || k.toLowerCase() === 'calluuid');
  if (callUuid && !hasUuid) {
    const emailAt = entries.findIndex(([k]) => k.toLowerCase().replace(/[^a-z]/g, '').includes('email'));
    if (emailAt !== -1) entries.splice(emailAt + 1, 0, ['call_uuid', callUuid]);
    else entries.push(['call_uuid', callUuid]);
  }
  return entries.map(([key, val]) => {
    const isUuid = key.toLowerCase() === 'call_uuid' || key.toLowerCase() === 'calluuid';
    const label = isUuid ? 'Call UUID' : key.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
    const value = val === null || val === undefined ? '—' : typeof val === 'object' ? JSON.stringify(val) : String(val);
    return [label, value];
  });
}

/** Read-only lead details for a call; every value can be copied. */
export function LeadSheet({ call: open, onClose }: { call: CallRecord | null; onClose: () => void }) {
  const { c } = useTheme();
  // Keeps showing the last call while the sheet animates closed
  const call = useLastWhileOpen(open, !!open);

  // The lead from the server, loaded when the sheet opens (null while loading)
  const [loaded, setLoaded] = useState<{ callId: string; rows: [string, string][] } | null>(null);
  const callId = call?.id;
  const leadId = call?.leadId;
  const callUuid = call?.uuid;
  useEffect(() => {
    // A call without a lead has nothing to load: "No details found" straight away
    if (!callId || !leadId) return;
    let gone = false;
    api.leads
      .details(leadId)
      .then((data) => !gone && setLoaded({ callId, rows: leadEntries(data, callUuid) }))
      // As the web: a lead that can't be loaded shows "No details found"
      .catch(() => !gone && setLoaded({ callId, rows: [] }));
    return () => {
      gone = true;
    };
  }, [callId, leadId, callUuid]);
  const loading = !!call?.leadId && loaded?.callId !== call.id;

  const rows: [string, string][] = call?.leadId && loaded?.callId === call.id ? loaded.rows : [];

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    tap('success');
    notify(`${what} copied`, 'success', undefined, { silent: true });
  };

  return (
    <Sheet
      open={!!open}
      onClose={onClose}
      title="Lead details"
      footer={
        rows.length > 0 ? (
          <Button
            label="Copy data"
            icon="content-copy"
            full
            variant="secondary"
            onPress={() => void copy(rows.map(([k, v]) => `${k}: ${v}`).join('\n'), 'Lead data')}
          />
        ) : undefined
      }
    >
      {loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 32 }}>
          <ActivityIndicator color={c.purple} />
        </View>
      ) : rows.length === 0 ? (
        <View style={{ alignItems: 'center', gap: 8, paddingVertical: 32 }}>
          <Icon name="description" size={32} color={c.ink3} />
          <T v="body" color={c.ink2}>
            No details found
          </T>
        </View>
      ) : (
      <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 12 }}>
        {rows.map(([k, v], i) => (
          <View key={k}>
            {i > 0 && <Divider />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14, paddingRight: 4, minHeight: 52 }}>
              <T v="caption" style={{ width: 96 }}>
                {k}
              </T>
              <T v="label" style={{ flex: 1 }} numberOfLines={2} selectable nums>
                {v}
              </T>
              <IconButton icon="content-copy" label={`Copy ${k}`} variant="plain" size={40} onPress={() => void copy(v, k)} />
            </View>
          </View>
        ))}
      </View>
      )}
    </Sheet>
  );
}
