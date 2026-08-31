import { Router, type Request, type Response } from 'express';
import { CONFIG } from '../config/env.js';
import { financialService } from '../modules/financial/financial.service.js';
import { authMiddleware, enforceAntiIdor, optionalAuthMiddleware } from '../middlewares/auth.middleware.js';
import { sendApiError } from './route.helpers.js';

export function registerFinancialRoutes(apiRouter: Router): void {
/**
 * Consulta de Faturas e Boletos no IXC (Anti-IDOR)
 */
apiRouter.get('/financial/invoices/:clientId', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const targetClientId = clientId === 'me' ? req.user!.clientId : clientId;
  // O IXC limita o upstream a 10 faturas; a paginação é apenas por consistência.
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
  try {
    const invoices = await financialService.getInvoicesByClientId(targetClientId);
    const start = (page - 1) * limit;
    return res.json({ total: invoices.length, page, limit, invoices: invoices.slice(start, start + limit) });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao consultar faturas.', error);
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
    return sendApiError(res, 'Erro ao solicitar desbloqueio em confiança.', error);
  }
});

/**
 * Visualização e Download do PDF do Boleto Bancário
 */
apiRouter.get('/financial/invoices/:id/pdf', authMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const requestedClientId = req.query.clientId as string | undefined;
  if (requestedClientId && requestedClientId !== 'me' && req.user?.role !== 'admin' && requestedClientId !== req.user?.clientId) {
    return res.status(403).json({ error: 'Acesso negado ao boleto de outro cliente.', code: 'IDOR_FORBIDDEN' });
  }
  const clientId = requestedClientId === 'me' ? req.user?.clientId : requestedClientId || req.user?.clientId;
  if (!clientId) {
    return res.status(400).json({ error: 'clientId obrigatório.', code: 'CLIENT_ID_REQUIRED' });
  }
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
    const status = error?.code === 'INVOICE_NOT_FOUND' ? 404 : undefined;
    return sendApiError(res, 'Erro ao gerar PDF do boleto.', error, status || 500);
  }
});
}

