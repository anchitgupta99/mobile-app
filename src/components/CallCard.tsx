import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { formatDuration, formatWhen } from '@/domain/format';
import { findCampaign } from '@/store/campaigns';
import { findPath, pathLabel } from '@/domain/dispositions';
import type { CallRecord, Contact } from '@/domain/types';
import { useData } from '@/store/data';
import { useTheme } from '@/theme';
import { alertDialog, notify } from './feedback';
import { usePhoneDisplay } from './PhoneText';
import { Sheet } from './Sheet';
import { Button, Divider, Icon, IconButton, T, tap, type IconName } from './ui';

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

/** Who the call was with: the app's contact, else the name in the server's call history */
export function callName(call: CallRecord, contact: Contact | undefined) {
  return contact?.name ?? call.customerName ?? 'Unknown';
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
  onLead,
  onPlay,
}: {
  call: CallRecord;
  onCallBack: () => void;
  onLead: () => void;
  onPlay: () => void;
}) {
  const { c } = useTheme();
  const contact = useData((s) => s.contacts.find((x) => x.id === call.contactId));
  const phone = usePhoneDisplay();
  const d = dirIcon(call);
  const talk = call.talkSec ?? (call.outcome === 'answered' ? call.durationSec : 0);
  const total = Math.max(call.durationSec, talk);
  const label = useDispositionLabel();
  const disposition =
    label(call.disposition) ?? (call.outcome === 'missed' ? 'Missed' : call.outcome === 'answered' ? 'Not dispositioned' : 'No answer');

  return (
    <View style={{ backgroundColor: c.surface, borderRadius: 16, borderWidth: 1, borderColor: c.line, padding: 14, gap: 12 }}>
      {/* Only the header navigates, so the action buttons below aren't nested inside another button */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${callName(call, contact)}, ${d.label}, ${formatWhen(call.startedAt)}, ${disposition}. Open call details`}
        onPress={() => {
          tap();
          router.push(`/call-detail/${call.id}`);
        }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 })}
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
          <T v="bodyStrong" numberOfLines={1}>
            {callName(call, contact)}
            <T v="body" color={c.ink2}>
              {' '}
              · {phone(call.number)}
            </T>
          </T>
          <T v="caption" nums>
            {formatWhen(call.startedAt)}
          </T>
        </View>
        <Icon name="chevron-right" color={c.ink3} />
      </Pressable>

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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Disposition details"
              hitSlop={12}
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
            </Pressable>
          }
        />
      </View>

      <Divider />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T v="caption" color={c.ink3} style={{ flex: 1 }}>
          Read-only
        </T>
        <IconButton icon="call" label="Call back" size={40} color={c.call} onPress={onCallBack} />
        <IconButton icon="visibility" label="View lead details" size={40} onPress={onLead} />
        <IconButton icon="play-arrow" label={call.hasRecording ? 'Play recording' : 'No recording'} size={40} onPress={onPlay} />
      </View>
    </View>
  );
}

export function leadStatus(contact: Contact | undefined, hasOpenTask: boolean) {
  if (!contact) return 'NEW';
  if (contact.dnc) return 'DNC';
  return hasOpenTask ? 'CALLBACK' : 'IDLE';
}

/** Read-only lead details for a call; every value can be copied. */
export function LeadSheet({ call, onClose }: { call: CallRecord | null; onClose: () => void }) {
  const { c } = useTheme();
  const contact = useData((s) => s.contacts.find((x) => x.id === call?.contactId));
  const openTask = useData((s) => s.tasks.some((t) => !t.done && !!call?.contactId && t.contactId === call.contactId));
  const phone = usePhoneDisplay();

  const rows: [string, string][] = call
    ? [
        ['Id', contact?.id ?? call.leadId ?? '—'],
        ['Name', callName(call, contact)],
        ['Status', leadStatus(contact, openTask)],
        ['Phone number', phone(call.number)],
        ['Call UUID', call.uuid ?? call.id],
      ]
    : [];

  const copy = async (text: string, what: string) => {
    await Clipboard.setStringAsync(text);
    tap('success');
    notify(`${what} copied`, 'success', undefined, { silent: true });
  };

  return (
    <Sheet
      open={!!call}
      onClose={onClose}
      title="Lead details"
      footer={
        <Button
          label="Copy data"
          icon="content-copy"
          full
          variant="secondary"
          onPress={() => void copy(rows.map(([k, v]) => `${k}: ${v}`).join('\n'), 'Lead data')}
        />
      }
    >
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
    </Sheet>
  );
}
