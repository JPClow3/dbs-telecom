import { Router, type Request, type Response } from 'express';
import { commercialService } from '../modules/commercial/commercial.service.js';
import { CONFIG } from '../config/env.js';

export function registerCommercialRoutes(apiRouter: Router): void {
/**
 * Catálogo de Planos DBS Telecom
 */
apiRouter.get('/commercial/plans', (req: Request, res: Response) => {
  const type = req.query.type as 'URBANO' | 'WIFI6' | undefined;
  const plans = commercialService.getAllPlans(type);
  const dataState = CONFIG.demoMode ? 'DEMO' : 'LIVE';
  return res.json({
    total: plans.length,
    dataState,
    plans: plans.map((plan) => ({ ...plan, dataState })),
  });
});
}

