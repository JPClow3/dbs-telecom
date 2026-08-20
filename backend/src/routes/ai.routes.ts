import { Router, type Request, type Response } from 'express';
import { aiService } from '../modules/ai/ai.service.js';
import { ixcContextBuilder } from '../modules/ai/ixc-context.builder.js';
import { authMiddleware, enforceAntiIdor } from '../middlewares/auth.middleware.js';
import { sendApiError } from './route.helpers.js';

export function registerAiRoutes(apiRouter: Router): void {
/**
 * Endpoint de diagnóstico e auditoria de IA & Guardrails
 */
apiRouter.post('/ai/classify', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { message, clientId } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Campo message é obrigatório.' });
  }

  const targetClientId = clientId || req.user?.clientId;

  try {
    const result = await aiService.classifyMessage(message, { clientId: targetClientId });
    return res.json(result);
  } catch (error: any) {
    return sendApiError(res, 'Erro ao classificar com IA.', error);
  }
});

/**
 * Visualização do Bundle de Contexto do IXC construído para um cliente (Anti-IDOR)
 */
apiRouter.get('/ai/context/:clientId', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  try {
    const bundle = await ixcContextBuilder.buildContext(targetClientId);
    const promptSection = ixcContextBuilder.formatContextForPrompt(bundle);
    return res.json({ bundle, formattedPrompt: promptSection });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao construir contexto IXC.', error);
  }
});
}

