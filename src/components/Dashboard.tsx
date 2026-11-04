import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import type { Analytics, CustomRange, DateRange } from '@/domain/analytics';
import { useAgentAnalytics } from '@/hooks/useAgentAnalytics';
import { helpText } from '@/domain/helpText';
import { useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { InfoTip } from './InfoTip';
import { Sheet } from './Sheet';
import { Button, Card, Icon, Pill, SectionHeader, T, tap, type IconName } from './ui';

/** Categorical slots, validated for adjacent pairs and CVD on both surfaces. Light-mode slots 3–4 sit
 * under 3:1 contrast, so every chart below carries visible value labels. */
function useSeries() {
  const { scheme } = useTheme();
  return scheme === 'dark' ? ['#3987e5', '#d95926', '#199e70', '#c98500'] : ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
}

const GAP = 2;

export function hms(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export function hm(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

function Tile({
  icon,
  label,
  value,
  hint,
  live,
  tip,
}: {
  icon: IconName;
  label: string;
  value: string;
  hint?: string;
  live?: boolean;
  tip?: { title: string; text: string };
}) {
  const { c } = useTheme();
  return (
    <Card style={{ flexBasis: '47%', flexGrow: 1, gap: 8, padding: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={16} color={c.ink2} />
        <T v="caption" style={{ flexShrink: 1 }} numberOfLines={1}>
          {label}
        </T>
        {tip && <InfoTip {...tip} size={14} />}
        <View style={{ flex: 1 }} />
        {live && (
          <View accessible accessibilityLabel="Live" style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.signalOk }} />
        )}
      </View>
      <T v="title" nums numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      {hint && (
        <T v="caption" color={c.ink3} numberOfLines={1}>
          {hint}
        </T>
      )}
    </Card>
  );
}

function Legend({ items }: { items: { label: string; value: string; color: string }[] }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: i.color }} />
          <T v="caption" color={c.ink2}>
            {i.label}
          </T>
          <T v="label" nums>
            {i.value}
          </T>
        </View>
      ))}
    </View>
  );
}

/** Horizontal part-to-whole bar: rounded ends, 2px surface gap between segments. */
function StackBar({ parts, height = 12 }: { parts: { value: number; color: string; label: string }[]; height?: number }) {
  const { c } = useTheme();
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  const shown = parts.filter((p) => p.value > 0);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={parts.map((p) => `${p.label} ${Math.round((p.value / total) * 100)}%`).join(', ')}
      style={{ flexDirection: 'row', height, gap: GAP, borderRadius: 4, overflow: 'hidden', backgroundColor: c.surface }}
    >
      {shown.map((p, i) => (
        <View
          key={p.label}
          style={{
            flex: p.value,
            backgroundColor: p.color,
            borderTopLeftRadius: i === 0 ? 4 : 0,
            borderBottomLeftRadius: i === 0 ? 4 : 0,
            borderTopRightRadius: i === shown.length - 1 ? 4 : 0,
            borderBottomRightRadius: i === shown.length - 1 ? 4 : 0,
          }}
        />
      ))}
    </View>
  );
}

function CallsRow({
  icon,
  label,
  total,
  ok,
  okLabel,
  bad,
  badLabel,
}: {
  icon: IconName;
  label: string;
  total: number;
  ok: number;
  okLabel: string;
  bad: number;
  badLabel: string;
}) {
  const { c } = useTheme();
  const s = useSeries();
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={18} color={c.ink2} />
        <T v="bodyStrong" style={{ flex: 1 }}>
          {label}
        </T>
        <T v="h3" nums>
          {total}
        </T>
      </View>
      <StackBar
        height={8}
        parts={[
          { label: okLabel, value: ok, color: s[0] },
          { label: badLabel, value: bad, color: s[1] },
        ]}
      />
      <Legend
        items={[
          { label: okLabel, value: String(ok), color: s[0] },
          { label: badLabel, value: String(bad), color: s[1] },
        ]}
      />
    </View>
  );
}

