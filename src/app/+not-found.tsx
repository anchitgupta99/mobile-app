import { router, Stack } from 'expo-router';
import { View } from 'react-native';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/ui';
import { useSession } from '@/store/session';
import { useTheme } from '@/theme';

/** Any link that doesn't match a screen: old notifications, mistyped deep links, removed pages. */
export default function NotFound() {
  const { c } = useTheme();
  const token = useSession((s) => s.token);
  // Go straight to where the agent belongs instead of landing on Home and letting the gate bounce
  const home = () => router.replace(token ? '/' : '/login');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ headerShown: false }} />
      <PageHeader title="Page not found" />
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <EmptyState
          icon="link-off"
          title="This page doesn't exist"
          body="The link may be old, or the item was removed."
          action="Go to Home"
          onAction={home}
        />
      </View>
    </View>
  );
}
