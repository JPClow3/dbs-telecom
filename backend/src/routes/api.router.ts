import { Router, Request, Response } from 'express';
import { ixcService } from '../modules/ixc/ixc.service.js';
import { chatService } from '../modules/chat/chat.service.js';
import { financialService } from '../modules/financial/financial.service.js';
import { commercialService } from '../modules/commercial/commercial.service.js';
import { supportService } from '../modules/support/support.service.js';
import { trafficService } from '../modules/traffic/traffic.service.js';
import { aiService } from '../modules/ai/ai.service.js';
import { geminiProvider } from '../modules/ai/gemini.provider.js';
import { ixcContextBuilder } from '../modules/ai/ixc-context.builder.js';
import { CONFIG } from '../config/env.js';
import { userService } from '../modules/auth/user.service.js';
import { queueService } from '../modules/queue/queue.service.js';
import { csatService } from '../modules/csat/csat.service.js';
import { jwtService } from '../modules/auth/jwt.service.js';
import { authMiddleware, enforceAntiIdor, optionalAuthMiddleware } from '../middlewares/auth.middleware.js';

export const apiRouter = Router();

/**
 * Health check & status da conexão IXC e Motor de IA Gemini
 */
apiRouter.get('/health', async (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    system: 'DBS Telecom Smart Service BFF',
    timestamp: new Date().toISOString(),
    ixcBaseUrl: ixcService['baseUrl'],
    ai: {
      provider: CONFIG.ai.provider,
      geminiConfigured: geminiProvider.isConfigured(),
      geminiModel: CONFIG.ai.geminiModel,
      guardrailsEnabled: CONFIG.ai.guardrailsEnabled,
      temperature: CONFIG.ai.temperature,
    },
    features: {
      jwtAntiIdor: true,
      sqlitePersistence: true,
      swaggerDocs: true,
      sseStreaming: true,
      audioMultimodal: true,
      csatNps: true,
      virtualQueue: true,
    },
  });
});

/**
 * Login completo com CPF e Senha (onde a senha padrão é o CPF do cliente)
 * Emite Token JWT com permissão Anti-IDOR
 */
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { cpfCnpj, login, password } = req.body;
  const doc = cpfCnpj || login;

  if (!doc) {
    return res.status(400).json({ error: 'Informe o CPF, CNPJ ou login para autenticação.' });
  }

  const pass = password !== undefined && password !== null ? String(password) : doc;

  try {
    const authResult = await userService.authenticateUser(doc, pass);
    if (!authResult.success || !authResult.client) {
      return res.status(401).json({
        found: false,
        message: authResult.message || 'Credenciais inválidas.',
      });
    }

    const client = authResult.client;
    const contracts = await ixcService.getClientContracts(client.id);

    // Emissão do Token JWT assinado para proteção Anti-IDOR
    const token = jwtService.generateToken({
      clientId: client.id,
      cpfCnpj: client.cnpj_cpf,
      name: client.razao,
      email: client.email,
      role: 'client',
    });

    return res.json({
      found: true,
      authenticated: true,
      token,
      expiresIn: CONFIG.auth.jwtExpiresIn,
      client: {
        id: client.id,
        nome: client.razao,
        fantasia: client.fantasia,
        cpfCnpj: client.cnpj_cpf,
        email: client.email,
        telefone: client.fone,
        endereco: `${client.endereco || ''}, ${client.numero || ''} - ${client.bairro || ''}, ${client.cidade || ''}`.trim(),
      },
      contracts,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao autenticar cliente no IXC', details: error.message });
  }
});

/**
 * Sincronização em lote: criação de contas de acesso para clientes do IXC onde a senha é o CPF
 */
apiRouter.post('/auth/sync-users', async (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit || req.body.limit || '50'), 10);
  try {
    const syncResult = await userService.syncUsersFromIXC(limit);
    return res.json({
      success: true,
      message: `Criados/sincronizados ${syncResult.totalProcessed} usuários da base IXC com senha padrão = CPF.`,
      ...syncResult,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao sincronizar usuários do IXC', details: error.message });
  }
});

/**
 * Listagem dos usuários sincronizados
 */
apiRouter.get('/auth/users', (_req: Request, res: Response) => {
  const users = userService.listAllUsers();
  return res.json({ total: users.length, users });
});

/**
 * Identificação rápida do cliente por CPF/CNPJ
 */
