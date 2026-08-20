import { Router, type Request, type Response } from 'express';
import { chatService } from '../modules/chat/chat.service.js';
import { CONFIG } from '../config/env.js';
import { csatService } from '../modules/csat/csat.service.js';
import { authMiddleware, enforceAntiIdor, optionalAuthMiddleware } from '../middlewares/auth.middleware.js';
import { sendApiError } from './route.helpers.js';

export function registerChatRoutes(apiRouter: Router): void {
/**
 * Saudação inicial personalizada (Anti-IDOR)
 */
apiRouter.post('/chat/greeting', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.body;
  if (!clientId) {
    return res.status(400).json({ error: 'clientId obrigatório.' });
  }

  try {
    const greeting = await chatService.getInitialGreeting(clientId);
    return res.json(greeting);
  } catch (error: any) {
    return sendApiError(res, 'Erro ao gerar saudação.', error);
  }
});

/**
 * Envio e processamento de mensagem síncrona no chat com IA Gemini & Guardrails (Anti-IDOR)
 */
apiRouter.post('/chat/message', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { sessionId, message, clientId } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Mensagem não pode ser vazia.' });
  }

  const sid = sessionId || 'session-' + (clientId || req.user?.clientId || 'guest');
  const targetClientId = clientId || req.user?.clientId || '2270';

  const sessionOwner = await chatService.getSessionOwner(sid);
  if (sessionOwner && req.user?.role !== 'admin' && sessionOwner !== req.user?.clientId) {
    return res.status(403).json({ error: 'Acesso negado ao histórico de outro cliente.', code: 'CHAT_SESSION_FORBIDDEN' });
  }

  try {
    const response = await chatService.processMessage(sid, message, targetClientId);
    return res.json(response);
  } catch (error: any) {
    return sendApiError(res, 'Erro no processamento da mensagem.', error);
  }
});

/**
 * Recupera o histórico de mensagens persistidas em SQLite
 */
apiRouter.get('/chat/history/:sessionId', authMiddleware, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const sessionOwner = await chatService.getSessionOwner(sessionId);
  if (!sessionOwner) {
    return res.status(404).json({ error: 'Sessão de atendimento não encontrada.', code: 'CHAT_SESSION_NOT_FOUND' });
  }
  if (req.user?.role !== 'admin' && sessionOwner !== req.user?.clientId) {
    return res.status(403).json({ error: 'Acesso negado ao histórico de outro cliente.', code: 'CHAT_SESSION_FORBIDDEN' });
  }
  const history = await chatService.getSessionHistory(sessionId);
  return res.json({
    sessionId,
    total: history.length,
    history,
  });
});

/**
 * ⚡ Endpoint de Streaming de Respostas (Server-Sent Events - SSE)
 * Efeito de digitação em tempo real tipo ChatGPT consumindo o stream do Google Gemini
 */
