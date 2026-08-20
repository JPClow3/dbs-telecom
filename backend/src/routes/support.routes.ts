import { Router, type Request, type Response } from 'express';
import { supportService } from '../modules/support/support.service.js';
import { trafficService } from '../modules/traffic/traffic.service.js';
import { authMiddleware, enforceAntiIdor } from '../middlewares/auth.middleware.js';
import { sendApiError } from './route.helpers.js';

export function registerSupportRoutes(apiRouter: Router): void {
/**
 * Suporte e Diagnóstico Guiado (Anti-IDOR)
 */
apiRouter.post('/support/diagnostic', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId, userResponse, action } = req.body;
  const targetClientId = clientId || req.user?.clientId;

  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId obrigatório.' });
  }

  if (action === 'start') {
    const result = await supportService.startDiagnostic(targetClientId);
    return res.json(result);
  }

  try {
    const result = await supportService.processDiagnosticStep(targetClientId, userResponse || '');
    return res.json(result);
  } catch (error: any) {
    return sendApiError(res, 'O diagnóstico não pôde ser concluído porque o ERP está indisponível.', error);
  }
});

/**
 * Central de Acompanhamento de Chamados e Ordens de Serviço (O.S.) (Anti-IDOR)
 */
apiRouter.get('/support/tickets/:clientId', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  try {
    const tickets = await supportService.getClientTickets(targetClientId);
    return res.json({ total: tickets.length, tickets });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao consultar chamados técnicos.', error);
  }
});

/**
 * Extrato de Consumo de Franquia / Tráfego de Dados (Anti-IDOR)
 */
apiRouter.get('/traffic/consumption/:clientId', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  const days = parseInt((req.query.days as string) || '14', 10);
  try {
    const consumption = await trafficService.getClientTrafficConsumption(targetClientId, days);
    return res.json(consumption);
  } catch (error: any) {
    return sendApiError(res, 'Erro ao consultar consumo de tráfego.', error);
  }
});
}
