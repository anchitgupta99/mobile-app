import { router } from 'expo-router';
import { View } from 'react-native';
import { useFirstLoad } from '@/hooks/useRefresh';
import { SkeletonRows } from './ListPlaceholder';
import { EmptyState, type IconName } from './ui';

/** Detail screen whose item is missing. While the first sync is still running it may just not be here yet. */
export function ItemNotFound({ icon, title, body }: { icon: IconName; title: string; body?: string }) {
  const { loading } = useFirstLoad();
  if (loading) return <SkeletonRows count={3} />;
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        icon={icon}
        title={title}
        body={body ?? 'It may have been removed, or the link is out of date.'}
        action="Go back"
        onAction={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </View>
  );
}
