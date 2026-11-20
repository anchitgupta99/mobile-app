import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, SectionList, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { CallCard, campaignName, LeadSheet } from '@/components/CallCard';
import { notify } from '@/components/feedback';
import { FadeInItem } from '@/components/motion/FadeInItem';
import { RecordingPlayer } from '@/components/RecordingPlayer';
import { Sheet } from '@/components/Sheet';
import { Button, CountBadge, EmptyState, Field, Icon, IconButton, Pill, T, tap } from '@/components/ui';
import { formatDay, startOfDay } from '@/domain/format';
import type { CallRecord } from '@/domain/types';
import { useRefresh } from '@/hooks/useRefresh';
import { useDial, useDialAvailability } from '@/hooks/useDial';
import { ListPlaceholder } from '@/components/ListPlaceholder';
import { useCampaigns } from '@/store/campaigns';
import { useData } from '@/store/data';
import { font, useTheme } from '@/theme';
import { duration } from '@/theme/motion';

type CallType = 'all' | 'inbound' | 'outbound' | 'missed';
type Filters = { type: CallType; by: 'any' | 'customer' | 'agent'; minMins: number; campaign: string; disposition: string };
type DateSel = { kind: 'today' } | { kind: 'yesterday' } | { kind: 'range'; label: string; days: number | 'month' };

const none: Filters = { type: 'all', by: 'any', minMins: 0, campaign: 'all', disposition: 'all' };
const ranges: { label: string; days: number | 'month' }[] = [
  { label: 'This month', days: 'month' },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
];

const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function rangeStart(days: number | 'month') {
  const now = new Date();
  if (days === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return startOfDay(new Date(now.getTime() - (days - 1) * 86400000));
}

function dateLabel(d: DateSel) {
  if (d.kind === 'today') return 'Today';
  if (d.kind === 'yesterday') return 'Yesterday';
  return `${shortDate.format(rangeStart(d.days))} – ${shortDate.format(new Date())}`;
}

function inDate(c: CallRecord, d: DateSel) {
  const t = new Date(c.startedAt).getTime();
  const today = startOfDay(new Date()).getTime();
  if (d.kind === 'today') return t >= today;
  if (d.kind === 'yesterday') return t >= today - 86400000 && t < today;
  return t >= rangeStart(d.days).getTime();
}

function typeOf(c: CallRecord): CallType {
  return c.outcome === 'missed' ? 'missed' : c.direction;
}

const typeLabel: Record<CallType, string> = { all: 'All', inbound: 'Inbound', outbound: 'Outbound', missed: 'Missed' };

function activeChips(f: Filters): { key: keyof Filters; label: string }[] {
  const out: { key: keyof Filters; label: string }[] = [];
  if (f.type !== 'all') out.push({ key: 'type', label: typeLabel[f.type] });
  if (f.by !== 'any') out.push({ key: 'by', label: `Disconnected by ${f.by === 'agent' ? 'Agent' : 'Customer'}` });
  if (f.minMins > 0) out.push({ key: 'minMins', label: `Over ${f.minMins} min` });
  if (f.campaign !== 'all') out.push({ key: 'campaign', label: campaignName(f.campaign) });
  if (f.disposition !== 'all') out.push({ key: 'disposition', label: f.disposition });
  return out;
}

function Choice<V extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <T v="label">{label}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => (
          <Pill key={String(o.value)} label={o.label} active={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

function MoreFilters({
  open,
  value,
  onClose,
  onApply,
}: {
  open: boolean;
  value: Filters;
  onClose: () => void;
  onApply: (f: Filters) => void;
}) {
  const { c } = useTheme();
  const dispositions = useData((s) => s.dispositions.dispositions);
  const myCampaigns = useCampaigns((s) => s.list);
  const calls = useData((s) => s.calls);
  // The agent's campaigns, plus any other campaign their history shows (inbound, an earlier assignment)
  const campaignOptions = useMemo(() => {
    const names = new Map(myCampaigns.map((x) => [x.id, x.name]));
    calls.forEach((x) => {
      if (x.campaignId && !names.has(x.campaignId)) names.set(x.campaignId, x.campaignName ?? x.campaignId);
    });
    return [...names].map(([id, name]) => ({ value: id, label: name }));
  }, [myCampaigns, calls]);
  const [draft, setDraft] = useState(value);
  const [opened, setOpened] = useState(open);
  // Start each opening from the applied filters (adjusting state during render, not in an effect)
  if (open !== opened) {
    setOpened(open);
    if (open) setDraft(value);
  }
  const set = (p: Partial<Filters>) => setDraft((d) => ({ ...d, ...p }));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="More filters"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Clear" variant="outline" style={{ flex: 1 }} onPress={() => setDraft(none)} />
          <Button label="Apply filters" style={{ flex: 1.6 }} onPress={() => onApply(draft)} />
        </View>
      }
    >
      <View style={{ gap: 20 }}>
        <Choice<CallType>
          label="Call type"
          value={draft.type}
          onChange={(type) => set({ type })}
          options={(['all', 'inbound', 'outbound', 'missed'] as CallType[]).map((v) => ({ value: v, label: typeLabel[v] }))}
        />
        <Choice<Filters['by']>
          label="Disconnected by"
          value={draft.by}
          onChange={(by) => set({ by })}
          options={[
            { value: 'any', label: 'Any' },
            { value: 'customer', label: 'Customer' },
            { value: 'agent', label: 'Agent' },
          ]}
        />
        <View style={{ gap: 8 }}>
          <T v="label">Duration</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pill label="Any" active={draft.minMins === 0} onPress={() => set({ minMins: 0 })} />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                borderWidth: 1,
                borderColor: draft.minMins ? c.purple : c.line,
                borderRadius: 10,
                paddingHorizontal: 4,
              }}
            >
              <IconButton
                icon="remove"
                label="Fewer minutes"
                variant="plain"
                size={36}
                onPress={() => set({ minMins: Math.max(0, draft.minMins - 1) })}
              />
              <T v="label" nums style={{ minWidth: 72, textAlign: 'center' }}>
                {draft.minMins ? `> ${draft.minMins} mins` : '+ N mins'}
              </T>
              <IconButton
                icon="add"
                label="More minutes"
                variant="plain"
                size={36}
                onPress={() => set({ minMins: Math.min(60, draft.minMins + 1) })}
              />
            </View>
          </View>
        </View>
        <Choice<string>
          label="Campaign"
          value={draft.campaign}
          onChange={(campaign) => set({ campaign })}
          options={[{ value: 'all', label: 'All' }, ...campaignOptions]}
        />
        <Choice<string>
          label="Disposition"
          value={draft.disposition}
          onChange={(disposition) => set({ disposition })}
          options={[{ value: 'all', label: 'All' }, ...dispositions.map((d) => ({ value: d.label, label: d.label }))]}
        />
      </View>
    </Sheet>
  );
}

