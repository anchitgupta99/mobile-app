import { View } from 'react-native';
import type { CallMode } from '@/domain/types';
import { font, useTheme } from '@/theme';
import { Icon, T } from './ui';

export function modeLabel(mode: CallMode | 'auto') {
  return mode === 'voip' ? 'Data call' : mode === 'bridge' ? 'Phone line' : 'Auto';
}

export function ModeBadge({ mode, onDark }: { mode: CallMode | 'auto'; onDark?: boolean }) {
  const { c } = useTheme();
  const fg = onDark ? c.onCallScreen : mode === 'bridge' ? c.warningFg : c.infoFg;
  const bg = onDark ? c.callControl : mode === 'bridge' ? c.warningBg : c.infoBg;
  return (
    <View
      accessibilityLabel={`Mode: ${modeLabel(mode)}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        height: 26,
        borderRadius: 13,
        backgroundColor: bg,
      }}
    >
      <Icon name={mode === 'voip' ? 'wifi-calling-3' : mode === 'bridge' ? 'sim-card' : 'auto-mode'} size={14} color={fg} />
      <T v="caption" color={fg} style={{ fontFamily: font.semibold }}>
        {modeLabel(mode)}
      </T>
    </View>
  );
}
