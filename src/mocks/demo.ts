import { USE_BACKEND } from '@/api/http';

/**
 * Whether the app runs against the in-memory mock backend with simulated checks: prototype copy and fake
 * device names only show when this is true. Set EXPO_PUBLIC_DEMO=false to preview the production surface
 * in a dev build.
 */
export const IS_DEMO: boolean =
  // Never against the real backend: simulated checks and events would mix into a real session
  !USE_BACKEND && (process.env.EXPO_PUBLIC_DEMO === undefined ? __DEV__ : process.env.EXPO_PUBLIC_DEMO === 'true');
