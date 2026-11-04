/**
 * Whether the app runs against the in-memory mock backend with simulated checks and events.
 * Prototype copy, fake device names and the demo controls only show when this is true.
 * Set EXPO_PUBLIC_DEMO=false to preview the production surface in a dev build.
 */
export const IS_DEMO: boolean = process.env.EXPO_PUBLIC_DEMO === undefined ? __DEV__ : process.env.EXPO_PUBLIC_DEMO === 'true';
