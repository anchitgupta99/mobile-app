import { Platform } from 'react-native';

// Android apps are edge-to-edge, so the window no longer shrinks when the keyboard opens.
// Pad on both native platforms so focused fields stay above the keyboard.
export const keyboardBehavior = Platform.OS === 'web' ? undefined : ('padding' as const);
