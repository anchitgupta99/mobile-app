import { MaterialIcons } from '@expo/vector-icons';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { playHaptic } from '@/feedback/haptics';
import { useSettings } from '@/store/settings';
import { font, minTap, radius, tone as toneOf, useTheme, type Tone } from '@/theme';
import { PressableScale } from './motion/PressableScale';

export type IconName = ComponentProps<typeof MaterialIcons>['name'];

export function Icon({
  name,
  size = 22,
  color,
  style,
  accessibilityLabel,
}: {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  return (
    <MaterialIcons
      name={name}
      size={size}
      color={color ?? c.ink}
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!accessibilityLabel}
      importantForAccessibility={accessibilityLabel ? 'yes' : 'no-hide-descendants'}
    />
  );
}

export function tap(kind: 'light' | 'medium' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web' || !useSettings.getState().haptics) return;
  playHaptic(kind);
}

type Variant = 'display' | 'title' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'label' | 'caption' | 'overline';

const variants: Record<Variant, TextStyle> = {
  display: { fontFamily: font.bold, fontSize: 34, lineHeight: 40, letterSpacing: -0.5 },
  title: { fontFamily: font.bold, fontSize: 24, lineHeight: 30, letterSpacing: -0.2 },
  h2: { fontFamily: font.bold, fontSize: 18, lineHeight: 24 },
  h3: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 15, lineHeight: 21 },
  label: { fontFamily: font.semibold, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: font.regular, fontSize: 12, lineHeight: 16 },
  overline: { fontFamily: font.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase' },
};

export function T({ v = 'body', color, nums, style, ...rest }: TextProps & { v?: Variant; color?: string; nums?: boolean }) {
  const { c } = useTheme();
  const base = v === 'caption' || v === 'overline' ? c.ink2 : v === 'title' || v === 'display' ? c.inkStrong : c.ink;
  return (
    <Text
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[variants[v], { color: color ?? base }, nums && { fontVariant: ['tabular-nums'] }, style]}
    />
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'call';

export function Button({
  label,
  icon,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  onPress,
  style,
  full,
  accessibilityLabel,
}: {
  label: string;
  icon?: IconName;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const map: Record<ButtonVariant, { bg: string; fg: string; border?: string; pressed: string }> = {
    primary: { bg: c.primary, fg: c.onPrimary, pressed: c.primaryPressed },
    secondary: { bg: c.lavender, fg: c.onLavender, pressed: c.lavenderSoft },
    outline: { bg: c.surface, fg: c.ink, border: c.line, pressed: c.subtle },
    ghost: { bg: 'transparent', fg: c.purple, pressed: c.pressed },
    danger: { bg: c.danger, fg: c.onDanger, pressed: c.danger },
    call: { bg: c.call, fg: c.onCall, pressed: c.call },
  };
  const s = map[variant];
  const h = size === 'lg' ? 56 : size === 'sm' ? 40 : minTap;
  const off = disabled || loading;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={!!off}
      scaleTo={0.98}
      onPress={() => {
        tap();
        onPress?.();
      }}
      hitSlop={size === 'sm' ? 4 : 0}
      style={[
        {
          height: h,
          minHeight: h,
          paddingHorizontal: size === 'sm' ? 14 : 20,
          borderRadius: size === 'lg' ? 14 : radius.xs + 2,
          backgroundColor: s.bg,
          borderWidth: s.border ? 1 : 0,
          borderColor: s.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: off && !loading ? 0.45 : 1,
          alignSelf: full ? 'stretch' : 'auto',
        },
        style,
      ]}
      pressedStyle={{ backgroundColor: s.pressed }}
    >
      {loading ? (
        <ActivityIndicator color={s.fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={size === 'sm' ? 18 : 20} color={s.fg} />}
          <T v={size === 'lg' ? 'h3' : 'bodyStrong'} color={s.fg} numberOfLines={1}>
            {label}
          </T>
        </>
      )}
    </PressableScale>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  variant = 'outline',
  size = minTap,
  color,
  badge,
  hint,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  variant?: 'outline' | 'plain' | 'filled' | 'topbar';
  size?: number;
  color?: string;
  badge?: number;
  /** Screen reader hint describing what the button does or shows */
  hint?: string;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  const bg = variant === 'filled' ? c.purple : variant === 'outline' ? c.surface : variant === 'topbar' ? c.topbarControl : 'transparent';
  const fg = color ?? (variant === 'filled' ? c.onPurple : variant === 'topbar' ? c.onTopbar : c.ink2);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={Math.max(0, (minTap - size) / 2)}
      scaleTo={0.92}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        backgroundColor: bg,
        borderWidth: variant === 'outline' ? 1 : 0,
        borderColor: c.divider,
      }}
      pressedStyle={{ backgroundColor: c.pressed }}
    >
      <Icon name={icon} size={Math.round(size * 0.46)} color={fg} />
      {!!badge && (
        <View style={{ position: 'absolute', top: 2, right: 2 }}>
          <CountBadge n={badge} />
        </View>
      )}
    </PressableScale>
  );
}

