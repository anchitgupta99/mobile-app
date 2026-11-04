import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme';
import { AnimatedSheet } from './motion/AnimatedSheet';
import { IconButton, T } from './ui';

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  scroll = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <AnimatedSheet
      open={open}
      onClose={onClose}
      sheetStyle={{
        backgroundColor: c.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingBottom: Math.max(insets.bottom, 16),
        maxHeight: '88%',
        width: '100%',
        maxWidth: 640,
        alignSelf: 'center',
      }}
      handle={
        <>
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: title ? 0 : 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: c.line }} />
          </View>
          {title && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: c.divider,
              }}
            >
              <T v="h2" accessibilityRole="header">
                {title}
              </T>
              <IconButton icon="close" label="Close" variant="plain" size={40} onPress={onClose} />
            </View>
          )}
        </>
      }
    >
      {scroll ? (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={{ padding: 20, gap: 12 }}>{children}</View>
      )}
      {footer && <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>{footer}</View>}
    </AnimatedSheet>
  );
}
