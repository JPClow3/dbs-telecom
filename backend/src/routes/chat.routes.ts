import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { chatService } from '../modules/chat/chat.service.js';
import { CONFIG } from '../config/env.js';
import { csatService } from '../modules/csat/csat.service.js';
import type { DepartmentType } from '../modules/ai/ai.service.js';
import { authMiddleware, enforceAntiIdor, optionalAuthMiddleware, requireAdmin } from '../middlewares/auth.middleware.js';
import { sendApiError, asyncHandler } from './route.helpers.js';
import { registerSseResponse } from '../app.js';

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
 *
 * Aceita `messageId` opcional (uuid do cliente) para idempotência: um reenvio
 * com o mesmo messageId devolve o resultado ORIGINAL em vez de duplicar ticket,
 * mensagem persistida ou entrada na fila.
 */
apiRouter.post('/chat/message', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { sessionId, message, clientId, messageId, clientMessageId: bodyClientMessageId } = req.body;
  const stableMessageId = bodyClientMessageId || messageId;

  if (!message) {
    return res.status(400).json({ error: 'Mensagem não pode ser vazia.' });
  }

  // Sem fallback fixo: sem token válido não há como identificar o cliente.
  const targetClientId = clientId || req.user?.clientId;
  if (!targetClientId) {
    return res.status(401).json({ error: 'Autenticação obrigatória para identificar o cliente.', code: 'CLIENT_ID_REQUIRED' });
  }
  const sid = sessionId || 'session-' + targetClientId;

  try {
    const sessionOwner = await chatService.getSessionOwner(sid);
    if (sessionOwner && req.user?.role !== 'admin' && sessionOwner !== req.user?.clientId) {
      return res.status(403).json({ error: 'Acesso negado ao histórico de outro cliente.', code: 'CHAT_SESSION_FORBIDDEN' });
    }
    const response = await chatService.processMessage(sid, message, targetClientId, { clientMessageId: stableMessageId });
    return res.json(response);
  } catch (error: any) {
    return sendApiError(res, 'Erro no processamento da mensagem.', error);
  }
});

/**
 * Recupera o histórico de mensagens persistidas no armazenamento configurado.
 */
apiRouter.get('/chat/history/:sessionId', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
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
}));

/**
 * ⚡ Endpoint de Streaming de Respostas (Server-Sent Events - SSE)
 *
 * Protocolo (compatível com o app mobile atual):
 *   start  → { sessionId, status }
 *   stage  → { stage }                    (heartbeat de progresso real; clientes
 *                                          antigos ignoram eventos desconhecidos)
 *   chunk  → { chunk }                    (pedaços do texto final, sem delays)
 *   done   → { message } | { status:'error', errorCode, error }  (SEMPRE emitido,
 *                                          mesmo em exceção — o cliente nunca
 *                                          fica com bolha vazia pendurada)
 */
apiRouter.all('/chat/message/stream', optionalAuthMiddleware, async (req: Request, res: Response) => {
  if (!req.user && !CONFIG.demoMode) {
    return res.status(401).json({ error: 'Autenticação obrigatória para o atendimento.', code: 'TOKEN_MISSING' });
  }
  const message = req.body?.message || (req.query.message as string);
  const sessionId = req.body?.sessionId || (req.query.sessionId as string);
  const requestedClientId = req.body?.clientId || (req.query.clientId as string);
  const clientMessageId = (req.body?.clientMessageId || req.body?.messageId || req.query.clientMessageId || req.query.messageId) as string | undefined;
  if (req.user && requestedClientId && req.user.role !== 'admin' && requestedClientId !== req.user.clientId && requestedClientId !== 'me') {
    return res.status(403).json({ error: 'Acesso negado para outro cliente.', code: 'IDOR_FORBIDDEN' });
  }
  // Sem token (demonstração), o atendimento anônimo fica fixado no cliente
  // demo; um clientId arbitrário nunca é aceito sem autenticação.
  const clientId = req.user
    ? (requestedClientId === 'me' ? req.user.clientId : requestedClientId || req.user.clientId)
    : '2270';

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
  res.isSse = true;
  registerSseResponse(res);

  /** Emite um evento SSE nomeado com payload JSON. */
  const sseSend = (event: string, data: Record<string, unknown>): void => {
    if (res.writableEnded || res.destroyed) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Envia evento inicial de conexão
  sseSend('start', { sessionId: sid, status: 'streaming' });

  // Garantia de protocolo: qualquer caminho de saída (sucesso, exceção ou
  // desconexão) passa pelo sseSend + finally abaixo — o stream SEMPRE termina
  // com um evento terminal 'done' e a conexão é encerrada.
  try {
    const finalMessage = await chatService.processStreamMessage(
      sid,
      message,
      clientId,
      (chunk) => {
        sseSend('chunk', { chunk });
      },
      {
        clientMessageId,
        onStage: (stage) => {
          sseSend('stage', { stage });
        },
      }
    );

    // Envia evento final com a mensagem completa formatada e cards
    sseSend('done', { status: 'ok', message: finalMessage });
    res.end();
  } catch (error: any) {
    const code = error?.code || 'STREAM_ERROR';
    const userMessage = code === 'IXC_UNAVAILABLE'
      ? 'O atendimento está temporariamente indisponível porque não foi possível consultar o ERP.'
      : 'Não foi possível concluir o atendimento.';
    // Erro no meio do stream: evento terminal com status de erro para o
    // cliente limpar a bolha vazia em vez de ficar pendurado para sempre.
    sseSend('done', { status: 'error', errorCode: 'stream_interrompida', error: userMessage, code });
    res.end();
  } finally {
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  }
});

/**
 * 🎙️ Endpoint para Atendimento por Áudio / Mensagens de Voz (Google Gemini Multimodal)
 *
 * Allowlist estrita de MIME types e teto de tamanho (~10MB) para o áudio em
 * base64: bloqueia tipos não suportados (415) e payloads abusivos (413).
 */
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
]);