export default function Calls() {
  const { c } = useTheme();
  const calls = useData((s) => s.calls);
  const contacts = useData((s) => s.contacts);
  const { refreshing, onRefresh } = useRefresh();
  const dial = useDial();
  const dialBlock = useDialAvailability('history');
  const [q, setQ] = useState('');
  const [date, setDate] = useState<DateSel>({ kind: 'range', label: 'This month', days: 'month' });
  const [filters, setFilters] = useState<Filters>(none);
  const [moreOpen, setMoreOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [lead, setLead] = useState<CallRecord | null>(null);
  const [playing, setPlaying] = useState<CallRecord | null>(null);
  const chips = activeChips(filters);

  const sections = useMemo(() => {
    // As the web's history search: the typed text, any case, in the customer's name, the number as shown on the
    // row (masked when the campaign masks it) or the disposition
    const term = q.trim().toLowerCase();
    const matches = (x: CallRecord) => {
      const name = (contacts.find((ct) => ct.id === x.contactId)?.name || x.customerName || '').toLowerCase();
      const phone = x.displayNumber ?? x.number;
      const dispo = (x.disposition ?? '').toLowerCase();
      return name.includes(term) || phone.includes(term) || dispo.includes(term);
    };
    const groups = new Map<string, CallRecord[]>();
    calls
      .filter((x) => inDate(x, date))
      .filter((x) => !term || matches(x))
      .filter((x) => filters.type === 'all' || typeOf(x) === filters.type)
      .filter((x) => filters.by === 'any' || (x.disconnectedBy ?? 'customer') === filters.by)
      .filter((x) => !filters.minMins || x.durationSec > filters.minMins * 60)
      .filter((x) => filters.campaign === 'all' || x.campaignId === filters.campaign)
      .filter((x) => filters.disposition === 'all' || (x.disposition ?? '').startsWith(filters.disposition))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .forEach((x) => {
        const k = formatDay(x.startedAt);
        groups.set(k, [...(groups.get(k) ?? []), x]);
      });
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [calls, contacts, q, date, filters]);

  const count = sections.reduce((t, s) => t + s.data.length, 0);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: 16, gap: 10 }}>
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Field
              label="Search leads"
              hideLabel
              icon="search"
              placeholder="Search leads..."
              value={q}
              onChangeText={setQ}
              autoCorrect={false}
              returnKeyType="search"
              right={q ? <IconButton icon="close" label="Clear search" variant="plain" size={36} onPress={() => setQ('')} /> : undefined}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`More filters${chips.length ? `, ${chips.length} active` : ''}`}
            onPress={() => {
              tap();
              setMoreOpen(true);
            }}
            style={({ pressed }) => ({
              width: 52,
              height: 52,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: chips.length ? c.purple : c.line,
              backgroundColor: pressed ? c.pressed : chips.length ? c.selected : c.surface,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Icon name="tune" color={chips.length ? c.purple : c.ink2} />
            {chips.length > 0 && (
              <View style={{ position: 'absolute', top: -6, right: -6 }}>
                <CountBadge n={chips.length} />
              </View>
            )}
          </Pressable>
        </View>
        {/* The padding keeps the Pills' hitSlop inside the ScrollView (Android drops touches outside a parent); the
            negative margin keeps the visual spacing unchanged */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginVertical: -6 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 6 }}
        >
          <Pill label="Today" active={date.kind === 'today'} onPress={() => setDate({ kind: 'today' })} />
          <Pill label="Yesterday" active={date.kind === 'yesterday'} onPress={() => setDate({ kind: 'yesterday' })} />
          <Pill
            label={date.kind === 'range' ? dateLabel(date) : 'Date range'}
            icon="date-range"
            active={date.kind === 'range'}
            onPress={() => setRangeOpen(true)}
          />
        </ScrollView>
        {chips.length > 0 && (
          <Animated.View entering={FadeIn.duration(duration.base)} layout={LinearTransition.duration(duration.base)}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              // 40 tall + hitSlop 4 = 48dp targets; the padding keeps that slop inside the ScrollView
              style={{ marginVertical: -4 }}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 4, alignItems: 'center' }}
            >
              {chips.map((ch) => (
                <Pressable
                  key={ch.key}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove filter ${ch.label}`}
                  onPress={() => {
                    tap();
                    setFilters((f) => ({ ...f, [ch.key]: none[ch.key] }));
                  }}
                  hitSlop={4}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    height: 40,
                    paddingLeft: 14,
                    paddingRight: 10,
                    borderRadius: 20,
                    backgroundColor: pressed ? c.lavenderSoft : c.selected,
                    borderWidth: 1,
                    borderColor: c.purple,
                  })}
                >
                  <T v="label" color={c.accentInk}>
                    {ch.label}
                  </T>
                  <Icon name="close" size={16} color={c.accentInk} />
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  tap();
                  setFilters(none);
                }}
                hitSlop={4}
                style={({ pressed }) => ({
                  paddingHorizontal: 10,
                  height: 40,
                  borderRadius: 8,
                  justifyContent: 'center',
                  backgroundColor: pressed ? c.pressed : 'transparent',
                })}
              >
                <T v="label" color={c.purple}>
                  Clear all
                </T>
              </Pressable>
            </ScrollView>
          </Animated.View>
        )}
        <T v="caption" color={c.ink3} style={{ paddingHorizontal: 20, fontFamily: font.regular }} nums>
          {count} {count === 1 ? 'call' : 'calls'} · completed calls are read-only
        </T>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(x) => x.id}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.violet} />}
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: c.page, paddingHorizontal: 4, paddingTop: 12, paddingBottom: 8 }}>
            <T v="overline">{section.title}</T>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <FadeInItem>
            <CallCard
              call={item}
              callDimmed={!!dialBlock}
              onCallBack={() => void dial({ number: item.number, contactId: item.contactId, source: 'history' })}
              onLead={() => setLead(item)}
              onPlay={() => (item.hasRecording ? setPlaying(item) : notify('No recording for this call', 'neutral'))}
            />
          </FadeInItem>
        )}
        ListEmptyComponent={
          <ListPlaceholder
            empty={
              <EmptyState
                icon="history"
                title={chips.length || q ? 'No calls match' : 'No calls yet'}
                body={chips.length || q ? 'Try clearing a filter or the search.' : 'Calls you make or take will appear here.'}
                action={chips.length || q ? 'Clear all' : undefined}
                onAction={() => {
                  setFilters(none);
                  setQ('');
                }}
              />
            }
          />
        }
      />

      <MoreFilters
        open={moreOpen}
        value={filters}
        onClose={() => setMoreOpen(false)}
        onApply={(f) => {
          setFilters(f);
          setMoreOpen(false);
        }}
      />

      <Sheet open={rangeOpen} onClose={() => setRangeOpen(false)} title="Date range" scroll={false}>
        {ranges.map((r) => {
          const on = date.kind === 'range' && date.label === r.label;
          return (
            <Pressable
              key={r.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                tap();
                setDate({ kind: 'range', ...r });
                setRangeOpen(false);
              }}
              style={{
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: on ? c.purple : c.line,
                backgroundColor: on ? c.selected : c.surface,
              }}
            >
              <View style={{ flex: 1 }}>
                <T v="bodyStrong">{r.label}</T>
                <T v="caption" nums>
                  {dateLabel({ kind: 'range', ...r })}
                </T>
              </View>
              {on && <Icon name="check" color={c.purple} />}
            </Pressable>
          );
        })}
      </Sheet>

      <LeadSheet call={lead} onClose={() => setLead(null)} />

      <Sheet open={!!playing} onClose={() => setPlaying(null)} title="Recording" scroll={false}>
        {playing && <RecordingPlayer call={playing} />}
      </Sheet>
    </View>
  );
}
