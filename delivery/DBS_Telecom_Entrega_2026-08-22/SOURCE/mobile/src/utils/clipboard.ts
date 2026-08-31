import { Platform, Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';

export interface CopyResult {
  /** Texto realmente disponível na área de transferência (ou compartilhado). */
  copied: boolean;
  /** Como o texto foi entregue ao usuário. */
  method: 'clipboard' | 'share' | 'none';
}

/**
 * Copia texto para a área de transferência em todas as plataformas.
 *
 * No web usa a Clipboard API; no nativo usa o expo-clipboard. Se ambos
 * falharem, tenta o Share nativo como último recurso para que o usuário
 * nunca receba um falso "copiado!" sem ter o conteúdo em lugar nenhum.
 */
export async function copyToClipboard(text: string): Promise<CopyResult> {
  if (!text) return { copied: false, method: 'none' };

  try {
    await Clipboard.setStringAsync(text);
    return { copied: true, method: 'clipboard' };
  } catch (e) {
    console.warn('[clipboard] setStringAsync falhou:', e);
  }

  // Último recurso: compartilhar é preferível a mentir sobre a cópia.
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message: text });
      return { copied: true, method: 'share' };
    } catch (e) {
      console.warn('[clipboard] Share fallback falhou:', e);
    }
  }

  return { copied: false, method: 'none' };
}
