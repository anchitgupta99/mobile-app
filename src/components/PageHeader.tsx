import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { IconButton, T } from './ui';

export function PageHeader({ title, right, close }: { title: string; right?: ReactNode; close?: boolean }) {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: c.topbar,
        paddingTop: insets.top + 8,
        paddingBottom: 12,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderBottomWidth: 1,
        borderBottomColor: scheme === 'dark' ? c.divider : 'transparent',
      }}
    >
      <IconButton
        icon={close ? 'close' : 'arrow-back'}
        label={close ? 'Close' : 'Back'}
        variant="topbar"
        size={40}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      <T v="h2" color={c.onTopbar} style={{ flex: 1 }} numberOfLines={1} accessibilityRole="header">
        {title}
      </T>
      {right}
    </View>
  );
}
