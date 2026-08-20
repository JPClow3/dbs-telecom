import type { ReferralSummary, ReferredFriend } from '../../types';
import { getApiUrl, getAuthHeaders } from './transport';

export async function getReferralSummary(clientId: string): Promise<ReferralSummary> {
  const res = await fetch(`${getApiUrl()}/referrals/${clientId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Erro ao obter extrato de indicações');
  return res.json();
}

export async function addReferral(clientId: string, name: string, phone: string): Promise<ReferredFriend> {
  const res = await fetch(`${getApiUrl()}/referrals/${clientId}`, {
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

