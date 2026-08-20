import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Utilitário seguro para Feedback Tátil (Haptics)
 * Emite vibrações táteis sutis no iOS e Android, com fallback silencioso para Web.
 */
export const hapticFeedback = {
  /**
   * Vibração tátil sutil e leve (ex: chips rápidos, seleção de opções, toggles)
   */
  light: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Silencioso em caso de hardware não suportado
    }
  },

  /**
   * Vibração tátil média (ex: envio de mensagens, botão de login, ações primárias)
   */
  medium: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {
      // Silencioso
    }
  },

  /**
   * Vibração de impacto firme (ex: ações críticas ou de destaque)
   */
  heavy: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch {
      // Silencioso
    }
  },

  /**
   * Vibração de seleção de tick (ex: troca de abas, navegação inferior, sliders)
   */
  selection: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.selectionAsync();
    } catch {
      // Silencioso
    }
  },

  /**
   * Vibração de sucesso (ex: cópia de código de barras, PIX, protocolo, conclusão de diagnósticos)
   */
  success: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Silencioso
    }
  },

  /**
   * Vibração de alerta ou aviso
   */
  warning: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // Silencioso
    }
  },

  /**
   * Vibração de erro
   */
  error: async () => {
    if (Platform.OS === 'web') return;
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } catch {
      // Silencioso
    }
  },
};
