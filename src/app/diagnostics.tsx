import { router } from 'expo-router';
import { View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { Preflight } from '@/components/Preflight';
import { useTheme } from '@/theme';

export default function Diagnostics() {
  const { c } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <PageHeader title="Diagnostics" />
      <Preflight mode="diagnostics" onDone={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </View>
  );
}
