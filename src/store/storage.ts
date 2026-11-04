import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** Plain device storage for the CRM cache, outbox and settings */
export const storage = createJSONStorage(() => AsyncStorage);

/**
 * Session storage: the keychain / keystore on iOS and Android (via expo-secure-store), AsyncStorage on web
 * where no secure equivalent exists. Values must stay small: some iOS releases reject keychain items
 * over ~2 KB, so the session store only persists the token, agent card and a few flags.
 */
function secureStateStorage(): StateStorage {
  if (Platform.OS === 'web') return AsyncStorage;
  return {
    getItem: async (key) => {
      try {
        const v = await SecureStore.getItemAsync(key);
        if (v != null) return v;
      } catch {
        return null;
      }
      // One-time move of a session persisted by an older build in plain AsyncStorage
      const old = await AsyncStorage.getItem(key);
      if (old == null) return null;
      try {
        await SecureStore.setItemAsync(key, old);
        await AsyncStorage.removeItem(key);
      } catch {
        // Leave the plain copy in place if the keychain rejects it; the next read tries again
      }
      return old;
    },
    setItem: async (key, value) => {
      await SecureStore.setItemAsync(key, value);
    },
    removeItem: async (key) => {
      await SecureStore.deleteItemAsync(key);
    },
  };
}

export const sessionStorage = createJSONStorage(secureStateStorage);
