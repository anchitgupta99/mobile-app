import { SvgXml } from 'react-native-svg';
import { useTheme } from '@/theme';
import { logoXml } from './logoXml';

export function Logo({ height = 22, color }: { height?: number; color?: string }) {
  const { c } = useTheme();
  return <SvgXml xml={logoXml} width={(203 / 34) * height} height={height} color={color ?? c.onTopbar} accessibilityLabel="Claritel" />;
}
