import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';
import { alertDialog } from '@/components/feedback';

/**
 * Asks before leaving a screen with unsaved input (back button, close, swipe back).
 * Call the returned `allow()` right before navigating away after a successful save.
 */
export function useConfirmDiscard(dirty: boolean, what = 'changes') {
  const navigation = useNavigation();
  const allowed = useRef(false);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirty || allowed.current) return;
      e.preventDefault();
      alertDialog({
        title: `Discard ${what}?`,
        message: "What you entered on this screen won't be saved.",
        tone: 'warning',
        icon: 'delete-outline',
        actions: [
          { label: 'Keep editing', variant: 'outline' },
          { label: 'Discard', variant: 'danger', onPress: () => navigation.dispatch(e.data.action) },
        ],
      });
    });
  }, [navigation, dirty, what]);

  return {
    allow: () => {
      allowed.current = true;
    },
  };
}
