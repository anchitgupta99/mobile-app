import * as Haptics from 'expo-haptics';
import type { HapticKind } from './events';

const rank: Record<HapticKind, number> = { selection: 0, light: 1, medium: 2, warning: 3, success: 3, error: 4 };
let lastAt = 0;
let lastRank = -1;

function run(kind: HapticKind): Promise<void> {
  switch (kind) {
    case 'selection':
      return Haptics.selectionAsync();
    case 'light':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    case 'medium':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    case 'success':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    case 'warning':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

/**
 * Fire-and-forget. A button's light tap followed in the same tick by a stronger
 * event (e.g. success) plays both; an equal or weaker haptic within 60 ms is dropped.
 */
export function playHaptic(kind: HapticKind) {
  const now = Date.now();
  const dt = now - lastAt;
  if (dt >= 0 && dt < 60 && rank[kind] <= lastRank) return;
  lastAt = now;
  lastRank = rank[kind];
  try {
    void run(kind).catch(() => undefined);
  } catch {
    // Haptics unavailable on this device
  }
}