apiRouter.all('/chat/message/stream', optionalAuthMiddleware, async (req: Request, res: Response) => {
  if (!req.user && !CONFIG.demoMode) {
    return res.status(401).json({ error: 'Autenticação obrigatória para o atendimento.', code: 'TOKEN_MISSING' });
  }
  const message = req.body?.message || (req.query.message as string);
  const sessionId = req.body?.sessionId || (req.query.sessionId as string);
  const requestedClientId = req.body?.clientId || (req.query.clientId as string);
  if (req.user && requestedClientId && req.user.role !== 'admin' && requestedClientId !== req.user.clientId && requestedClientId !== 'me') {
    return res.status(403).json({ error: 'Acesso negado para outro cliente.', code: 'IDOR_FORBIDDEN' });
  }
  const clientId = requestedClientId === 'me' ? req.user?.clientId : requestedClientId || req.user?.clientId || (CONFIG.demoMode ? '2270' : undefined);

  if (!message) {
    return res.status(400).json({ error: 'Mensagem não pode ser vazia.' });
  }

  const sid = sessionId || 'session-' + (clientId || 'guest');
  const sessionOwner = await chatService.getSessionOwner(sid);
  if (sessionOwner && req.user?.role !== 'admin' && sessionOwner !== req.user?.clientId) {
    return res.status(403).json({ error: 'Acesso negado ao histórico de outro cliente.', code: 'CHAT_SESSION_FORBIDDEN' });
  }

  // Configura cabeçalhos HTTP para Server-Sent Events (SSE)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Envia evento inicial de conexão
  res.write(`event: start\ndata: ${JSON.stringify({ sessionId: sid, status: 'streaming' })}\n\n`);

  try {
    const finalMessage = await chatService.processStreamMessage(sid, message, clientId, (chunk) => {
      res.write(`event: chunk\ndata: ${JSON.stringify({ chunk })}\n\n`);
    });

    // Envia evento final com a mensagem completa formatada e cards
    res.write(`event: done\ndata: ${JSON.stringify({ message: finalMessage })}\n\n`);
    res.end();
  } catch (error: any) {
    const code = error?.code || 'STREAM_ERROR';
    const message = code === 'IXC_UNAVAILABLE'
      ? 'O atendimento está temporariamente indisponível porque não foi possível consultar o ERP.'
      : 'Não foi possível concluir o atendimento.';
    res.write(`event: error\ndata: ${JSON.stringify({ error: message, code })}\n\n`);
    res.end();
  }
});

/**
 * 🎙️ Endpoint para Atendimento por Áudio / Mensagens de Voz (Google Gemini Multimodal)
 */
apiRouter.post('/chat/audio', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { audioBase64, mimeType, sessionId, clientId } = req.body;

  if (!audioBase64) {
    return res.status(400).json({ error: 'Áudio em base64 é obrigatório.' });
  }

  const sid = sessionId || 'session-' + (clientId || req.user?.clientId || 'guest');
  const targetClientId = clientId || req.user?.clientId || '2270';
  const sessionOwner = await chatService.getSessionOwner(sid);
  if (sessionOwner && req.user?.role !== 'admin' && sessionOwner !== req.user?.clientId) {
    return res.status(403).json({ error: 'Acesso negado ao histórico de outro cliente.', code: 'CHAT_SESSION_FORBIDDEN' });
  }
  const type = mimeType || 'audio/webm';

  try {
    const result = await chatService.processAudioMessage(sid, audioBase64, type, targetClientId);
    return res.json(result);
  } catch (error: any) {
    return sendApiError(res, 'Erro ao processar mensagem de áudio.', error);
  }
});

/**
 * ⭐ Pesquisa de Satisfação (CSAT / NPS) - Envio de Avaliação
 */
apiRouter.post('/chat/csat', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId, clientName, sessionId, rating, comment, tags, department, context, targetProtocol } = req.body;

  if (!clientId || rating === undefined) {
    return res.status(400).json({ error: 'clientId e rating (1 a 5) são obrigatórios.' });
  }

  try {
    const feedback = await csatService.submitFeedback({
      clientId,
      clientName,
      sessionId,
      rating: Number(rating),
      comment,
      tags,
      department,
      context,
      targetProtocol,
    });

    return res.json({
      success: true,
      message: 'Avaliação de satisfação registrada com sucesso na DBS Telecom!',
      feedback,
    });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao registrar CSAT.', error);
  }
});

/**
 * ⭐ Estatísticas e Métricas Consolidadas de CSAT e NPS
 */
apiRouter.get('/chat/csat/stats', async (_req: Request, res: Response) => {
  const stats = await csatService.getStats();
  return res.json(stats);
});

/**
 * ⭐ Histórico de Avaliações por Cliente (Anti-IDOR)
 */
apiRouter.get('/chat/csat/client/:clientId', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  const feedbacks = await csatService.getFeedbackByClientId(targetClientId);
  return res.json({ total: feedbacks.length, feedbacks });
});
}