function Collapsible({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Animated.View layout={LinearTransition.duration(duration.base)}>
      <Card padded={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${title}, ${summary}`}
          onPress={() => {
            tap();
            setOpen((o) => !o);
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 16,
            minHeight: 56,
            backgroundColor: pressed ? c.subtle : 'transparent',
          })}
        >
          <T v="bodyStrong" style={{ flex: 1 }}>
            {title}
          </T>
          <T v="label" color={c.ink2} nums>
            {summary}
          </T>
          <Icon name={open ? 'expand-less' : 'expand-more'} color={c.ink3} />
        </Pressable>
        {open && (
          <Animated.View
            entering={FadeIn.duration(duration.base)}
            exiting={FadeOut.duration(duration.fast)}
            style={{ padding: 16, paddingTop: 4, gap: 12 }}
          >
            {children}
          </Animated.View>
        )}
      </Card>
    </Animated.View>
  );
}

function BreakBars({ a }: { a: Analytics }) {
  const { c } = useTheme();
  const s = useSeries();
  const rows = a.breaks.map((b) => ({ label: b.label, v: b.seconds }));
  const max = Math.max(...rows.map((r) => r.v), 1);
  if (!rows.length) return <T v="caption">No breaks in this period.</T>;
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => (
        <View key={r.label} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="caption" color={c.ink2}>
              {r.label}
            </T>
            <T v="label" nums>
              {hm(r.v)}
            </T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.mutedFill }}>
            <View style={{ width: `${(r.v / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: s[0] }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Stacked columns per hour. Tap a column to read its values. */
function HourlyChart({ a }: { a: Analytics }) {
  const { c } = useTheme();
  const s = useSeries();
  const [sel, setSel] = useState<number | null>(null);
  const keys = [
    { k: 'outbound', label: 'Outbound', color: s[0] },
    { k: 'inbound', label: 'Inbound', color: s[1] },
    { k: 'busy', label: 'Busy', color: s[2] },
    { k: 'abandoned', label: 'Abandoned', color: s[3] },
  ] as const;
  const totals = a.hours.map((_, i) => keys.reduce((t, x) => t + a.hourly[x.k][i], 0));
  const max = Math.max(...totals, 1);
  const H = 132;
  const i = sel ?? totals.indexOf(Math.max(...totals));

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, minHeight: 20 }}>
        <T v="label" nums>
          {a.hours[i]}:00
        </T>
        <T v="caption" color={c.ink2} nums numberOfLines={1} style={{ flex: 1 }}>
          {keys.map((x) => `${x.label} ${a.hourly[x.k][i]}`).join(' · ')}
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: H, gap: 4 }}>
        {a.hours.map((h, idx) => (
          <Pressable
            key={h}
            accessibilityRole="button"
            accessibilityLabel={`${h}:00, ${totals[idx]} calls`}
            onPress={() => {
              tap();
              setSel(idx);
            }}
            style={{ flex: 1, height: H, justifyContent: 'flex-end', opacity: sel === null || sel === idx ? 1 : 0.45 }}
          >
            <View style={{ height: (totals[idx] / max) * (H - 4), gap: GAP, flexDirection: 'column-reverse' }}>
              {keys.map((x, ki) =>
                a.hourly[x.k][idx] > 0 ? (
                  <View
                    key={x.k}
                    style={{
                      flex: a.hourly[x.k][idx],
                      backgroundColor: x.color,
                      borderTopLeftRadius: keys.slice(ki + 1).every((y) => !a.hourly[y.k][idx]) ? 4 : 0,
                      borderTopRightRadius: keys.slice(ki + 1).every((y) => !a.hourly[y.k][idx]) ? 4 : 0,
                    }}
                  />
                ) : null,
              )}
            </View>
          </Pressable>
        ))}
      </View>
      <View style={{ height: 1, backgroundColor: c.divider, marginTop: -6 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {a.hours.map((h, idx) => (
          <T key={h} v="caption" color={c.ink3} nums style={{ flex: 1, textAlign: 'center', fontSize: 10, opacity: idx % 3 === 0 ? 1 : 0 }}>
            {h}
          </T>
        ))}
      </View>
      <Legend items={keys.map((x) => ({ label: x.label, value: String(a.hourly[x.k].reduce((t, v) => t + v, 0)), color: x.color }))} />
    </View>
  );
}

function AhtChart({ a }: { a: Analytics }) {
  const { c } = useTheme();
  const s = useSeries();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const H = 120;
  const all = [...a.aht.inbound, ...a.aht.outbound];
  const lo = Math.min(...all) - 30;
  const hi = Math.max(...all) + 30;
  const n = a.hours.length;
  const x = (i: number) => 6 + (i / (n - 1)) * (w - 12);
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo)) * (H - 12);
  const pts = (arr: number[]) => arr.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const i = sel ?? n - 1;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <T v="label" nums>
          {a.hours[i]}:00
        </T>
        <T v="caption" color={c.ink2} nums>
          Inbound {hms(a.aht.inbound[i])} · Outbound {hms(a.aht.outbound[i])}
        </T>
      </View>
      <View style={{ height: H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={H}>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} x1={0} x2={w} y1={H * f} y2={H * f} stroke={c.divider} strokeWidth={1} />
            ))}
            <Line x1={x(i)} x2={x(i)} y1={0} y2={H} stroke={c.line} strokeWidth={1} />
            <Polyline points={pts(a.aht.inbound)} fill="none" stroke={s[0]} strokeWidth={2} strokeLinejoin="round" />
            <Polyline points={pts(a.aht.outbound)} fill="none" stroke={s[1]} strokeWidth={2} strokeLinejoin="round" />
            <Circle cx={x(i)} cy={y(a.aht.inbound[i])} r={4.5} fill={s[0]} stroke={c.surface} strokeWidth={2} />
            <Circle cx={x(i)} cy={y(a.aht.outbound[i])} r={4.5} fill={s[1]} stroke={c.surface} strokeWidth={2} />
          </Svg>
        )}
        <View style={{ ...StyleAbs, flexDirection: 'row' }}>
          {a.hours.map((h, idx) => (
            <Pressable
              key={h}
              accessibilityRole="button"
              accessibilityLabel={`${h}:00, inbound ${hms(a.aht.inbound[idx])}, outbound ${hms(a.aht.outbound[idx])}`}
              onPress={() => setSel(idx)}
              style={{ flex: 1 }}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="caption" color={c.ink3} nums>
          {a.hours[0]}:00
        </T>
        <T v="caption" color={c.ink3} nums>
          {a.hours[n - 1]}:00
        </T>
      </View>
      <Legend
        items={[
          { label: 'Inbound avg', value: hms(avg(a.aht.inbound)), color: s[0] },
          { label: 'Outbound avg', value: hms(avg(a.aht.outbound)), color: s[1] },
        ]}
      />
    </View>
  );
}

const avg = (arr: number[]) => arr.reduce((t, v) => t + v, 0) / (arr.length || 1);

const StyleAbs = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

/** Built per render so "This month" is right after midnight, not frozen at app start. */
const customRangesNow = (): CustomRange[] => [
  { label: 'Last 7 days', days: 7 },
  { label: 'This month', days: new Date().getDate() },
  { label: 'Last 30 days', days: 30 },
];

function rangeLabel(days: number) {
  const end = new Date();
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  const f = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  return `${f.format(start)} – ${f.format(end)}`;
}

export function Dashboard({ queue }: { queue: number }) {
  const { c } = useTheme();
  const s = useSeries();
  const [range, setRange] = useState<DateRange>('today');
  const customRanges = customRangesNow();
  const [custom, setCustom] = useState<CustomRange>(customRanges[0]);
  const [pickOpen, setPickOpen] = useState(false);
  const { data: a, error, reload } = useAgentAnalytics(range, custom);
  const total = a ? a.inbound.total + a.outbound.total : 0;

  const ranges = (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <Pill label="Today" active={range === 'today'} onPress={() => setRange('today')} />
      <Pill label="Yesterday" active={range === 'yesterday'} onPress={() => setRange('yesterday')} />
      <Pill
        label={range === 'custom' ? rangeLabel(custom.days) : 'Custom date'}
        icon="date-range"
        active={range === 'custom'}
        onPress={() => setPickOpen(true)}
      />
    </View>
  );

  if (!a) {
    return (
      <View style={{ gap: 16 }}>
        {ranges}
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {error ? (
            <>
              <Icon name="error-outline" size={20} color={c.errorFg} />
              <T v="caption" color={c.errorFg} style={{ flex: 1 }}>
                {error}
              </T>
              <Button label="Try again" icon="refresh" variant="outline" size="sm" onPress={reload} />
            </>
          ) : (
            <>
              <ActivityIndicator color={c.purple} />
              <T v="caption">Loading your stats…</T>
            </>
          )}
        </Card>
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {ranges}

      <View>
        <SectionHeader title="At a glance" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Tile icon="groups" label="In queue" value={String(queue)} hint="Waiting now" live tip={helpText.inQueue} />
          <Tile
            icon="call"
            label="Total calls"
            value={String(total)}
            hint={`${a.inbound.total} in · ${a.outbound.total} out`}
            tip={helpText.totalCalls}
          />
          <Tile
            icon="record-voice-over"
            label="Talk time"
            value={hm(a.callTime.talk)}
            hint={`Login ${hm(a.shift.login)}`}
            tip={helpText.talkTime}
          />
          <Tile icon="timer" label="AHT" value={hms(a.aht.overall)} hint="Avg handling time" tip={helpText.aht} />
        </View>
      </View>

      <View>
        <SectionHeader title="Shift summary" />
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T v="caption">Total login duration</T>
              <InfoTip {...helpText.shiftSummary} size={14} />
            </View>
            <T v="h3" nums>
              {hms(a.shift.login)}
            </T>
          </View>
          <StackBar
            parts={[
              { label: 'Call', value: a.shift.call, color: s[0] },
              { label: 'Break', value: a.shift.brk, color: s[1] },
              { label: 'Idle', value: a.shift.idle, color: s[2] },
            ]}
          />
          <Legend
            items={[
              { label: 'Call', value: hm(a.shift.call), color: s[0] },
              { label: 'Break', value: hm(a.shift.brk), color: s[1] },
              { label: 'Idle', value: hm(a.shift.idle), color: s[2] },
            ]}
          />
        </Card>
      </View>

      <View>
        <SectionHeader title="Calls" count={total} />
        <Card style={{ gap: 18 }}>
          <CallsRow
            icon="call-received"
            label="Inbound"
            total={a.inbound.total}
            ok={a.inbound.answered}
            okLabel="Answered"
            bad={a.inbound.abandoned}
            badLabel="Abandoned"
          />
          <View style={{ height: 1, backgroundColor: c.divider }} />
          <CallsRow
            icon="call-made"
            label="Outbound"
            total={a.outbound.total}
            ok={a.outbound.answered}
            okLabel="Answered"
            bad={a.outbound.missed}
            badLabel="Customer missed"
          />
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <SectionHeader title="See more" />
        <Collapsible title="Call time" summary={hms(a.shift.call)}>
          <StackBar
            parts={[
              { label: 'Ringing', value: a.callTime.ringing, color: s[0] },
              { label: 'Talk', value: a.callTime.talk, color: s[1] },
              { label: 'Hold', value: a.callTime.hold, color: s[2] },
              { label: 'Wrap', value: a.callTime.wrap, color: s[3] },
            ]}
          />
          <Legend
            items={[
              { label: 'Ringing', value: hm(a.callTime.ringing), color: s[0] },
              { label: 'Talk', value: hm(a.callTime.talk), color: s[1] },
              { label: 'Hold', value: hm(a.callTime.hold), color: s[2] },
              { label: 'Wrap', value: hm(a.callTime.wrap), color: s[3] },
            ]}
          />
        </Collapsible>
        <Collapsible title="Break time" summary={hm(a.shift.brk)}>
          <BreakBars a={a} />
        </Collapsible>
        {/* Per-hour figures only exist in the demo: the server (and the web, whose chart is hardcoded) has none */}
        {a.hours.length > 0 && (
          <>
            <Collapsible title="Hourly call trend" summary={`${a.hours[0]}:00–${a.hours[a.hours.length - 1]}:00`}>
              <HourlyChart a={a} />
            </Collapsible>
            <Collapsible title="Average handling time" summary={hms(a.aht.overall)}>
              <AhtChart a={a} />
            </Collapsible>
          </>
        )}
      </View>

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title="Custom date" scroll={false}>
        {customRanges.map((r) => {
          const on = range === 'custom' && custom.label === r.label;
          return (
            <Pressable
              key={r.label}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                tap();
                setCustom(r);
                setRange('custom');
                setPickOpen(false);
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
                  {rangeLabel(r.days)}
                </T>
              </View>
              {on && <Icon name="check" color={c.purple} />}
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}
