import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { campaignName, useDispositionLabel } from '@/components/CallCard';
import { ModeBadge } from '@/components/ModeBadge';
import { ItemNotFound } from '@/components/ItemNotFound';
import { PageHeader } from '@/components/PageHeader';
import { PhoneText } from '@/components/PhoneText';
import { RecordingPlayer } from '@/components/RecordingPlayer';
import { Avatar, Button, Card, Divider, Icon, SectionHeader, StatusChip, T, type IconName } from '@/components/ui';
import { formatDuration, formatWhen } from '@/domain/format';
import { useDial } from '@/hooks/useDial';
import { useSecureScreen } from '@/hooks/useSecureScreen';
import { useData } from '@/store/data';
import { useTheme } from '@/theme';

function Fact({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
      <Icon name={icon} size={20} color={c.ink2} />
      <T v="body" color={c.ink2} style={{ width: 110 }}>
        {label}
      </T>
      <T v="bodyStrong" style={{ flex: 1, textAlign: 'right' }}>
        {value}
      </T>
    </View>
  );
}

export default function CallDetail() {
  useSecureScreen('recording');
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const call = useData((s) => s.calls.find((x) => x.id === id));
  const contact = useData((s) => s.contacts.find((x) => x.id === call?.contactId));
  const dial = useDial();
  const dispositionLabel = useDispositionLabel();

  if (!call) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <PageHeader title="Call" />
        <ItemNotFound icon="call" title="Call not found" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <PageHeader title="Call details" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
        <Card
          onPress={contact ? () => router.push(`/contact/${contact.id}`) : undefined}
          style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}
        >
          <Avatar name={contact?.name ?? call.customerName ?? '#'} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3">{contact?.name ?? call.customerName ?? 'Unknown number'}</T>
            {contact && <T v="caption">{contact.company}</T>}
            <PhoneText number={call.number} v="caption" />
          </View>
          {contact && <Icon name="chevron-right" color={c.ink3} />}
        </Card>

        {call.hasRecording && (
          <View>
            <SectionHeader title="Recording" />
            <RecordingPlayer call={call} />
          </View>
        )}

        <View>
          <SectionHeader title="Details" />
          <Card style={{ paddingVertical: 6 }}>
            <Fact
              icon={call.direction === 'inbound' ? 'call-received' : 'call-made'}
              label="Direction"
              value={call.direction === 'inbound' ? 'Inbound' : 'Outbound'}
            />
            <Divider />
            <Fact icon="schedule" label="Started" value={formatWhen(call.startedAt)} />
            <Divider />
            <Fact icon="timer" label="Duration" value={call.durationSec ? formatDuration(call.durationSec) : '—'} />
            <Divider />
            <Fact icon="record-voice-over" label="Talk time" value={call.talkSec ? formatDuration(call.talkSec) : '—'} />
            <Divider />
            <Fact icon="campaign" label="Campaign" value={campaignName(call.campaignId, call.campaignName)} />
            <Divider />
            <Fact
              icon="call-end"
              label="Ended by"
              value={call.disconnectedBy === 'agent' ? 'Agent' : call.disconnectedBy === 'customer' ? 'Customer' : '—'}
            />
            <Divider />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
              <Icon name="settings-phone" size={20} color={c.ink2} />
              <T v="body" color={c.ink2} style={{ flex: 1 }}>
                Mode
              </T>
              <ModeBadge mode={call.mode} />
            </View>
            {call.fallbackUsed && (
              <>
                <Divider />
                <View style={{ paddingVertical: 10 }}>
                  <StatusChip tone="info" icon="sim-card" label="App did not ring; phone line fallback used" />
                </View>
              </>
            )}
            <Divider />
            <Fact
              icon="fact-check"
              label="Disposition"
              value={
                dispositionLabel(call.disposition) ??
                (call.outcome === 'missed' ? 'Missed' : call.outcome === 'answered' ? 'Not dispositioned' : '—')
              }
            />
          </Card>
        </View>

        {!!call.notes && (
          <View>
            <SectionHeader title="Notes" />
            <Card>
              <T v="body">{call.notes}</T>
            </Card>
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          <Icon name="lock-outline" size={16} color={c.ink3} />
          <T v="caption" color={c.ink3} style={{ flex: 1 }}>
            Completed calls are read-only. Disposition, notes and CRM fields can’t be changed after wrap-up.
          </T>
        </View>

        <Button
          label="Call back"
          icon="call"
          variant="call"
          full
          disabled={contact?.dnc}
          onPress={() => void dial({ number: call.number, contactId: call.contactId, source: 'history' })}
        />
      </ScrollView>
    </View>
  );
}
