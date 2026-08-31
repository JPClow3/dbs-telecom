import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { AuthSession, Customer } from '../types';
import { normalizeAuthSession, parseAuthSession } from './sessionPolicy';

const AUTH_SESSION_KEY = 'dbs_telecom.auth_session.v2';
const LEGACY_AUTH_CUSTOMER_KEY = '@dbs_telecom:auth_customer';
const THEME_MODE_KEY = '@dbs_telecom:theme_mode';
const BIOMETRICS_ENABLED_KEY = '@dbs_telecom:biometrics_enabled';

export type ThemeMode = 'system' | 'light' | 'dark';

async function readSessionValue(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(AUTH_SESSION_KEY);
  }

  if (!(await SecureStore.isAvailableAsync())) {
    return null;
  }

  return SecureStore.getItemAsync(AUTH_SESSION_KEY);
}

async function writeSessionValue(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Web has no Expo SecureStore implementation. Keep the web session scoped
    // to browser storage and never accept an identity without its token.
    await AsyncStorage.setItem(AUTH_SESSION_KEY, value);
    return;
  }

  if (!(await SecureStore.isAvailableAsync())) {
    throw new Error('Armazenamento seguro indisponível neste dispositivo.');
  }

  await SecureStore.setItemAsync(AUTH_SESSION_KEY, value, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

async function removeSessionValue(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(AUTH_SESSION_KEY);
    return;
  }

  if (await SecureStore.isAvailableAsync()) {
    await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
  }
}

export const storageService = {
  /** Persists customer data and the authentication proof together. */
  async saveAuthSession(session: AuthSession): Promise<void> {
    try {
      const normalized = normalizeAuthSession(session);
      if (!normalized) {
        throw new Error('Sessão inválida: token e cliente autenticado são obrigatórios.');
      }
      await writeSessionValue(JSON.stringify(normalized));
    } catch (e) {
      console.warn('Erro ao salvar sessão autenticada:', e);
      throw e;
    }
  },

  /** Recovers a session only when customer and a non-expired token exist. */
  async getAuthSession(): Promise<AuthSession | null> {
    try {
      const session = parseAuthSession(await readSessionValue());
      if (!session) {
        await removeSessionValue();
      }
      return session;
    } catch (e) {
      console.warn('Erro ao ler sessão segura:', e);
      return null;
    }
  },

  /** Removes the current session and any legacy identity-only record. */
  async clearAuthSession(): Promise<void> {
    try {
      await removeSessionValue();
      await AsyncStorage.removeItem(LEGACY_AUTH_CUSTOMER_KEY);
    } catch (e) {
      console.warn('Erro ao limpar sessão autenticada:', e);
      throw e;
    }
  },

  /**
   * Backward-compatible helper. It reads only from a complete token-backed
   * session and cannot authenticate an identity on its own.
   */
  async getAuthCustomer(): Promise<Customer | null> {
    return (await this.getAuthSession())?.customer || null;
  },

  /** @deprecated Use clearAuthSession so the token is cleared as well. */
  async clearAuthCustomer(): Promise<void> {
    await this.clearAuthSession();
  },

  /** Saves the non-sensitive biometric preference. */
  async saveThemeMode(mode: ThemeMode): Promise<void> {
    try {
      await AsyncStorage.setItem(THEME_MODE_KEY, mode);
    } catch (e) {
      console.warn('Erro ao salvar preferência de tema:', e);
    }
  },

  async getThemeMode(): Promise<ThemeMode | null> {
    try {
      const mode = await AsyncStorage.getItem(THEME_MODE_KEY);
      if (mode === 'light' || mode === 'dark' || mode === 'system') {
        return mode;
      }
      return null;
    } catch (e) {
      console.warn('Erro ao ler preferência de tema:', e);
      return null;
    }
  },

  async saveBiometricsEnabled(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(BIOMETRICS_ENABLED_KEY, JSON.stringify(enabled));
    } catch (e) {
      console.warn('Erro ao salvar flag de biometria:', e);
    }
  },

  async isBiometricsEnabled(): Promise<boolean> {
    try {
      const item = await AsyncStorage.getItem(BIOMETRICS_ENABLED_KEY);
      return item ? JSON.parse(item) === true : false;
    } catch (e) {
      return false;
    }
  },

  /**
   * Kept for source compatibility. Identity-only biometric records are no
   * longer persisted; biometric re-auth uses the secure token-backed session.
   */
  async saveBiometricCustomer(customer: Customer): Promise<void> {
    void customer;
  },

  async getBiometricCustomer(): Promise<Customer | null> {
    return (await this.getAuthSession())?.customer || null;
  },

  async clearBiometricCustomer(): Promise<void> {
    // No identity-only biometric record is written anymore.
  },
};
