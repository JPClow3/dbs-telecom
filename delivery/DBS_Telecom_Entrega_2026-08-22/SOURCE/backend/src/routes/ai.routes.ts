import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { aiService } from '../modules/ai/ai.service.js';
import { ixcContextBuilder } from '../modules/ai/ixc-context.builder.js';
import { authMiddleware, enforceAntiIdor } from '../middlewares/auth.middleware.js';
import { sendApiError } from './route.helpers.js';

/**
 * Custo de IA é proporcional ao tamanho do prompt: sem limite de entrada, um
 * cliente (ou atacante autenticado) pode inflar a conta com mensagens gigantes.
 * 2000 caracteres cobre qualquer mensagem legítima de atendimento.
 */
const classifySchema = z.object({
  message: z
    .string({ required_error: 'Campo message é obrigatório.' })
    .min(1, 'Mensagem não pode ser vazia.')
    .max(2000, 'Mensagem excede o limite de 2000 caracteres.'),
});

export function registerAiRoutes(apiRouter: Router): void {
/**
 * Endpoint de diagnóstico e auditoria de IA & Guardrails
 *
 * Validação estrita por Zod: rejeita mensagem ausente/vazia (400) e oversized
 * (413) ANTES de qualquer chamada ao LLM — protege o custo de prompt.
 */
apiRouter.post('/ai/classify', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const parsed = classifySchema.safeParse(req.body);

  if (!parsed.success) {
    const issues = parsed.error.issues || [];
    const isTooLong = issues.some((issue) => issue.code === 'too_big');
    return res.status(isTooLong ? 413 : 400).json({
      error: isTooLong
        ? 'Mensagem muito longa para classificação (limite de 2000 caracteres).'
        : 'Campo message é obrigatório e deve ter até 2000 caracteres.',
      code: 'CLASSIFY_VALIDATION_FAILED',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const { message, clientId } = req.body;
  const targetClientId = clientId || req.user?.clientId;

  try {
    const result = await aiService.classifyMessage(parsed.data.message, { clientId: targetClientId });
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

