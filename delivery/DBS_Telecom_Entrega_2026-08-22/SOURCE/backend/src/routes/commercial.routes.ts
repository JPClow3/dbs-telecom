import { Router, type Request, type Response } from 'express';
import { commercialService } from '../modules/commercial/commercial.service.js';

export function registerCommercialRoutes(apiRouter: Router): void {
/**
 * Catálogo de Planos DBS Telecom
 */
apiRouter.get('/commercial/plans', (req: Request, res: Response) => {
  const type = req.query.type as 'URBANO' | 'WIFI6' | undefined;
  const plans = commercialService.getAllPlans(type);
  return res.json({ total: plans.length, plans });
});
}

