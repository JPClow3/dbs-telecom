import { Router, type Request, type Response } from 'express';
import { CONFIG } from '../config/env.js';
import { queueService, isKnownDepartment, type DepartmentType } from '../modules/queue/queue.service.js';
import { authMiddleware, enforceAntiIdor, optionalAuthMiddleware, requireAdmin } from '../middlewares/auth.middleware.js';
import { sendApiError, asyncHandler } from './route.helpers.js';
import { registerSseResponse } from '../app.js';

/**
 * Recalcula o departamento da fila no servidor. O valor informado pelo cliente
 * nunca é fonte de verdade: um departamento arbitrário não tem atendentes
 * mapeados e não entra no recálculo de posições (recalculatePositions itera a
 * lista canônica), deixando a entrada travada na posição #1. A derivação segue
 * o mesmo caminho dos demais fluxos do sistema (chat.conversation.ts): o
 * departamento vigente da sessão de chat classificada pela IA; sem sessão
 * conhecida, cai para GERAL.
 */
async function resolveDepartment(sessionId: string): Promise<DepartmentType> {
  const { chatRepository } = await import('../modules/chat/chat.repository.js');
  const session = await chatRepository.getOrCreateSession(sessionId);
  return session.currentDepartment || 'GERAL';
}

export function registerQueueRoutes(apiRouter: Router): void {
/**
 * 👤 Transbordo / Fila Virtual - Entrar na fila de espera com atendente humano (Anti-IDOR)
 *
 * O departamento é recalculado no servidor a partir dos dados da sessão do
 * cliente. Um `department` divergente ou desconhecido enviado pelo cliente é
 * rejeitado com 400 codigo_departamento_invalido — evita entradas em filas que
 * nunca são processadas e impede o enfileiramento seletivo em setores alheios.
 */
apiRouter.post('/queue/join', authMiddleware, enforceAntiIdor('clientId'), asyncHandler(async (req: Request, res: Response) => {
  const { sessionId, clientId, clientName, department, reason } = req.body;
  const targetClientId = clientId || req.user?.clientId;

  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId é obrigatório.' });
  }

  const sid = sessionId || `session-${targetClientId}`;

  try {
    // Fonte da verdade: departamento da sessão derivado server-side.
    const resolvedDepartment = await resolveDepartment(sid);

    if (department && !isKnownDepartment(department)) {
      return res.status(400).json({
        error: 'Departamento inválido. Informe um setor válido: SUPORTE, COMERCIAL, FINANCEIRO ou GERAL.',
        code: 'codigo_departamento_invalido',
      });
    }
    if (department && String(department).trim().toUpperCase() !== resolvedDepartment) {
      return res.status(400).json({
        error: 'Departamento divergente do classificado para sua sessão de atendimento.',
        code: 'codigo_departamento_invalido',
      });
    }

    const entry = await queueService.joinQueue({
      sessionId: sid,
      clientId: targetClientId,
      clientName: clientName || req.user?.name,
      department: resolvedDepartment,
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
}));

/**
 * 👤 Transbordo / Fila Virtual - Consultar posição e tempo estimado em tempo real (Anti-IDOR)
 */
apiRouter.get('/queue/status/:clientId', authMiddleware, enforceAntiIdor('clientId'), asyncHandler(async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  const status = await queueService.getQueueStatus(targetClientId);
  return res.json(status);
}));

/**
 * ⚡ Transbordo / Fila Virtual - Stream em Tempo Real via Server-Sent Events (SSE)
 * Envia atualizações de posição (#3 -> #2 -> #1 -> Atendente Conectado) instantaneamente sem polling.
 */
apiRouter.get('/queue/stream/:clientId', optionalAuthMiddleware, (req: Request, res: Response) => {
  if (!req.user && !CONFIG.demoMode) {
    return res.status(401).json({ error: 'Autenticação obrigatória para acompanhar a fila.', code: 'TOKEN_MISSING' });
  }
  const { clientId } = req.params;
  // Sem token (demonstração), o acompanhamento anônimo fica fixado no cliente
  // demo; nunca expor a fila de um clientId arbitrário sem autenticação.
  const targetClientId = req.user ? (clientId === 'me' ? req.user.clientId : clientId) : '2270';

  // Validação Anti-IDOR caso autenticado
  if (req.user && req.user.clientId !== targetClientId && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso não autorizado para acompanhar fila de outro cliente.' });
  }

  // Headers obrigatórios para Server-Sent Events (SSE)
  res.isSse = true;
  registerSseResponse(res);
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

  void writeCurrentStatus().catch(() => undefined);

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
apiRouter.post('/queue/leave', authMiddleware, enforceAntiIdor('clientId'), asyncHandler(async (req: Request, res: Response) => {
  const { clientId } = req.body;
  const targetClientId = clientId || req.user?.clientId;
  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId é obrigatório.' });
  }

  const result = await queueService.leaveQueue(targetClientId);
  return res.json(result);
}));

/**
 * 👤 Transbordo / Fila Virtual - Avanço simulado / alocação de atendente (Anti-IDOR)
 *
 * Endurecido: o avanço só é permitido sobre a PRÓPRIA entrada na fila do
 * cliente autenticado (enforceAntiIdor já bloqueia clientId de terceiros) e as
 * transições de atendente (ASSIGNED → IN_SERVICE → COMPLETED, que encerram o
 * estado da fila) passam a exigir papel administrativo. Antes qualquer cliente
 * conseguia auto-atribuir um agente e concluir o próprio atendimento.
 *
 * Fluxos legítimos preservados:
 * - Cliente autenticado avança a própria fila enquanto está QUEUED (simulação
 *   usada pelo card da fila no app móvel).
 * - Modo demonstração (CONFIG.demoMode): o botão "Simular avanço" continua
 *   funcional inclusive nas etapas de atendente, pois é ambiente de testes.
 */
apiRouter.post('/queue/progress', authMiddleware, enforceAntiIdor('clientId'), asyncHandler(async (req: Request, res: Response) => {
  const { clientId } = req.body;
  const targetClientId = clientId || req.user?.clientId;
  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId é obrigatório.' });
  }

  // Transições de atendente/completação exigem admin (ou modo demo). Consulta
  // o estado atual ANTES de avançar para decidir se a transição solicitada é
  // permitida ao papel cliente.
  const current = await queueService.getQueueStatus(targetClientId);
  const isAgentTransition =
    Boolean(current.entry && (current.entry.status === 'ASSIGNED' || current.entry.status === 'IN_SERVICE'));

  if (!CONFIG.demoMode && isAgentTransition && req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'Apenas atendentes administradores podem avançar o estado após a alocação.',
      code: 'QUEUE_ADMIN_REQUIRED',
    });
  }

  const entry = await queueService.advanceQueue(targetClientId);
  return res.json({ success: Boolean(entry), entry });
}));

/**
 * 👤 Transbordo / Fila Virtual - Métricas da Fila
 *
 * Endurecido: métricas operacionais agora exigem autenticação + papel admin
 * (eram públicas). Nenhum consumidor móvel chama este endpoint (grep em
 * mobile/src confirma ausência de /queue/stats), então o gating admin não
 * quebra o app.
 */
apiRouter.get('/queue/stats', authMiddleware, requireAdmin, asyncHandler(async (_req: Request, res: Response) => {
  const stats = await queueService.getStats();
  return res.json(stats);
}));
}
