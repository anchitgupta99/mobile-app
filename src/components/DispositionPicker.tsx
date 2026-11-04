import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { allPaths, pathLabel, type DispositionPath } from '@/domain/dispositions';
import type { Disposition } from '@/domain/types';
import { feedback } from '@/feedback';
import { font, tone as toneOf, useTheme } from '@/theme';
import { duration } from '@/theme/motion';
import { Sheet } from './Sheet';
import { Divider, Field, Icon, T } from './ui';

const levelLabels = ['Disposition', 'Sub-disposition', 'Sub-sub-disposition'];
const SEARCH_FROM = 8;

/** A dropdown that looks like a Field and opens a sheet of options */
function SelectField({
  label,
  value,
  placeholder,
  dot,
  error,
  onPress,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  dot?: string;
  error?: string | null;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T v="label" color={error ? c.errorFg : c.ink2} style={{ fontFamily: font.medium, paddingHorizontal: 4 }}>
        {label}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${value ?? 'not selected'}`}
        accessibilityHint="Opens the list of options"
        onPress={onPress}
        style={({ pressed }) => ({
          minHeight: 52,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: error ? c.errorFg : c.line,
          backgroundColor: pressed ? c.subtle : c.surface,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          gap: 10,
        })}
      >
        {value && dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
        <T v="body" numberOfLines={1} color={value ? c.ink : c.inkPlaceholder} style={{ flex: 1, fontSize: 16, lineHeight: 22 }}>
          {value ?? placeholder}
        </T>
        <Icon name="expand-more" size={22} color={c.ink2} />
      </Pressable>
      {!!error && (
        <T v="caption" color={c.errorFg}>
          {error}
        </T>
      )}
    </View>
  );
}

export function DispositionPicker({
  options,
  path,
  onChange,
  showErrors,
}: {
  options: Disposition[];
  path: DispositionPath;
  onChange: (path: DispositionPath) => void;
  showErrors?: boolean;
}) {
  const { c } = useTheme();
  // Which level's sheet is open; -1 when closed
  const [openLevel, setOpenLevel] = useState(-1);
  const [q, setQ] = useState('');
  const dotFor = (root?: Disposition) => toneOf(c, root?.tone ?? 'neutral').fg;

  // Level 0 lists every outcome; each chosen node with children adds a level below it
  const levels = useMemo<Disposition[][]>(
    () => [options, ...path.filter((d) => d.children?.length).map((d) => d.children!)],
    [options, path],
  );
  const sheetOptions = useMemo(() => (openLevel >= 0 ? (levels[openLevel] ?? []) : []), [levels, openLevel]);
  const prefix = openLevel > 0 ? path.slice(0, openLevel) : [];

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return sheetOptions.map((d) => [d]);
    // Search reaches nested options too, so a deep outcome can be picked in one go
    return allPaths(sheetOptions).filter((p) => p[p.length - 1].label.toLowerCase().includes(term));
  }, [sheetOptions, q]);

  const openSheet = (level: number) => {
    setQ('');
    setOpenLevel(level);
  };

  const pick = (rest: DispositionPath) => {
    feedback('select');
    onChange([...prefix, ...rest]);
    setOpenLevel(-1);
  };

  return (
    <View style={{ gap: 16 }}>
      {levels.map((opts, level) => {
        const chosen = path[level];
        const name = levelLabels[level] ?? `Level ${level + 1}`;
        return (
          <Animated.View
            key={level === 0 ? 'root' : `${level}:${path[level - 1]?.code}`}
            entering={level === 0 ? undefined : FadeIn.duration(duration.base)}
            exiting={FadeOut.duration(duration.fast)}
            layout={LinearTransition.duration(duration.base)}
          >
            <SelectField
              label={`${name} *`}
              value={chosen?.label ?? null}
              placeholder={level === 0 ? 'Select disposition' : `Select ${name.toLowerCase()}`}
              dot={dotFor(path[0])}
              error={showErrors && !chosen ? 'Required' : null}
              onPress={() => openSheet(level)}
            />
          </Animated.View>
        );
      })}

      <Sheet open={openLevel >= 0} onClose={() => setOpenLevel(-1)} title={openLevel > 0 ? path[openLevel - 1]?.label : 'Disposition'}>
        {sheetOptions.length > SEARCH_FROM || allPaths(sheetOptions).length > SEARCH_FROM ? (
          <Field label="Search" hideLabel icon="search" placeholder="Search" value={q} onChangeText={setQ} autoCorrect={false} />
        ) : null}
        <View style={{ borderRadius: 12, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
          {results.length === 0 && (
            <T v="body" color={c.ink2} style={{ padding: 16, textAlign: 'center' }}>
              Nothing matches “{q.trim()}”
            </T>
          )}
          {results.map((p, i) => {
            const leaf = p[p.length - 1];
            const on = p.every((d, j) => path[openLevel + j]?.code === d.code) && path.length === openLevel + p.length;
            const root = openLevel === 0 ? p[0] : path[0];
            return (
              <View key={p.map((d) => d.code).join('/')}>
                {i > 0 && <Divider />}
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={pathLabel(p)}
                  onPress={() => pick(p)}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    backgroundColor: pressed ? c.subtle : on ? c.selected : c.surface,
                  })}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotFor(root) }} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyStrong">{leaf.label}</T>
                    {p.length > 1 && <T v="caption">{pathLabel(p.slice(0, -1))}</T>}
                  </View>
                  {leaf.children?.length ? (
                    <T v="caption" color={c.ink3}>
                      {leaf.children.length} options
                    </T>
                  ) : null}
                  {on && <Icon name="check" size={18} color={c.purple} />}
                </Pressable>
              </View>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}
