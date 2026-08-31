import type { WifiSettings, UpdateWifiSettingsDto, WifiGuestQrPayload, OpticalDiagnosticResult } from '../../types';
import { apiFetch, getApiUrl, getAuthHeaders } from './transport';
import { isDemoMode } from './demoAdapter';
import {
  buildDemoWifiSettings,
  buildDemoOpticalDiagnostics,
} from './demoFixtures';

export async function getWifiSettings(clientId: string): Promise<WifiSettings> {
  if (isDemoMode()) {
    return buildDemoWifiSettings(clientId);
  }
  const res = await apiFetch(`${getApiUrl()}/wifi/settings/${clientId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao consultar Wi-Fi');
  return res.json();
}

export async function updateWifiSettings(clientId: string, dto: UpdateWifiSettingsDto): Promise<WifiSettings> {
  if (isDemoMode()) {
    // Nada é enviado ao roteador na demonstração; devolve o estado mesclado
    // apenas para a UI refletir a edição local de forma honesta.
    const current = await getWifiSettings(clientId);
    return { ...current, ...dto, updatedAt: new Date().toISOString() };
  }
  const res = await apiFetch(`${getApiUrl()}/wifi/settings/${clientId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(dto),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erro ao atualizar Wi-Fi');
  }
  return res.json();
}

export async function getWifiGuestQr(clientId: string): Promise<WifiGuestQrPayload> {
  if (isDemoMode()) {
    const settings = buildDemoWifiSettings(clientId);
    return {
      ssid: settings.guestSsid,
      password: settings.guestPassword,
      qrString: `WIFI:T:WPA;S:${settings.guestSsid};P:${settings.guestPassword};;`,
      security: settings.security,
    };
  }
  const res = await apiFetch(`${getApiUrl()}/wifi/qr/${clientId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao obter QR Code');
  return res.json();
}

export async function restartWifi(clientId: string): Promise<{ success: boolean; message: string; estimatedRecoverySeconds: number }> {
  if (isDemoMode()) {
    return {
      success: true,
      message: '[DEMO] Reinicialização simulada; nenhum comando foi enviado ao roteador.',
      estimatedRecoverySeconds: 60,
    };
  }
  // Reinicialização real do equipamento pode demorar; timeout estendido.
  const res = await apiFetch(`${getApiUrl()}/wifi/restart/${clientId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    timeoutMs: 45000,
  });
  if (!res.ok) throw new Error('Erro ao reiniciar Wi-Fi');
  return res.json();
}

export async function getOpticalDiagnostics(clientId: string, simulatedRx?: number): Promise<OpticalDiagnosticResult> {
  if (isDemoMode()) {
    const base = buildDemoOpticalDiagnostics(clientId);
    if (simulatedRx === undefined) {
      return base;
    }
    // Adapta a fixture ao cenário simulado escolhido na demonstração.
    const classification: OpticalDiagnosticResult['classification'] =
      simulatedRx >= -24 ? 'PERFECT' : simulatedRx >= -27.5 ? 'WARNING' : 'CRITICAL';
    const labels: Record<typeof classification, string> = {
      PERFECT: 'Sinal dentro da faixa ideal',
      WARNING: 'Atenuação moderada detectada',
      CRITICAL: 'Sinal crítico — ação necessária',
    };
    return {
      ...base,
      rxPowerDbm: simulatedRx,
      classification,
      statusLabel: labels[classification],
      ticketCreated: classification === 'CRITICAL',
      ticketProtocol: classification === 'CRITICAL' ? `DBS-DEMO-${Date.now().toString().slice(-6)}` : undefined,
    };
  }
  const url = simulatedRx !== undefined
    ? `${getApiUrl()}/optical/diagnostics/${clientId}?rx=${simulatedRx}`
    : `${getApiUrl()}/optical/diagnostics/${clientId}`;
  const res = await apiFetch(url, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao aferir sinal óptico');
  return res.json();
}
