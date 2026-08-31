import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { CONFIG } from '../config/env.js';
import { wifiService } from '../modules/wifi/wifi.service.js';
import { opticalService } from '../modules/optical/optical.service.js';
import { notificationsService } from '../modules/notifications/notifications.service.js';
import { referralService } from '../modules/referral/referral.service.js';
import { financialService } from '../modules/financial/financial.service.js';
import { jwtService } from '../modules/auth/jwt.service.js';
import { authMiddleware, enforceAntiIdor, requireAdmin } from '../middlewares/auth.middleware.js';
import { sendApiError } from './route.helpers.js';

function requireDemoAdapter(res: Response, feature: string): boolean {
  if (CONFIG.demoMode) return true;
  res.status(503).json({
    error: `${feature} ainda não possui integração de produção configurada.`,
    code: 'PROVIDER_NOT_CONFIGURED',
    dataState: 'UNAVAILABLE',
  });
  return false;
}

/**
 * Corpo aceito em POST /notifications/simulate — espelha o CreateNotificationDto
 * do módulo de notificações. `.strict()` rejeita campos extras: o handler só
 * consome exatamente estes campos.
 */
const simulateNotificationSchema = z
  .object({
    clientId: z.string().trim().min(1),
    type: z.enum(['INVOICE_REMINDER', 'MAINTENANCE_ALERT', 'TICKET_STATUS', 'REFERRAL_REWARD', 'SYSTEM_NOTICE']),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(500),
    actionType: z.enum(['COPY_PIX', 'VIEW_INVOICE', 'TICKET_DETAILS', 'VIEW_REFERRALS', 'GENERAL']).optional(),
    actionPayload: z.string().max(1000).optional(),
  })
  .strict();

export function registerEnterpriseRoutes(apiRouter: Router): void {
// ==========================================
// 📶 1. MÓDULO WI-FI TR-069 & REDE VISITAS
// ==========================================

/**
 * Consulta configurações Wi-Fi do cliente
 */
apiRouter.get('/wifi/settings/:clientId', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  if (!requireDemoAdapter(res, 'Gerenciamento Wi-Fi/TR-069')) return;
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const settings = await wifiService.getWifiSettings(clientId);
    return res.json({ ...settings, simulated: true, dataState: 'DEMO' });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao consultar configurações de Wi-Fi.', error);
  }
});

/**
 * Atualiza configurações de Wi-Fi / Rede de Visitas
 */
apiRouter.put('/wifi/settings/:clientId', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  if (!requireDemoAdapter(res, 'Gerenciamento Wi-Fi/TR-069')) return;
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const updated = await wifiService.updateWifiSettings(clientId, req.body);
    return res.json({ ...updated, simulated: true, dataState: 'DEMO' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

/**
 * Gera QR Code de conexão rápida para a rede de visitas
 */
apiRouter.get('/wifi/qr/:clientId', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  if (!requireDemoAdapter(res, 'Gerenciamento Wi-Fi/TR-069')) return;
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const qrData = await wifiService.getGuestQrCode(clientId);
    return res.json({ ...qrData, simulated: true, dataState: 'DEMO' });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao gerar QR Code Wi-Fi.', error);
  }
});

/**
 * Reinicia o módulo Wi-Fi / roteador via TR-069
 */
apiRouter.post('/wifi/restart/:clientId', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  if (!requireDemoAdapter(res, 'Gerenciamento Wi-Fi/TR-069')) return;
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const result = await wifiService.restartWifi(clientId);
    return res.json({ ...result, simulated: true, dataState: 'DEMO' });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao reiniciar Wi-Fi.', error);
  }
});

// ==========================================
// 🔍 2. DIAGNÓSTICO PROATIVO DE SINAL ÓTICO (dBm)
// ==========================================

/**
 * Leitura de potência óptica RX/TX e auto-remediação de chamados
 */
apiRouter.get('/optical/diagnostics/:clientId', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  if (!requireDemoAdapter(res, 'Telemetria óptica')) return;
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const simulatedRx = req.query.rx ? parseFloat(req.query.rx as string) : undefined;
    const result = await opticalService.checkOpticalPower(clientId, simulatedRx);
    return res.json({ ...result, simulated: true, dataState: 'DEMO' });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao diagnosticar sinal óptico.', error);
  }
});

