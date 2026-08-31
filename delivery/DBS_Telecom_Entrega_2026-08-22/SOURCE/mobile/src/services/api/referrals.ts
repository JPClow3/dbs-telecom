import type { ReferralSummary, ReferredFriend } from '../../types';
import { apiFetch, getApiUrl, getAuthHeaders } from './transport';
import { isDemoMode } from './demoAdapter';
import { buildDemoReferralSummary } from './demoFixtures';

export async function getReferralSummary(clientId: string): Promise<ReferralSummary> {
  if (isDemoMode()) {
    return buildDemoReferralSummary(clientId);
  }
  const res = await apiFetch(`${getApiUrl()}/referrals/${clientId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao obter extrato de indicações');
  return res.json();
}

export async function addReferral(clientId: string, name: string, phone: string): Promise<ReferredFriend> {
  if (isDemoMode()) {
    return {
      id: `demo-friend-${Date.now()}`,
      name,
      phone,
      status: 'PENDING_INSTALL',
      statusLabel: 'Aguardando Instalação (prévia)',
      statusBadgeColor: '#D97706',
      discountPercentage: 50,
      createdAt: new Date().toISOString(),
    };
  }
  const res = await apiFetch(`${getApiUrl()}/referrals/${clientId}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      referredName: name,
      referredPhone: phone,
    }),
  });
  if (!res.ok) throw new Error('Erro ao cadastrar indicação');
  return res.json();
}
