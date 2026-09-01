import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CONFIG } from '../src/config/env.js';
import { getDatabase } from '../src/database/db.js';
import { jwtService } from '../src/modules/auth/jwt.service.js';
import { FinancialService, financialService } from '../src/modules/financial/financial.service.js';
import { ixcCache } from '../src/modules/ixc/ixc.cache.js';
import { ixcService } from '../src/modules/ixc/ixc.service.js';
import { IXCService } from '../src/modules/ixc/ixc.service.js';
import { userService } from '../src/modules/auth/user.service.js';

/**
 * Suíte de integridade de pagamentos PIX:
 * - webhook persiste o pagamento (pix_payments) e grava a baixa conciliada;
 * - idempotência durável via pix_webhook_events (sobrevive a restart);
 * - stream SSE /financial/pix/stream/:clientId exige token válido (header
 *   ou ?token= para web) e aplica verificação de posse (anti-IDOR).
 */
describe('💳 Suite de Integridade e Autorização do Fluxo PIX', () => {
  const app = createApp();

  const clientToken = jwtService.generateToken({
    clientId: '2270',
    cpfCnpj: '15429370789',
    name: 'Cliente PIX',
    role: 'client',
  });
  const otherClientToken = jwtService.generateToken({
    clientId: '9999',
    cpfCnpj: '99999999999',
    name: 'Outro Cliente',
    role: 'client',
  });

  const clearPixState = async () => {
    financialService.clearPixEventClaims();
    await financialService.clearPersistedPixEventClaims();
    await getDatabase().prepare('DELETE FROM pix_payments').run();
  };

  beforeEach(async () => {
    await clearPixState();
  });

  afterEach(async () => {
    CONFIG.demoMode = true;
    CONFIG.pix.webhookSecret = '';
    ixcCache.clear();
    await clearPixState();
  });

  describe('🧾 1. Persistência do Webhook PIX', () => {
    it('deve persistir o pagamento, invalidar cache IXC e retornar PAGO', async () => {
      // Pré-aquece o cache com uma fatura "em aberto" para provar que o webhook
      // a derruba — é isso que faz GET /invoices parar de exibir VENCIDO.
      ixcCache.set('invoices:2270', [
        {
          id: '1001',
          id_cliente: '2270',
          status: 'A',
          data_emissao: '2026-08-13',
          data_vencimento: '2026-12-10',
          valor: '100.00',
          valor_aberto: '100.00',
          documento: '71820',
        },
      ]);

      const res = await request(app)
        .post('/api/financial/pix/webhook')
        .send({
          event: 'pix.payment.received',
          invoiceId: '1001',
          clientId: '2270',
          amount: 100,
          txid: 'PIX-TEST-PERSIST-1',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('PAGO');
      expect(res.body.invoiceId).toBe('1001');

      // Estado no banco (padrão da suíte: consulta direta via camada de dados)
      const row = await getDatabase()
        .prepare('SELECT * FROM pix_payments WHERE invoice_id = ?')
        .get<any>('1001');
      expect(row).toBeDefined();
      expect(row.client_id).toBe('2270');
      expect(Number(row.amount)).toBe(100);
      expect(row.txid).toBe('PIX-TEST-PERSIST-1');
      expect(typeof row.paid_at).toBe('string');

      // Cache IXC invalidado: próxima leitura do extrato não serve VENCIDO velho.
      expect(ixcCache.get('invoices:2270')).toBeNull();
    });

    it('deve processar webhook duplicado UMA única vez (idempotência persistida)', async () => {
      const payload = {
        event: 'pix.payment.received',
        invoiceId: '1002',
        clientId: '2270',
        amount: 99.9,
        txid: 'PIX-TEST-DUP-1',
      };

      const first = await request(app).post('/api/financial/pix/webhook').send(payload).expect(200);
      expect(first.body.duplicate).toBeFalsy();

      const second = await request(app).post('/api/financial/pix/webhook').send(payload).expect(200);
      expect(second.body.duplicate).toBe(true);

      // Exatamente um registro persistido apesar de duas entregas.
      const rows = await getDatabase().prepare('SELECT * FROM pix_payments WHERE invoice_id = ?').all<any>('1002');
      expect(rows.length).toBe(1);
    });

    it('deve deduplicar por hash quando o gateway não envia txid/endToEndId', async () => {
      const base = { invoiceId: '1003', clientId: '2270', amount: 55.5 };
      const paidAt = new Date('2026-02-03T12:00:00.000Z').toISOString();

      const first = await request(app)
        .post('/api/financial/pix/webhook')
        .send({ ...base, paidAt })
        .expect(200);
      const second = await request(app)
        .post('/api/financial/pix/webhook')
        .send({ ...base, paidAt })
        .expect(200);

      expect(first.body.duplicate).toBeFalsy();
      expect(second.body.duplicate).toBe(true);

      const rows = await getDatabase().prepare('SELECT * FROM pix_payments WHERE invoice_id = ?').all<any>('1003');
      expect(rows.length).toBe(1);
    });

    it('não deve marcar o evento como processado quando a persistência do pagamento falha', async () => {
      const db = getDatabase();
      const originalTransaction = db.transaction.bind(db);
      (db as any).transaction = async () => {
        throw new Error('falha transitória de persistência');
      };

      try {
        await expect(financialService.processPixWebhook({
          invoiceId: 'atomic-payment-1',
          clientId: '2270',
          amount: 120,
          txid: 'PIX-ATOMIC-FAIL-1',
        })).rejects.toMatchObject({
          message: 'Não foi possível persistir o pagamento PIX; o webhook deve ser reenviado.',
        });

        const events = await db.prepare('SELECT * FROM pix_webhook_events WHERE event_id = ?')
          .all<any>('evt:PIX-ATOMIC-FAIL-1');
        const payments = await db.prepare('SELECT * FROM pix_payments WHERE webhook_event_id = ?')
          .all<any>('evt:PIX-ATOMIC-FAIL-1');
        expect(events).toHaveLength(0);
        expect(payments).toHaveLength(0);
      } finally {
        (db as any).transaction = originalTransaction;
      }
    });

    it('deve refletir um pagamento PIX local como PAGO mesmo antes da atualização do IXC', async () => {
      const originalInvoices = (ixcService as any).getClientInvoices;
      (ixcService as any).getClientInvoices = async () => [{
        id: 'local-paid-1',
        id_cliente: '2270',
        status: 'A',
        data_emissao: '2026-08-01',
        data_vencimento: '2026-08-10',
        valor: '120.00',
        valor_aberto: '120.00',
        documento: 'DOC-LOCAL-PAID',
      }];

      try {
        await financialService.processPixWebhook({
          invoiceId: 'local-paid-1',
          clientId: '2270',
          amount: 120,
          txid: 'PIX-LOCAL-PAID-1',
        });

        const invoices = await financialService.getInvoicesByClientId('2270');
        expect(invoices.find((invoice) => invoice.id === 'local-paid-1')?.status).toBe('PAGO');
      } finally {
        (ixcService as any).getClientInvoices = originalInvoices;
      }
    });

    it('deve usar a operação de escrita do IXC e exigir confirmação do provedor na conciliação', async () => {
      const originalQuery = (ixcService as any).query;
      const originalUpdate = (ixcService as any).updateInvoicePayment;
      const originalCreateTicket = (ixcService as any).createTicket;
      let updateInput: any;

      (ixcService as any).query = async () => {
        throw new Error('listar não é uma baixa de fatura');
      };
      (ixcService as any).updateInvoicePayment = async (invoiceId: string, input: any) => {
        updateInput = { invoiceId, ...input };
        return { success: true };
      };
      (ixcService as any).createTicket = async () => ({ success: true, simulated: true, protocolo: 'demo' });

      try {
        const result = await financialService.reconcilePixPaymentWithIxc({
          invoiceId: 'invoice-write-1',
          clientId: '2270',
          amount: 88.5,
          paidAt: '2026-09-01T12:30:00.000Z',
        });

        expect(updateInput).toEqual({
          invoiceId: 'invoice-write-1',
          paidAt: '2026-09-01',
          amount: '88.50',
        });
        expect(result.invoiceMarkedPaid).toBe(true);
        expect(result.errors).toHaveLength(0);
      } finally {
        (ixcService as any).query = originalQuery;
        (ixcService as any).updateInvoicePayment = originalUpdate;
        (ixcService as any).createTicket = originalCreateTicket;
      }
    });

    it('deve enviar o cabeçalho de operação inserir e rejeitar ACK vazio ao criar chamado', async () => {
      const originalFetch = (globalThis as any).fetch;
      const originalDemoMode = CONFIG.demoMode;
      const originalToken = CONFIG.ixc.token;
      let requestInit: RequestInit | undefined;
      CONFIG.demoMode = false;
      CONFIG.ixc.token = 'ixc-write-token-for-test';
      (globalThis as any).fetch = async (_url: string, init: RequestInit) => {
        requestInit = init;
        return new Response(JSON.stringify({ id: 'ixc-ticket-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      };

      try {
        const result = await new IXCService().createTicket({
          id_cliente: '2270',
          assunto: 'Teste de chamado',
          mensagem: 'Mensagem de teste',
        });

        expect(result.success).toBe(true);
        expect((requestInit?.headers as Record<string, string>)?.ixcsoft).toBe('inserir');

        (globalThis as any).fetch = async () => new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
        await expect(new IXCService().createTicket({
          id_cliente: '2270',
          assunto: 'ACK ausente',
          mensagem: 'Deve falhar sem confirmação.',
        })).rejects.toMatchObject({ code: 'IXC_UNAVAILABLE' });

        (globalThis as any).fetch = async () => new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
        await expect(new IXCService().createTicket({
          id_cliente: '2270',
          assunto: 'ACK fraco',
          mensagem: 'Sucesso sem identificador do chamado não basta.',
        })).rejects.toMatchObject({ code: 'IXC_UNAVAILABLE' });
      } finally {
        (globalThis as any).fetch = originalFetch;
        CONFIG.demoMode = originalDemoMode;
        CONFIG.ixc.token = originalToken;
      }
    });

    it('deve exigir confirmação identificável também para a baixa da fatura no IXC', async () => {
      const originalFetch = (globalThis as any).fetch;
      const originalDemoMode = CONFIG.demoMode;
      const originalToken = CONFIG.ixc.token;
      CONFIG.demoMode = false;
      CONFIG.ixc.token = 'ixc-write-token-for-test';
      (globalThis as any).fetch = async () => new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      try {
        await expect(new IXCService().updateInvoicePayment('invoice-weak-ack', {
          paidAt: '2026-09-01', amount: '88.50',
        })).rejects.toMatchObject({ code: 'IXC_UNAVAILABLE' });
      } finally {
        (globalThis as any).fetch = originalFetch;
        CONFIG.demoMode = originalDemoMode;
        CONFIG.ixc.token = originalToken;
      }
    });
  });

  describe('🔐 2. Autorização do Stream SSE', () => {
    it('deve recusar conexão sem token (401 antes dos headers de streaming)', async () => {
      const res = await request(app).get('/api/financial/pix/stream/2270');
      expect(res.status).toBe(401);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.body.code).toBe('TOKEN_MISSING');
    });

    it('deve recusar token inválido (401 TOKEN_INVALID)', async () => {
      const res = await request(app)
        .get('/api/financial/pix/stream/2270?token=not-a-jwt')
        .expect(401);
      expect(res.body.code).toBe('TOKEN_INVALID');
    });

    it('deve aceitar token válido via query param ?token= (caminho web/EventSource)', (done) => {
      const req = request(app)
        .get(`/api/financial/pix/stream/me?token=${encodeURIComponent(clientToken)}`)
        .expect(200)
        .expect('Content-Type', /^text\/event-stream/)
        .buffer(false);

      req.end((err, res) => {
        if (err) return done(err);
        res.on('data', (chunk: Buffer) => {
          if (chunk.toString().includes('CONNECTED')) {
            expect(chunk.toString()).toContain('"clientId":"2270"');
            res.destroy();
            done();
          }
        });
      });
    });

    it('deve aceitar header Authorization Bearer (caminho nativo)', (done) => {
      const req = request(app)
        .get('/api/financial/pix/stream/me')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200)
        .expect('Content-Type', /^text\/event-stream/)
        .buffer(false);

      req.end((err, res) => {
        if (err) return done(err);
        res.on('data', (chunk: Buffer) => {
          if (chunk.toString().includes('data:')) {
            res.destroy();
            done();
          }
        });
      });
    });

    it('deve bloquear escuta de pagamento de outro cliente (IDOR_FORBIDDEN)', async () => {
      const res = await request(app)
        .get(`/api/financial/pix/stream/2270?token=${encodeURIComponent(otherClientToken)}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('IDOR_FORBIDDEN');
    });

    it('deve rejeitar no SSE um token cuja sessionVersion foi revogada', async () => {
      const sessionCheck = vi.spyOn(userService, 'isTokenSessionValid').mockReturnValue(false);
      try {
        const res = await request(app)
          .get('/api/financial/pix/stream/me')
          .set('Authorization', `Bearer ${clientToken}`);

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('SESSION_REVOKED');
        expect(sessionCheck).toHaveBeenCalledWith('2270', undefined);
      } finally {
        sessionCheck.mockRestore();
      }
    });

    it('deve reemitir a confirmação persistida quando o webhook chega em outra instância', (done) => {
      const invoiceId = `cross-instance-${Date.now()}`;
      const req = request(app)
        .get(`/api/financial/pix/stream/me?token=${encodeURIComponent(clientToken)}`)
        .expect(200)
        .buffer(false);

      const timeout = setTimeout(() => {
        req.abort();
        done(new Error('A confirmação persistida não chegou ao stream SSE.'));
      }, 6000);
      let triggered = false;

      req.end((err, res) => {
        if (err) {
          clearTimeout(timeout);
          return done(err);
        }
        res.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          if (text.includes('CONNECTED') && !triggered) {
            triggered = true;
            void new FinancialService().processPixWebhook({
              invoiceId,
              clientId: '2270',
              amount: 77,
              txid: `PIX-CROSS-INSTANCE-${Date.now()}`,
            });
          }
          if (text.includes(invoiceId)) {
            clearTimeout(timeout);
            res.destroy();
            done();
          }
        });
      });
    });

  });

  describe('✍️ 3. Webhook assinado sem identificador oficial', () => {
    it('aceita e deduplica por fingerprint quando o gateway omite txid e endToEndId', async () => {
      const previousDemoMode = CONFIG.demoMode;
      const previousSecret = CONFIG.pix.webhookSecret;
      CONFIG.demoMode = false;
      CONFIG.pix.webhookSecret = 'local-test-webhook-secret-with-at-least-32-chars';
      const rawBody = JSON.stringify({ invoiceId: 'signed-fingerprint-1', clientId: '2270', amount: 42.5 });
      const signature = crypto.createHmac('sha256', CONFIG.pix.webhookSecret).update(rawBody).digest('hex');
      const headers = {
        'Content-Type': 'application/json',
        'x-pix-signature': signature,
        'x-pix-timestamp': String(Math.floor(Date.now() / 1000)),
      };

      try {
        const first = await request(app).post('/api/financial/pix/webhook').set(headers).send(rawBody);
        expect(first.status).toBe(200);
        expect(first.body.duplicate).toBeFalsy();

        const replay = await request(app).post('/api/financial/pix/webhook').set(headers).send(rawBody);
        expect(replay.status).toBe(409);
        expect(replay.body.code).toBe('PIX_REPLAY_REJECTED');
      } finally {
        CONFIG.demoMode = previousDemoMode;
        CONFIG.pix.webhookSecret = previousSecret;
      }
    });
  });
});
