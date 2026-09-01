import { pdfService } from '../pdfService';
import type { FormattedInvoice, UnblockPromiseResult } from '../../types';
import { ApiServiceError, apiFetch, getApiUrl, getAuthHeaders, getAuthToken, isApiServiceError, responseError, unavailableError } from './transport';
import { MOCK_INVOICES, isDemoMode } from './demoAdapter';

export async function getInvoices(clientId: string): Promise<FormattedInvoice[]> {
  if (isDemoMode()) {
    return MOCK_INVOICES.map((invoice) => ({
      ...invoice,
      id: `demo-${invoice.id}`,
      documento: `DEMO-${invoice.documento}`,
      clienteId: clientId,
      linhaDigitavel: 'DEMO-LINHA-DIGITAVEL-NÃO-PAGAR',
      linhaDigitavelFormatada: 'DEMO • NÃO UTILIZAR',
      pixCopiaECola: 'DEMO-PIX-NÃO-PAGAR',
      obs: `[DEMO] ${invoice.obs || 'Fatura simulada'}`,
      simulated: true,
    }));
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/financial/invoices/${clientId}`, {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      return data.invoices;
    }
    throw await responseError(res, 'Não foi possível carregar suas faturas.');
  } catch (e) {
    console.warn('Backend indisponível para faturas:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('Não foi possível carregar suas faturas. Nenhum valor foi confirmado.');
  }
}

export async function requestUnblockPromise(clientId: string, contractId?: string): Promise<UnblockPromiseResult> {
  if (isDemoMode()) {
    return {
      success: false,
      message: '[DEMO] Solicitação simulada; nenhuma conexão foi desbloqueada.',
      protocolo: 'DEMO-NOT-SENT',
      unblockUntil: '',
      unblockHours: 0,
      contractId,
    };
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/financial/unblock-promise`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ clientId, contractId }),
    });

    if (res.ok) {
      return await res.json();
    }
    throw await responseError(res, 'Não foi possível solicitar o desbloqueio.');
  } catch (e) {
    console.warn('Backend indisponível para desbloqueio em confiança:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('Não foi possível confirmar o desbloqueio. Nenhuma alteração foi realizada.');
  }
}

export function getInvoicePdfUrl(invoiceId: string, clientId?: string): string {
  const cid = clientId || 'me';
  return `${getApiUrl()}/financial/invoices/${invoiceId}/pdf?clientId=${cid}`;
}

export async function downloadInvoicePdf(
  invoiceId: string,
  clientId?: string,
  invoiceData?: Partial<FormattedInvoice>,
  customerData?: { name?: string; doc?: string; address?: string }
): Promise<{ success: boolean; url?: string; message?: string }> {
  if (isDemoMode()) {
    throw new ApiServiceError(
      '[DEMO] O boleto é apenas ilustrativo e não pode ser baixado ou pago.',
      'HTTP',
      403
    );
  }

  if (!getAuthToken()) {
    throw new ApiServiceError(
      'Sua sessão expirou. Entre novamente para visualizar o boleto.',
      'UNAUTHORIZED',
      401
    );
  }

  const targetClientId = clientId || invoiceData?.clienteId || 'me';
  const remoteUrl = `${getApiUrl()}/financial/invoices/${invoiceId}/pdf?clientId=${targetClientId}&download=true`;
  try {
    // Preflight the real document before invoking the platform opener. This
    // prevents local PDF generation from looking like a successful payment
    // document when the ERP/API is unavailable.
    const check = await apiFetch(remoteUrl, { headers: getAuthHeaders() });
    if (!check.ok) throw await responseError(check, 'Boleto não disponível.');
  } catch (e) {
    throw isApiServiceError(e)
      ? e
      : unavailableError('Não foi possível obter o boleto do servidor. Nenhum documento foi gerado.');
  }

  const inv: Partial<FormattedInvoice> & { id: string } = {
    ...(invoiceData || {}),
    id: invoiceId,
    clienteId: targetClientId,
  };
  const result = await pdfService.downloadAndOpenInvoicePdf(
    inv,
    getApiUrl(),
    getAuthToken(),
    customerData
  );
  return { success: result.success, url: result.uri || getInvoicePdfUrl(invoiceId, targetClientId), message: result.message };
}

