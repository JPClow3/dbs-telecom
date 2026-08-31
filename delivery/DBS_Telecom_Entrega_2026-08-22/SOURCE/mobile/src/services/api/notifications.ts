import { Platform } from 'react-native';
import type { PushNotification, PixPaymentEvent, FormattedInvoice } from '../../types';
import { apiFetch, getApiUrl, getAuthHeaders, getAuthToken } from './transport';
import { isDemoMode } from './demoAdapter';
import { MOCK_NOTIFICATIONS } from './demoFixtures';

export async function getNotifications(clientId: string): Promise<PushNotification[]> {
  if (isDemoMode()) {
    return MOCK_NOTIFICATIONS.map((n) => ({ ...n, clientId }));
  }
  const res = await apiFetch(`${getApiUrl()}/notifications/${clientId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao obter notificações');
  return res.json();
}

export async function markNotificationAsRead(clientId: string, notificationId: string): Promise<boolean> {
  if (isDemoMode()) return true;
  const res = await apiFetch(`${getApiUrl()}/notifications/${clientId}/read/${notificationId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success;
}

export async function markAllNotificationsAsRead(clientId: string): Promise<boolean> {
  if (isDemoMode()) return true;
  const res = await apiFetch(`${getApiUrl()}/notifications/${clientId}/read-all`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.success;
}

/**
 * Confirmação instantânea de pagamento PIX.
 *
 * Web usa SSE nativo; no nativo o fallback é um polling real do extrato de
 * faturas comparando status — nunca um intervalo vazio que promete
 * atualização e não entrega nada.
 */
export function subscribeToPixPayment(
  clientId: string,
  onPaymentReceived: (event: PixPaymentEvent) => void,
): () => void {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && (window as any).EventSource && !isDemoMode()) {
    // O EventSource do navegador não permite definir o header Authorization.
    // O backend aceita o JWT via query param `?token=` apenas nesta rota de
    // leitura (tradeoff documentado lá: token em query string aparece em logs
    // de acesso — aceitável só para SSE). Sem token na sessão, não há como
    // abrir o stream autenticado; caímos para o polling com header abaixo.
    const authToken = getAuthToken();
    if (!authToken) {
      console.warn('[PixSSE] Sem token de sessão; usando polling autenticado no lugar do SSE.');
    } else {
      const url = `${getApiUrl()}/financial/pix/stream/${clientId}?token=${encodeURIComponent(authToken)}`;
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
  }

  if (isDemoMode()) {
    // Na demonstração local nenhum pagamento externo acontece; nada a observar.
    return () => undefined;
  }

  // Polling real (nativo/emissores sem SSE): compara o status das faturas
  // entre leituras e emite evento apenas para transições -> PAGO.
  let previousStatuses = new Map<string, string>();
  let busy = false;

  const poll = async () => {
    if (busy) return;
    busy = true;
    try {
      const res = await apiFetch(`${getApiUrl()}/financial/invoices/${clientId}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      const invoices: FormattedInvoice[] = Array.isArray(data?.invoices) ? data.invoices : [];

      const currentStatuses = new Map(invoices.map((inv) => [inv.id, inv.status]));
      for (const inv of invoices) {
        const before = previousStatuses.get(inv.id);
        // Só emite na transição (evita re-notificar a cada poll).
        if (inv.status === 'PAGO' && before !== undefined && before !== 'PAGO') {
          onPaymentReceived({
            event: 'PIX_CONFIRMED',
            invoiceId: inv.id,
            clientId,
            amount: inv.valor,
            paidAt: new Date().toISOString(),
            message: 'Fatura Paga com Sucesso!',
          });
        }
      }
      previousStatuses = currentStatuses;
    } catch {
      // Offline/erro transitório: mantém o último snapshot e tenta de novo.
    } finally {
      busy = false;
    }
  };

  // Primeira leitura estabelece a linha de base sem disparar eventos antigos.
  void poll();
  const interval = setInterval(() => void poll(), 8000);

  return () => clearInterval(interval);
}