// ==========================================
// 🔔 3. NOTIFICAÇÕES PUSH INTELIGENTES
// ==========================================

/**
 * Lista notificações push do cliente
 */
apiRouter.get('/notifications/:clientId', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const notifications = await notificationsService.getUserNotifications(clientId);
    return res.json(notifications);
  } catch (error: any) {
    return sendApiError(res, 'Erro ao listar notificações.', error);
  }
});

/**
 * Marca notificação específica como lida
 */
apiRouter.patch('/notifications/:clientId/read/:notificationId', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const success = await notificationsService.markAsRead(clientId, req.params.notificationId);
    return res.json({ success });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao atualizar notificação.', error);
  }
});

/**
 * Marca todas as notificações como lidas
 */
apiRouter.patch('/notifications/:clientId/read-all', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const count = await notificationsService.markAllAsRead(clientId);
    return res.json({ success: true, updatedCount: count });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao marcar notificações como lidas.', error);
  }
});

/**
 * Disparo simulado de notificação (para testes e automações).
 *
 * Corpo validado com schema estrito: o handler só consome os campos do
 * CreateNotificationDto; extras são rejeitados (nada de payload arbitrário
 * sendo persistido por um endpoint administrativo).
 */
apiRouter.post('/notifications/simulate', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const parsed = simulateNotificationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Payload de notificação inválido.',
      code: 'NOTIFICATION_PAYLOAD_INVALID',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  try {
    const notification = await notificationsService.sendNotification(parsed.data);
    return res.status(201).json(notification);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});

// ==========================================
// 💳 4. PIX DINÂMICO & CONFIRMAÇÃO INSTANTÂNEA
// ==========================================

/**
 * Webhook recebido do Gateway Bancário (Gerencianet / Banco do Brasil / Sicredi / EFI)
 */
apiRouter.post('/financial/pix/webhook', async (req: Request, res: Response) => {
  try {
    const payload = req.body;

    // A forma do payload é validada sempre; apenas a assinatura criptográfica
    // é dispensada no modo demonstração.
    if (!payload?.invoiceId || !payload?.clientId || !Number.isFinite(Number(payload?.amount)) || Number(payload?.amount) <= 0) {
      return res.status(400).json({ error: 'Payload PIX inválido.', code: 'PIX_PAYLOAD_INVALID' });
    }

    if (!CONFIG.demoMode) {
      const signature = req.get('x-pix-signature') || req.get('x-webhook-signature') || req.get('x-signature');
      const timestamp = req.get('x-pix-timestamp') || req.get('x-webhook-timestamp');
      const eventId = payload?.txid || payload?.endToEndId;

      if (!signature || !timestamp || !eventId || !req.rawBody) {
        return res.status(401).json({ error: 'Assinatura, timestamp e identificador do webhook são obrigatórios.', code: 'PIX_SIGNATURE_REQUIRED' });
      }

      const timestampSeconds = Number(timestamp);
      if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 5 * 60) {
        return res.status(401).json({ error: 'Webhook PIX expirado ou com timestamp inválido.', code: 'PIX_REPLAY_REJECTED' });
      }
      if (!financialService.verifyPixWebhookSignature(req.rawBody, signature)) {
        return res.status(401).json({ error: 'Assinatura do webhook PIX inválida.', code: 'PIX_SIGNATURE_INVALID' });
      }
      if (!financialService.claimPixEvent(String(eventId))) {
        return res.status(409).json({ error: 'Webhook PIX duplicado.', code: 'PIX_REPLAY_REJECTED' });
      }
    }

    const result = await financialService.processPixWebhook(payload);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || 'Payload PIX inválido.', code: 'PIX_PAYLOAD_INVALID' });
  }
});

