import { Platform } from 'react-native';
import { usePreventScreenCapture } from 'expo-screen-capture';

const noop = (_key?: string) => {};

export const useSecureScreen: (key?: string) => void = Platform.OS === 'web' ? noop : usePreventScreenCapture;
