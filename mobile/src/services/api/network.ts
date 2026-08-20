import type { WifiSettings, UpdateWifiSettingsDto, WifiGuestQrPayload, OpticalDiagnosticResult } from '../../types';
import { getApiUrl, getAuthHeaders } from './transport';

export async function getWifiSettings(clientId: string): Promise<WifiSettings> {
  const res = await fetch(`${getApiUrl()}/wifi/settings/${clientId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao consultar Wi-Fi');
  return res.json();
}

export async function updateWifiSettings(clientId: string, dto: UpdateWifiSettingsDto): Promise<WifiSettings> {
  const res = await fetch(`${getApiUrl()}/wifi/settings/${clientId}`, {
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
  const res = await fetch(`${getApiUrl()}/wifi/qr/${clientId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao obter QR Code');
  return res.json();
}

export async function restartWifi(clientId: string): Promise<{ success: boolean; message: string; estimatedRecoverySeconds: number }> {
  const res = await fetch(`${getApiUrl()}/wifi/restart/${clientId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao reiniciar Wi-Fi');
  return res.json();
}

export async function getOpticalDiagnostics(clientId: string, simulatedRx?: number): Promise<OpticalDiagnosticResult> {
  const url = simulatedRx !== undefined
    ? `${getApiUrl()}/optical/diagnostics/${clientId}?rx=${simulatedRx}`
    : `${getApiUrl()}/optical/diagnostics/${clientId}`;
  const res = await fetch(url, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao aferir sinal óptico');
  return res.json();
}