/**
 * Stream SSE para confirmação instantânea de pagamento PIX no app móvel (< 3s).
 *
 * Autenticação OBRIGATÓRIA: header `Authorization: Bearer <jwt>` (nativo) ou
 * query param `?token=<jwt>` (web). O EventSource do navegador não permite
 * definir headers, então a via do query param é o único caminho para o SSE na
 * web — ver mobile/src/services/api/notifications.ts.
 *
 * ⚠️ Tradeoff documentado: token em query string aparece em logs de acesso,
 * proxies e histórico do servidor — aceitável apenas para SSE de leitura
 * (nenhuma mutação, escopo limitado ao próprio clientId). Nunca reutilizar
 * esse padrão em rotas de escrita.
 */
apiRouter.get('/financial/pix/stream/:clientId', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim() || undefined;
  } else if (typeof req.query.token === 'string' && req.query.token.trim()) {
    token = req.query.token.trim();
  }

  // 401 ANTES de qualquer header de streaming: sem token válido não há
  // conexão SSE, nem em demonstração (fecha o acesso anônimo/IDOR).
  if (!token) {
    return res.status(401).json({
      error: 'Não autorizado: informe o token JWT via header Authorization ou query param ?token=.',
      code: 'TOKEN_MISSING',
    });
  }

  try {
    const user = jwtService.verifyToken(token);
    if (!user.clientId || (user.role && user.role !== 'admin' && user.role !== 'client')) {
      throw new Error('invalid claims');
    }
    req.user = user;
  } catch {
    return res.status(401).json({
      error: 'Não autorizado: Token JWT inválido, expirado ou corrompido.',
      code: 'TOKEN_INVALID',
    });
  }

  const clientId = req.params.clientId;
  // O ouvinte só acompanha o próprio clientId; alias "me" resolve para a
  // identidade do token. Admin tem visão irrestrita (espelha requireAdmin).
  const targetClientId = clientId === 'me' ? (req.user?.clientId as string) : clientId;
  if (req.user?.role !== 'admin' && targetClientId !== req.user?.clientId) {
    return res.status(403).json({
      error: 'Acesso negado para acompanhar pagamento de outro cliente.',
      code: 'IDOR_FORBIDDEN',
    });
  }
  if (!targetClientId) {
    return res.status(400).json({ error: 'clientId obrigatório.', code: 'CLIENT_ID_REQUIRED' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Envia heartbeat inicial
  res.write(`data: ${JSON.stringify({ event: 'CONNECTED', clientId: targetClientId, timestamp: Date.now(), simulated: CONFIG.demoMode })}\n\n`);

  const onPixPayment = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  financialService.pixEvents.on(`pix:${targetClientId}`, onPixPayment);

  // O EventEmitter do PIX é processo-local (eventos não são persistidos), então
  // não há o que re-emitir do banco como no stream da fila. O keepalive mantém
  // a conexão viva através de proxies/Workers e permite checar liveness; a
  // confirmação real chega via evento ou via notificação persistida por
  // processPixWebhook.
  const keepAliveTimer = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch {
      clearInterval(keepAliveTimer);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAliveTimer);
    financialService.pixEvents.off(`pix:${targetClientId}`, onPixPayment);
  });
});

// ==========================================
// 🎁 5. PROGRAMA INDIQUE E GANHE 50% OFF
// ==========================================

/**
 * Extrato e resumo do programa de indicações
 */
apiRouter.get('/referrals/:clientId', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  if (!requireDemoAdapter(res, 'Programa de indicações')) return;
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const summary = await referralService.getReferralSummary(clientId);
    return res.json({ ...summary, simulated: true, dataState: 'DEMO' });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao consultar indicações.', error);
  }
});

/**
 * Cadastra um novo amigo indicado
 */
apiRouter.post('/referrals/:clientId', authMiddleware, enforceAntiIdor(), async (req: Request, res: Response) => {
  if (!requireDemoAdapter(res, 'Programa de indicações')) return;
  try {
    const clientId = req.params.clientId === 'me' ? (req.user?.clientId as string) : req.params.clientId;
    const friend = await referralService.addReferral({
      referrerClientId: clientId,
      referredName: req.body.referredName,
      referredPhone: req.body.referredPhone,
    });
    return res.status(201).json({ ...friend, simulated: true, dataState: 'DEMO' });
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
});
}
