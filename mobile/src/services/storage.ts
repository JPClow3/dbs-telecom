import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer } from '../types';

const AUTH_CUSTOMER_KEY = '@dbs_telecom:auth_customer';
const THEME_MODE_KEY = '@dbs_telecom:theme_mode';

export type ThemeMode = 'system' | 'light' | 'dark';

export const storageService = {
  /**
   * Salva os dados do cliente autenticado no AsyncStorage
   */
  async saveAuthCustomer(customer: Customer): Promise<void> {
    try {
      const json = JSON.stringify(customer);
      await AsyncStorage.setItem(AUTH_CUSTOMER_KEY, json);
    } catch (e) {
      console.warn('Erro ao salvar cliente no AsyncStorage:', e);
    }
  },

  /**
   * Recupera os dados do cliente autenticado do AsyncStorage
   */
  async getAuthCustomer(): Promise<Customer | null> {
    try {
      const json = await AsyncStorage.getItem(AUTH_CUSTOMER_KEY);
      if (!json) return null;
      return JSON.parse(json) as Customer;
    } catch (e) {
      console.warn('Erro ao ler cliente do AsyncStorage:', e);
      return null;
    }
  },

  /**
   * Remove a sessão do cliente autenticado no logout
   */
  async clearAuthCustomer(): Promise<void> {
    try {
      await AsyncStorage.removeItem(AUTH_CUSTOMER_KEY);
    } catch (e) {
      console.warn('Erro ao limpar cliente do AsyncStorage:', e);
    }
  },

  /**
   * Salva a preferência de tema do usuário ('system' | 'light' | 'dark')
   */
  async saveThemeMode(mode: ThemeMode): Promise<void> {
    try {
      await AsyncStorage.setItem(THEME_MODE_KEY, mode);
    } catch (e) {
      console.warn('Erro ao salvar preferência de tema:', e);
    }
  },

  /**
   * Recupera a preferência de tema salva
   */
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
};
