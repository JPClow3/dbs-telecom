import { Router, type Request, type Response } from 'express';
import { CONFIG } from '../config/env.js';
import { queueService } from '../modules/queue/queue.service.js';
import { authMiddleware, enforceAntiIdor, optionalAuthMiddleware } from '../middlewares/auth.middleware.js';
import { sendApiError } from './route.helpers.js';

export function registerQueueRoutes(apiRouter: Router): void {
/**
 * 👤 Transbordo / Fila Virtual - Entrar na fila de espera com atendente humano (Anti-IDOR)
 */
apiRouter.post('/queue/join', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { sessionId, clientId, clientName, department, reason } = req.body;
  const targetClientId = clientId || req.user?.clientId;

  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId é obrigatório.' });
  }

  try {
    const entry = await queueService.joinQueue({
      sessionId: sessionId || `session-${targetClientId}`,
      clientId: targetClientId,
      clientName: clientName || req.user?.name,
      department: department || 'GERAL',
      reason,
    });

    return res.json({
      success: true,
      message: `Você entrou na fila de atendimento humano na posição #${entry.position}.`,
      entry,
    });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao entrar na fila.', error);
  }
});

/**
 * 👤 Transbordo / Fila Virtual - Consultar posição e tempo estimado em tempo real (Anti-IDOR)
 */
apiRouter.get('/queue/status/:clientId', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  const status = await queueService.getQueueStatus(targetClientId);
  return res.json(status);
});

/**
 * ⚡ Transbordo / Fila Virtual - Stream em Tempo Real via Server-Sent Events (SSE)
 * Envia atualizações de posição (#3 -> #2 -> #1 -> Atendente Conectado) instantaneamente sem polling.
 */
apiRouter.get('/queue/stream/:clientId', optionalAuthMiddleware, async (req: Request, res: Response) => {
  if (!req.user && !CONFIG.demoMode) {
    return res.status(401).json({ error: 'Autenticação obrigatória para acompanhar a fila.', code: 'TOKEN_MISSING' });
  }
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? (req.user?.clientId || (CONFIG.demoMode ? '2270' : '')) : clientId;

  // Validação Anti-IDOR caso autenticado
  if (req.user && req.user.clientId !== targetClientId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso não autorizado para acompanhar fila de outro cliente.' });
  }

  // Headers obrigatórios para Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // 1. Envia status inicial imediatamente ao conectar
  const writeCurrentStatus = async () => {
    const status = await queueService.getQueueStatus(targetClientId);
    res.write(`data: ${JSON.stringify(status)}\n\n`);
  };

  await writeCurrentStatus();

  // 2. Listener de atualizações reativas do QueueService
  const onQueueChange = () => void writeCurrentStatus().catch(() => undefined);

  queueService.queueEvents.on(`update:${targetClientId}`, onQueueChange);
  queueService.queueEvents.on('queue_changed', onQueueChange);

  // 3. Heartbeat / Keepalive a cada 15 segundos para manter a conexão ativa
  const keepAliveTimer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAliveTimer);
    }
  }, 15000);

  // Em Workers, cada instância tem sua própria memória. A consulta periódica
  // mantém o stream correto mesmo quando uma mudança foi gravada por outra instância.
  const statusPollTimer = setInterval(() => void writeCurrentStatus().catch(() => undefined), 5000);

  // 4. Limpeza ao desconectar o cliente
  req.on('close', () => {
    clearInterval(keepAliveTimer);
    clearInterval(statusPollTimer);
    queueService.queueEvents.removeListener(`update:${targetClientId}`, onQueueChange);
    queueService.queueEvents.removeListener('queue_changed', onQueueChange);
    res.end();
  });
});

/**
 * 👤 Transbordo / Fila Virtual - Sair ou cancelar a fila de espera (Anti-IDOR)
 */
apiRouter.post('/queue/leave', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.body;
  const targetClientId = clientId || req.user?.clientId;
  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId é obrigatório.' });
  }

  const result = await queueService.leaveQueue(targetClientId);
  return res.json(result);
});

/**
 * 👤 Transbordo / Fila Virtual - Avanço simulado / alocação de atendente (Anti-IDOR)
 */
apiRouter.post('/queue/progress', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.body;
  const targetClientId = clientId || req.user?.clientId;
  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId é obrigatório.' });
  }

  const entry = await queueService.advanceQueue(targetClientId);
  return res.json({ success: Boolean(entry), entry });
});

/**
 * 👤 Transbordo / Fila Virtual - Métricas da Fila
 */
apiRouter.get('/queue/stats', async (_req: Request, res: Response) => {
  const stats = await queueService.getStats();
  return res.json(stats);
});
}
