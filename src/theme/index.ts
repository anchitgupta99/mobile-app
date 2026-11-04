import { useColorScheme } from 'react-native';
import { useSettings } from '@/store/settings';
import { dark, light, type Palette } from './tokens';

export * from './tokens';

export function useTheme(): { c: Palette; scheme: 'light' | 'dark' } {
  const system = useColorScheme();
  const pref = useSettings((s) => s.theme);
  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  return { c: scheme === 'dark' ? dark : light, scheme };
}