/** Aliases conhecidos enviados pelos clientes oficiais (iOS grava .m4a). */
const AUDIO_MIME_ALIASES = new Map<string, string>([
  ['audio/m4a', 'audio/mp4'],
  ['audio/x-m4a', 'audio/mp4'],
]);

/** ~10MB de binário; base64 infla ~4/3, então aceita até ~14MB de string. */
const MAX_AUDIO_BASE64_LENGTH = Math.floor((10 * 1024 * 1024 * 4) / 3);

apiRouter.post('/chat/audio', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { audioBase64, mimeType, sessionId, clientId } = req.body;

  if (!audioBase64) {
    return res.status(400).json({ error: 'Áudio em base64 é obrigatório.' });
  }

  // Teto de tamanho ANTES de processar (base64 → bytes reais ~ 3/4).
  const base64Length = typeof audioBase64 === 'string' ? audioBase64.length : 0;
  if (base64Length > MAX_AUDIO_BASE64_LENGTH) {
    return res.status(413).json({
      error: 'Áudio muito grande. O limite é de aproximadamente 10MB.',
      code: 'AUDIO_TOO_LARGE',
    });
  }

  // Normaliza MIME (remove parâmetros tipo ";codecs=opus", minúsculas) e
  // aplica a allowlist — rejeição imediata de tipos não suportados.
  const normalizedMime = String(mimeType || 'audio/webm')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const canonicalMime = AUDIO_MIME_ALIASES.get(normalizedMime) || normalizedMime;
  if (!ALLOWED_AUDIO_MIME_TYPES.has(canonicalMime)) {
    return res.status(415).json({
      error: 'Tipo de áudio não suportado. Formatos aceitos: webm, mp4/m4a, mpeg, ogg e wav.',
      code: 'tipo_nao_suportado',
    });
  }

  // Sem fallback fixo: sem token válido não há como identificar o cliente.
  const targetClientId = clientId || req.user?.clientId;
  if (!targetClientId) {
    return res.status(401).json({ error: 'Autenticação obrigatória para identificar o cliente.', code: 'CLIENT_ID_REQUIRED' });
  }
  const sid = sessionId || 'session-' + targetClientId;
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
const csatSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().optional(),
  sessionId: z.string().optional(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
  tags: z.array(z.string()).max(10).optional(),
  department: z.string().optional(),
  context: z.enum(['DIAGNOSTIC', 'HIRING', 'FINANCIAL', 'GENERAL']).optional(),
  targetProtocol: z.string().optional(),
});

apiRouter.post('/chat/csat', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const parsed = csatSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Dados de avaliação inválidos.',
      code: 'CSAT_VALIDATION_FAILED',
      details: parsed.error.flatten().fieldErrors,
    });
  }

  try {
    // department é string livre no schema; o serviço tipa como DepartmentType.
    const feedback = await csatService.submitFeedback({
      ...parsed.data,
      department: parsed.data.department as DepartmentType | undefined,
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
 *
 * Endurecido: métricas agregadas agora exigem autenticação + papel admin
 * (eram públicas). O app móvel define getCSATStats() mas nenhum fluxo de tela o
 * invoca (grep em mobile/src: apenas a definição e o reexport em services/
 * api.ts), então o gating admin não quebra consumidor algum.
 */
apiRouter.get('/chat/csat/stats', authMiddleware, requireAdmin, asyncHandler(async (_req: Request, res: Response) => {
  const stats = await csatService.getStats();
  return res.json(stats);
}));

/**
 * ⭐ Histórico de Avaliações por Cliente (Anti-IDOR)
 */
apiRouter.get('/chat/csat/client/:clientId', authMiddleware, enforceAntiIdor('clientId'), asyncHandler(async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  const { feedbacks, total } = await csatService.getFeedbackByClientIdPaginated(targetClientId, page, limit);
  return res.json({ total, page, limit, feedbacks });
}));
}