apiRouter.post('/auth/identify', async (req: Request, res: Response) => {
  const { cpfCnpj } = req.body;

  if (!cpfCnpj) {
    return res.status(400).json({ error: 'Informe o CPF ou CNPJ para identificação.' });
  }

  try {
    const client = await ixcService.findClientByCpfCnpj(cpfCnpj);
    if (!client) {
      return res.status(404).json({
        found: false,
        message: 'Cliente não localizado na base IXC da DBS Telecom.',
      });
    }

    const contracts = await ixcService.getClientContracts(client.id);

    return res.json({
      found: true,
      client: {
        id: client.id,
        nome: client.razao,
        fantasia: client.fantasia,
        cpfCnpj: client.cnpj_cpf,
        email: client.email,
        telefone: client.fone,
        endereco: `${client.endereco}, ${client.numero} - ${client.bairro}, ${client.cidade}`,
      },
      contracts,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao consultar cliente no IXC', details: error.message });
  }
});

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
    return res.status(500).json({ error: 'Erro ao gerar saudação', details: error.message });
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

  try {
    const response = await chatService.processMessage(sid, message, targetClientId);
    return res.json(response);
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro no processamento da mensagem', details: error.message });
  }
});

/**
 * Recupera o histórico de mensagens persistidas em SQLite
 */
apiRouter.get('/chat/history/:sessionId', authMiddleware, async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const history = chatService.getSessionHistory(sessionId);
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
  const message = req.body?.message || (req.query.message as string);
  const sessionId = req.body?.sessionId || (req.query.sessionId as string);
  const clientId = req.body?.clientId || (req.query.clientId as string) || req.user?.clientId;

  if (!message) {
    return res.status(400).json({ error: 'Mensagem não pode ser vazia.' });
  }

  const sid = sessionId || 'session-' + (clientId || 'guest');

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
    res.write(`event: error\ndata: ${JSON.stringify({ error: error?.message || 'Erro no stream' })}\n\n`);
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
  const type = mimeType || 'audio/webm';

  try {
    const result = await chatService.processAudioMessage(sid, audioBase64, type, targetClientId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao processar mensagem de áudio', details: error.message });
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
    const feedback = csatService.submitFeedback({
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
    return res.status(500).json({ error: 'Erro ao registrar CSAT', details: error.message });
  }
});

/**
 * ⭐ Estatísticas e Métricas Consolidadas de CSAT e NPS
 */
apiRouter.get('/chat/csat/stats', (_req: Request, res: Response) => {
  const stats = csatService.getStats();
  return res.json(stats);
});

/**
 * ⭐ Histórico de Avaliações por Cliente (Anti-IDOR)
 */
apiRouter.get('/chat/csat/client/:clientId', authMiddleware, enforceAntiIdor('clientId'), (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  const feedbacks = csatService.getFeedbackByClientId(targetClientId);
  return res.json({ total: feedbacks.length, feedbacks });
});

/**
 * 👤 Transbordo / Fila Virtual - Entrar na fila de espera com atendente humano (Anti-IDOR)
 */
apiRouter.post('/queue/join', authMiddleware, enforceAntiIdor('clientId'), (req: Request, res: Response) => {
  const { sessionId, clientId, clientName, department, reason } = req.body;
  const targetClientId = clientId || req.user?.clientId;

  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId é obrigatório.' });
  }

  try {
    const entry = queueService.joinQueue({
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
    return res.status(500).json({ error: 'Erro ao entrar na fila', details: error.message });
  }
});

/**
 * 👤 Transbordo / Fila Virtual - Consultar posição e tempo estimado em tempo real (Anti-IDOR)
 */
apiRouter.get('/queue/status/:clientId', authMiddleware, enforceAntiIdor('clientId'), (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  const status = queueService.getQueueStatus(targetClientId);
  return res.json(status);
});

/**
 * 👤 Transbordo / Fila Virtual - Sair ou cancelar a fila de espera (Anti-IDOR)
 */
apiRouter.post('/queue/leave', authMiddleware, enforceAntiIdor('clientId'), (req: Request, res: Response) => {
  const { clientId } = req.body;
  const targetClientId = clientId || req.user?.clientId;
  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId é obrigatório.' });
  }

  const result = queueService.leaveQueue(targetClientId);
  return res.json(result);
});

/**
 * 👤 Transbordo / Fila Virtual - Avanço simulado / alocação de atendente (Anti-IDOR)
 */
apiRouter.post('/queue/progress', authMiddleware, enforceAntiIdor('clientId'), (req: Request, res: Response) => {
  const { clientId } = req.body;
  const targetClientId = clientId || req.user?.clientId;
  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId é obrigatório.' });
  }

  const entry = queueService.advanceQueue(targetClientId);
  return res.json({ success: Boolean(entry), entry });
});

/**
 * 👤 Transbordo / Fila Virtual - Métricas da Fila
 */
apiRouter.get('/queue/stats', (_req: Request, res: Response) => {
  const stats = queueService.getStats();
  return res.json(stats);
});

/**
 * Endpoint de diagnóstico e auditoria de IA & Guardrails
 */
apiRouter.post('/ai/classify', optionalAuthMiddleware, async (req: Request, res: Response) => {
  const { message, clientId } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Campo message é obrigatório.' });
  }

  const targetClientId = clientId || req.user?.clientId;

  try {
    const result = await aiService.classifyMessage(message, { clientId: targetClientId });
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao classificar com IA', details: error.message });
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
    return res.status(500).json({ error: 'Erro ao construir contexto IXC', details: error.message });
  }
});

