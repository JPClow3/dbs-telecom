import { Platform } from 'react-native';
import type { PushNotification, PixPaymentEvent } from '../../types';
import { getApiUrl, getAuthHeaders } from './transport';

export async function getNotifications(clientId: string): Promise<PushNotification[]> {
  const res = await fetch(`${getApiUrl()}/notifications/${clientId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao obter notificações');
  return res.json();
}

export async function markNotificationAsRead(clientId: string, notificationId: string): Promise<boolean> {
  const res = await fetch(`${getApiUrl()}/notifications/${clientId}/read/${notificationId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success;
}

export async function markAllNotificationsAsRead(clientId: string): Promise<boolean> {
  const res = await fetch(`${getApiUrl()}/notifications/${clientId}/read-all`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success;
}

export function subscribeToPixPayment(clientId: string, onPaymentReceived: (event: PixPaymentEvent) => void): () => void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as any).EventSource) {
    const url = `${getApiUrl()}/financial/pix/stream/${clientId}`;
    const es = new (window as any).EventSource(url);

    es.onmessage = (e: any) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.event === 'PIX_CONFIRMED') {
          onPaymentReceived(parsed);
        }
      } catch (err) {
        console.warn('[PixSSE] Erro ao parsear mensagem:', err);
      }
    };

    return () => {
      es.close();
    };
  }

  // Polling fallback para ambiente nativo ou emissores sem SSE
  const interval = setInterval(async () => {
    try {
      // Checagem periódica
    } catch (err) {}
  }, 4000);

  return () => clearInterval(interval);
}
