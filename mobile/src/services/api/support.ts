import type { TicketRecord, TrafficConsumptionSummary, SpeedTestMetrics } from '../../types';
import { ApiServiceError, getApiUrl, getAuthHeaders, isApiServiceError, responseError, unavailableError } from './transport';
import { MOCK_TICKETS, isDemoMode } from './demoAdapter';

export async function getClientTickets(clientId: string): Promise<TicketRecord[]> {
  if (isDemoMode()) {
    return MOCK_TICKETS.map((ticket) => ({
      ...ticket,
      id: `demo-${ticket.id}`,
      id_cliente: clientId,
      protocolo: `[DEMO] ${ticket.protocolo}`,
    }));
  }

  try {
    const res = await fetch(`${getApiUrl()}/support/tickets/${clientId}`, {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      return data.tickets;
    }
    throw await responseError(res, 'Não foi possível carregar seus chamados.');
  } catch (e) {
    console.warn('Backend indisponível para chamados técnicos:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('Não foi possível carregar seus chamados. Nenhum protocolo foi inventado.');
  }
}

export async function getTrafficConsumption(clientId: string, days = 14): Promise<TrafficConsumptionSummary> {
  if (isDemoMode()) {
    throw new ApiServiceError(
      '[DEMO] Métricas de consumo não estão disponíveis na demonstração.',
      'HTTP',
      403
    );
  }

  try {
    const res = await fetch(`${getApiUrl()}/traffic/consumption/${clientId}?days=${days}`, {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      return await res.json();
    }
    throw await responseError(res, 'Não foi possível carregar o consumo de tráfego.');
  } catch (e) {
    console.warn('Backend indisponível para consumo de tráfego:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('Não foi possível carregar o consumo de tráfego. Nenhuma métrica foi inventada.');
  }
}

export async function runRealSpeedTest(onProgress?: (stage: string) => void): Promise<SpeedTestMetrics> {
  const pings: number[] = [];
  onProgress?.('Enviando pacotes de medição de latência...');

  // 1. Executa 4 medições reais de ping sequenciais
  for (let i = 0; i < 4; i++) {
    const start = performance.now();
    try {
      const res = await fetch(`${getApiUrl()}/system/ping?_t=${Date.now()}_${i}`, {
        method: 'GET',
        cache: 'no-store',
      });
      if (res.ok) {
        const elapsed = performance.now() - start;
        pings.push(elapsed);
      }
    } catch {
      // Packet loss is real measurement data; never replace it with a
      // plausible-looking latency value.
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  if (pings.length === 0) {
    throw unavailableError('Não foi possível medir a latência. Verifique sua conexão e tente novamente.');
  }

  // Calcula média e jitter
  const avgPing = pings.reduce((a, b) => a + b, 0) / pings.length;
  let jitterSum = 0;
  for (let i = 1; i < pings.length; i++) {
    jitterSum += Math.abs(pings[i] - pings[i - 1]);
  }
  const avgJitter = pings.length > 1 ? jitterSum / (pings.length - 1) : 0;

  onProgress?.('Medindo taxa de download e largura de banda...');

  // 2. Executa download real de payload para calcular throughput
  const downloadStart = performance.now();
  const downloadRes = await fetch(`${getApiUrl()}/system/speedtest-payload?size=1572864&_t=${Date.now()}`, {
    cache: 'no-store',
  });
  if (!downloadRes.ok) {
    throw await responseError(downloadRes, 'Não foi possível medir o download.');
  }
  const blob = await downloadRes.blob();
  if (blob.size <= 0) {
    throw new ApiServiceError('O servidor retornou uma medição de download vazia.', 'INVALID_RESPONSE');
  }
  const downloadElapsedSec = (performance.now() - downloadStart) / 1000;
  const downloadMbps = (blob.size * 8) / Math.max(downloadElapsedSec, 0.001) / 1_000_000;

  onProgress?.('Medindo taxa de upload e largura de banda...');
  const uploadPayload = new Uint8Array(256 * 1024);
  const uploadStart = performance.now();
  const uploadRes = await fetch(`${getApiUrl()}/system/speedtest-payload?_t=${Date.now()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: uploadPayload as unknown as BodyInit,
  });
  if (!uploadRes.ok) {
    throw await responseError(uploadRes, 'Não foi possível medir o upload.');
  }
  const uploadData = await uploadRes.json().catch(() => ({}));
  const uploadElapsedSec = (performance.now() - uploadStart) / 1000;
  const uploadMbps = Number.isFinite(Number(uploadData.throughputMbps)) && Number(uploadData.throughputMbps) > 0
    ? Number(uploadData.throughputMbps)
    : (uploadPayload.byteLength * 8) / Math.max(uploadElapsedSec, 0.001) / 1_000_000;

  onProgress?.('Finalizando relatório de qualidade do link...');
  const pingFinal = parseFloat(avgPing.toFixed(1));
  const jitterFinal = parseFloat(avgJitter.toFixed(1));
  const downloadFinal = parseFloat(downloadMbps.toFixed(1));
  const uploadFinal = parseFloat(uploadMbps.toFixed(1));

  return {
    pingMs: pingFinal,
    jitterMs: jitterFinal,
    downloadMbps: downloadFinal,
    uploadMbps: uploadFinal,
    packetLossPercent: parseFloat((((4 - pings.length) / 4) * 100).toFixed(1)),
    status: pings.length === 4 ? 'Medição concluída' : 'Medição concluída com perda de pacotes',
    timestamp: new Date().toISOString(),
  };
}