/**
 * Consulta de Faturas e Boletos no IXC (Anti-IDOR)
 */
apiRouter.get('/financial/invoices/:clientId', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  try {
    const invoices = await financialService.getInvoicesByClientId(targetClientId);
    return res.json({ total: invoices.length, invoices });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao consultar faturas', details: error.message });
  }
});

/**
 * Desbloqueio em Confiança (Promessa de Pagamento por 72h) (Anti-IDOR)
 */
apiRouter.post('/financial/unblock-promise', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId, contractId } = req.body;
  const targetClientId = clientId || req.user?.clientId;
  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId obrigatório.' });
  }

  try {
    const result = await financialService.unblockPromise(targetClientId, contractId);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao solicitar desbloqueio em confiança', details: error.message });
  }
});

/**
 * Visualização e Download do PDF do Boleto Bancário
 */
apiRouter.get('/financial/invoices/:id/pdf', optionalAuthMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const clientId = (req.query.clientId as string) || req.user?.clientId || '2270';
  const download = req.query.download === 'true';

  try {
    const pdfDoc = await financialService.getInvoicePdf(id, clientId);
    res.setHeader('Content-Type', pdfDoc.contentType);
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${pdfDoc.filename}"`
    );
    res.setHeader('Content-Length', pdfDoc.buffer.length);
    return res.send(pdfDoc.buffer);
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao gerar PDF do boleto', details: error.message });
  }
});

/**
 * Catálogo de Planos DBS Telecom
 */
apiRouter.get('/commercial/plans', (req: Request, res: Response) => {
  const type = req.query.type as 'URBANO' | 'WIFI6' | undefined;
  const plans = commercialService.getAllPlans(type);
  return res.json({ total: plans.length, plans });
});

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
    const result = supportService.startDiagnostic(targetClientId);
    return res.json(result);
  }

  const result = await supportService.processDiagnosticStep(targetClientId, userResponse || '');
  return res.json(result);
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
    return res.status(500).json({ error: 'Erro ao consultar chamados técnicos', details: error.message });
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
    return res.status(500).json({ error: 'Erro ao consultar consumo de tráfego', details: error.message });
  }
});

/**
 * ⚡ Endpoint ultra leve para Medição Real de Latência (Ping / Jitter)
 */
apiRouter.all('/system/ping', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.json({
    pong: true,
    serverTimestamp: Date.now(),
    serverTime: new Date().toISOString(),
    node: 'DBS-BFF-CORE-01',
    datacenter: 'Chapecó-SC (FTTH Backbone)',
  });
});

/**
 * ⚡ Endpoint para Teste Real de Velocidade / Throughput (Download Speed Test)
 */
apiRouter.get('/system/speedtest-payload', (req: Request, res: Response) => {
  const sizeBytes = Math.min(Math.max(parseInt((req.query.size as string) || '1048576', 10), 65536), 10485760);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Disposition', 'inline; filename="speedtest.bin"');
  res.setHeader('Content-Length', sizeBytes);

  const chunk = Buffer.alloc(sizeBytes, 0x41);
  return res.send(chunk);
});