export function CountBadge({ n }: { n: number }) {
  const { c } = useTheme();
  if (n <= 0) return null;
  return (
    <View
      style={{
        minWidth: 18,
        height: 18,
        paddingHorizontal: 5,
        borderRadius: 9,
        backgroundColor: c.alert,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <T v="caption" color={c.onAlert} style={{ fontFamily: font.bold, fontSize: 11, lineHeight: 14 }} nums>
        {n > 99 ? '99+' : n}
      </T>
    </View>
  );
}

export function StatusChip({ label, tone = 'neutral', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { c } = useTheme();
  const t = toneOf(c, tone);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        backgroundColor: t.bg,
        borderColor: t.line,
        alignSelf: 'flex-start',
      }}
    >
      {icon && <Icon name={icon} size={13} color={t.fg} />}
      <T v="caption" color={t.fg} style={{ fontFamily: font.semibold }}>
        {label}
      </T>
    </View>
  );
}

export function Pill({
  label,
  active,
  onPress,
  count,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  count?: number;
  icon?: IconName;
}) {
  const { c } = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={{
        height: 36,
        paddingHorizontal: 14,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: active ? c.invert : c.mutedFill,
        borderWidth: active ? 0 : 1,
        borderColor: c.divider,
      }}
      pressedStyle={active ? undefined : { backgroundColor: c.pressed }}
    >
      {icon && <Icon name={icon} size={16} color={active ? c.onInvert : c.inkStrong} />}
      <T v="label" color={active ? c.onInvert : c.inkStrong}>
        {label}
      </T>
      {!!count && <CountBadge n={count} />}
    </PressableScale>
  );
}

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const { c } = useTheme();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: c.line,
    padding: padded ? 16 : 0,
    overflow: 'hidden',
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [base, pressed && { backgroundColor: c.subtle }, style]}
    >
      {children}
    </Pressable>
  );
}

export function Avatar({ name, size = 44, tone }: { name: string; size?: number; tone?: 'brand' | 'invert' }) {
  const { c } = useTheme();
  const parts = name.trim().split(/\s+/);
  const ini = /^[+\d•\s]/.test(name) ? '#' : ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: tone === 'invert' ? c.callControl : c.lavenderSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {ini === '#' ? (
        <Icon name="person" size={size * 0.5} color={tone === 'invert' ? c.onCallScreen : c.purple} />
      ) : (
        <T
          v="bodyStrong"
          color={tone === 'invert' ? c.onCallScreen : c.navy}
          style={{ fontSize: size * 0.36, lineHeight: size * 0.44, fontFamily: font.bold }}
        >
          {ini}
        </T>
      )}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.divider, marginLeft: inset }} />;
}

export function SectionHeader({
  title,
  action,
  onAction,
  count,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  count?: number;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginBottom: 8,
        marginTop: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T v="overline" color={c.ink2} accessibilityRole="header">
          {title}
        </T>
        {count !== undefined && (
          <T v="caption" color={c.ink3} nums>
            {count}
          </T>
        )}
      </View>
      {action && (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={12} style={{ minHeight: 32, justifyContent: 'center' }}>
          <T v="label" color={c.purple}>
            {action}
          </T>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  onAction,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32, gap: 8 }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: c.lavenderSoft,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 8,
        }}
      >
        <Icon name={icon} size={30} color={c.purple} />
      </View>
      <T v="h3" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {body && (
        <T v="body" color={c.ink2} style={{ textAlign: 'center' }}>
          {body}
        </T>
      )}
      {action && <Button label={action} variant="secondary" onPress={onAction} style={{ marginTop: 12 }} />}
    </View>
  );
}

