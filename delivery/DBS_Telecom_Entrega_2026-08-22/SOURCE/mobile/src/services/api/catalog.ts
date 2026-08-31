import type { DBSPlan } from '../../types';
import { getApiUrl, isApiServiceError, responseError, unavailableError } from './transport';
import { MOCK_PLANS, isDemoMode } from './demoAdapter';

export async function getPlans(type?: 'URBANO' | 'WIFI6'): Promise<DBSPlan[]> {
  try {
    const url = type ? `${getApiUrl()}/commercial/plans?type=${type}` : `${getApiUrl()}/commercial/plans`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      return data.plans.map((plan: DBSPlan) => ({ ...plan, dataState: 'LIVE' as const }));
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

  // Visible only with EXPO_PUBLIC_DEMO_MODE=true in a development build.
  if (type) {
    return MOCK_PLANS.filter((p) => p.type === type).map((plan) => ({
      ...plan,
      dataState: 'DEMO' as const,
    }));
  }
  return MOCK_PLANS.map((plan) => ({ ...plan, dataState: 'DEMO' as const }));
}

