import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';
import { AuthSession, Customer } from '../types';
import { storageService } from './storage';

export interface BiometricCapability {
  available: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  biometryType: 'FACIAL_RECOGNITION' | 'FINGERPRINT' | 'IRIS' | 'BIOMETRICS' | 'NONE';
  label: string;
}

export const biometricsService = {
  async checkCapabilities(): Promise<BiometricCapability> {
    if (Platform.OS === 'web') {
      return {
        available: false,
        hasHardware: false,
        isEnrolled: false,
        biometryType: 'NONE',
        label: 'Biometria',
      };
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();

      let biometryType: BiometricCapability['biometryType'] = 'BIOMETRICS';
      let label = 'Biometria';

      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        biometryType = 'FACIAL_RECOGNITION';
        label = Platform.OS === 'ios' ? 'Face ID' : 'Reconhecimento Facial';
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        biometryType = 'FINGERPRINT';
        label = Platform.OS === 'ios' ? 'Touch ID' : 'Impressão Digital';
      }

      return {
        available: hasHardware && isEnrolled,
        hasHardware,
        isEnrolled,
        biometryType: hasHardware && isEnrolled ? biometryType : 'NONE',
        label,
      };
    } catch (e) {
      console.warn('[BiometricsService] Erro ao verificar capacidade biométrica:', e);
      return {
        available: false,
        hasHardware: false,
        isEnrolled: false,
        biometryType: 'NONE',
        label: 'Biometria',
      };
    }
  },

  async authenticate(
    promptMessage = 'Acesse sua conta DBS Telecom com segurança'
  ): Promise<{ success: boolean; error?: string }> {
    if (Platform.OS === 'web') {
      return { success: false, error: 'Biometria não suportada na plataforma Web.' };
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Digitar CPF',
        fallbackLabel: 'Usar Senha',
        disableDeviceFallback: false,
      });

      if (result.success) return { success: true };
      return { success: false, error: result.error || 'Autenticação cancelada ou não reconhecida.' };
    } catch (e: any) {
      console.warn('[BiometricsService] Erro ao autenticar com biometria:', e);
      return { success: false, error: e?.message || 'Falha na autenticação biométrica.' };
    }
  },

  /** Enables biometric re-auth; the customer identity is never stored separately. */
  async enableForCustomer(_customer?: Customer): Promise<void> {
    await storageService.saveBiometricsEnabled(true);
  },

  async disable(): Promise<void> {
    await storageService.saveBiometricsEnabled(false);
    await storageService.clearBiometricCustomer();
  },

  async isEnabled(): Promise<boolean> {
    return storageService.isBiometricsEnabled();
  },

  /**
   * Returns the complete session only after the preference is enabled. The
   * caller must still run biometric authentication before using it.
   */
  async getBiometricSession(): Promise<AuthSession | null> {
    if (!(await storageService.isBiometricsEnabled())) return null;
    return storageService.getAuthSession();
  },

  /** Display-only compatibility helper; it never creates a session. */
  async getBiometricCustomer() {
    return (await this.getBiometricSession())?.customer || null;
  },
};