export const Field = forwardRef<
  TextInput,
  TextInputProps & { label: string; error?: string | null; icon?: IconName; right?: ReactNode; hideLabel?: boolean }
>(function Field({ label, error, icon, right, hideLabel, style, ...rest }, ref) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {!hideLabel && (
        <T v="label" color={error ? c.errorFg : c.ink2} style={{ fontFamily: font.medium, paddingHorizontal: 4 }}>
          {label}
        </T>
      )}
      <View
        style={{
          minHeight: 52,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: error ? c.errorFg : c.line,
          backgroundColor: c.surface,
          flexDirection: 'row',
          alignItems: rest.multiline ? 'flex-start' : 'center',
          paddingHorizontal: 14,
          gap: 10,
        }}
      >
        {icon && <Icon name={icon} size={20} color={c.ink2} style={rest.multiline ? { marginTop: 14 } : undefined} />}
        <TextInput
          ref={ref}
          placeholderTextColor={c.inkPlaceholder}
          accessibilityLabel={label}
          {...rest}
          style={[
            {
              flex: 1,
              fontFamily: font.regular,
              fontSize: 16,
              color: c.ink,
              paddingVertical: 14,
              minHeight: rest.multiline ? 96 : undefined,
              textAlignVertical: rest.multiline ? 'top' : 'center',
            },
            Platform.OS === 'web' && ({ outlineStyle: 'none' } as object),
            style,
          ]}
        />
        {right}
      </View>
      {!!error && (
        <T v="caption" color={c.errorFg}>
          {error}
        </T>
      )}
    </View>
  );
});

export function Segmented<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: { value: V; label: string; icon?: IconName }[];
  onChange: (v: V) => void;
}) {
  const { c } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', backgroundColor: c.mutedFill, borderRadius: 10, padding: 3, borderWidth: 1, borderColor: c.divider }}
      accessibilityRole="radiogroup"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              minHeight: 42,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: 6,
              backgroundColor: on ? c.surface : 'transparent',
              borderWidth: on ? 1 : 0,
              borderColor: c.line,
            }}
          >
            {o.icon && <Icon name={o.icon} size={16} color={on ? c.accentInk : c.ink2} />}
            <T v="label" color={on ? c.inkStrong : c.ink2}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  onLongPress,
  accessibilityLabel,
  minHeight = 64,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel?: string;
  minHeight?: number;
} & Pick<PressableProps, 'onLongPress'>) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, paddingRight: right ? 12 : 0 }}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel}
        disabled={!onPress && !onLongPress}
        onPress={onPress}
        onLongPress={onLongPress}
        style={({ pressed }) => ({
          flex: 1,
          minHeight,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingLeft: 16,
          paddingRight: right ? 4 : 16,
          paddingVertical: 10,
          backgroundColor: pressed ? c.subtle : c.surface,
        })}
      >
        {left}
        <View style={{ flex: 1, gap: 2 }}>
          {typeof title === 'string' ? (
            <T v="bodyStrong" numberOfLines={1}>
              {title}
            </T>
          ) : (
            title
          )}
          {typeof subtitle === 'string' ? (
            <T v="caption" numberOfLines={1}>
              {subtitle}
            </T>
          ) : (
            subtitle
          )}
        </View>
      </Pressable>
      {right}
    </View>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => {
        tap();
        onChange(!value);
      }}
      hitSlop={10}
      style={{
        width: 50,
        height: 30,
        borderRadius: 15,
        padding: 3,
        backgroundColor: value ? c.purple : c.mutedFill,
        borderWidth: 1,
        borderColor: value ? c.purple : c.line,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: value ? c.onPurple : c.surface,
          alignSelf: value ? 'flex-end' : 'flex-start',
          shadowColor: c.shadow,
          shadowOpacity: 0.8,
          shadowRadius: 2,
          shadowOffset: { width: 0, height: 1 },
          elevation: 1,
        }}
      />
    </Pressable>
  );
}
