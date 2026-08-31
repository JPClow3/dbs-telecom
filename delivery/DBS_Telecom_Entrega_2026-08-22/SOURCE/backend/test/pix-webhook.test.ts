import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CONFIG } from '../src/config/env.js';
import { getDatabase } from '../src/database/db.js';
import { jwtService } from '../src/modules/auth/jwt.service.js';
import { financialService } from '../src/modules/financial/financial.service.js';
import { ixcCache } from '../src/modules/ixc/ixc.cache.js';

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
  });
});
