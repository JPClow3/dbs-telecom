import type { DBSPlan } from '../../types';
import { apiFetch, getApiUrl, getAuthHeaders, isApiServiceError, responseError, unavailableError } from './transport';
import { MOCK_PLANS, isDemoMode } from './demoAdapter';

export async function getPlans(type?: 'URBANO' | 'WIFI6'): Promise<DBSPlan[]> {
  if (isDemoMode()) {
    const plans = type ? MOCK_PLANS.filter((p) => p.type === type) : MOCK_PLANS;
    return plans.map((plan) => ({ ...plan, dataState: 'DEMO' as const }));
  }

  try {
    const url = type ? `${getApiUrl()}/commercial/plans?type=${type}` : `${getApiUrl()}/commercial/plans`;
    const res = await apiFetch(url, { headers: getAuthHeaders() });
    if (res.ok) {
      const data = await res.json();
      const responseDataState = data.dataState === 'DEMO' ? 'DEMO' : 'LIVE';
      return data.plans.map((plan: DBSPlan) => ({
        ...plan,
        dataState: plan.dataState || responseDataState,
      }));
    }
    throw await responseError(res, 'Não foi possível carregar os planos.');
  } catch (e) {
    console.warn('Backend indisponível para planos:', e);
    if (!isDemoMode()) {
      throw isApiServiceError(e)
        ? e
        : unavailableError('Não foi possível carregar os planos do servidor.');
    }
  }

  return [];
}

