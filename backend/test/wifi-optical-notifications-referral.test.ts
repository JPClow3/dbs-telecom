import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { jwtService } from '../src/modules/auth/jwt.service.js';
import { notificationsRepository } from '../src/modules/notifications/notifications.repository.js';
import { referralRepository } from '../src/modules/referral/referral.repository.js';
import { supportRepository } from '../src/modules/support/support.repository.js';

describe('🏢 DBS Telecom Enterprise Features Suite', () => {
  const app = createApp();
  const tokenCliente2270 = jwtService.generateToken({
    clientId: '2270',
    clientName: 'Emanuel da Silva',
    cpfCnpj: '15429370789',
  });
  const tokenCliente2271 = jwtService.generateToken({
    clientId: '2271',
    clientName: 'Outro Assinante',
    cpfCnpj: '12345678900',
  });

  beforeEach(() => {
    notificationsRepository.clearByClientId('2270');
    referralRepository.clearByReferrerId('2270');
  });

  describe('📶 1. Gerenciador Wi-Fi & QR Code para Visitas', () => {
    it('deve consultar configurações de Wi-Fi do cliente autenticado', async () => {
      const res = await request(app)
        .get('/api/wifi/settings/2270')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200);

      expect(res.body.clientId).toBe('2270');
      expect(res.body.ssid2G).toBeDefined();
      expect(res.body.guestSsid).toBeDefined();
      expect(res.body.connectedDevices).toBeGreaterThan(0);
    });

    it('deve atualizar SSID e senha do Wi-Fi com sucesso', async () => {
      const res = await request(app)
        .put('/api/wifi/settings/2270')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .send({
          ssid2G: 'DBS_Fibra_Casa_Nova',
          password: 'nova_senha_super_segura_123',
        })
        .expect(200);

      expect(res.body.ssid2G).toBe('DBS_Fibra_Casa_Nova');
      expect(res.body.password).toBe('nova_senha_super_segura_123');
    });

    it('deve rejeitar senha fraca com menos de 8 caracteres', async () => {
      const res = await request(app)
        .put('/api/wifi/settings/2270')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .send({ password: '123' })
        .expect(400);

      expect(res.body.error).toContain('mínimo 8 caracteres');
    });

    it('deve gerar payload para QR Code de Wi-Fi de visitas', async () => {
      const res = await request(app)
        .get('/api/wifi/qr/2270')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200);

      expect(res.body.qrString).toContain('WIFI:T:WPA;S:');
      expect(res.body.ssid).toBeDefined();
    });

    it('deve reiniciar módulo Wi-Fi via TR-069', async () => {
      const res = await request(app)
        .post('/api/wifi/restart/2270')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.estimatedRecoverySeconds).toBe(45);
    });

    it('🛡️ Anti-IDOR: deve bloquear acesso às configurações Wi-Fi de outro cliente', async () => {
      await request(app)
        .get('/api/wifi/settings/9999')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(403);
    });
  });

  describe('🔍 2. Diagnóstico Proativo de Sinal Ótico (dBm)', () => {
    it('deve diagnosticar sinal saudável (-19.4 dBm) como PERFECT', async () => {
      const res = await request(app)
        .get('/api/optical/diagnostics/2270?rx=-19.4')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200);

      expect(res.body.classification).toBe('PERFECT');
      expect(res.body.statusLabel).toBe('Sinal Perfeito');
      expect(res.body.ticketCreated).toBe(false);
    });

    it('deve diagnosticar atenuação moderada (-26.2 dBm) como WARNING com alerta preventivo', async () => {
      const res = await request(app)
        .get('/api/optical/diagnostics/2270?rx=-26.2')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200);

      expect(res.body.classification).toBe('WARNING');
      expect(res.body.statusLabel).toBe('Atenuação Moderada');
      expect(res.body.ticketCreated).toBe(false);
    });

    it('deve diagnosticar sinal crítico (-29.8 dBm) e ABRIR CHAMADO AUTOMÁTICO proativamente', async () => {
      const res = await request(app)
        .get('/api/optical/diagnostics/2270?rx=-29.8')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200);

      expect(res.body.classification).toBe('CRITICAL');
      expect(res.body.ticketCreated).toBe(true);
      expect(res.body.ticketProtocol).toBeDefined();

      // Confirma que o ticket foi inserido no PostgreSQL
      const tickets = await supportRepository.getUserTickets('2270');
      const autoTicket = tickets.find((t) => t.protocolo === res.body.ticketProtocol);
      expect(autoTicket).toBeDefined();
    });
  });

  describe('🔔 3. Notificações Push Inteligentes', () => {
    it('deve listar notificações inteligentes e lembrete de fatura com payload PIX', async () => {
      const res = await request(app)
        .get('/api/notifications/2270')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      const invoiceNotif = res.body.find((n: any) => n.type === 'INVOICE_REMINDER');
      expect(invoiceNotif).toBeDefined();
      expect(invoiceNotif.actionType).toBe('COPY_PIX');
    });

    it('deve marcar notificação como lida', async () => {
      const list = await request(app)
        .get('/api/notifications/2270')
        .set('Authorization', `Bearer ${tokenCliente2270}`);

      const notifId = list.body[0].id;

      const res = await request(app)
        .patch(`/api/notifications/2270/read/${notifId}`)
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('💳 4. PIX Dinâmico & Confirmação Instantânea (Webhook + SSE)', () => {
    it('deve processar Webhook do Gateway PIX e emitir status PAGO', async () => {
      const res = await request(app)
        .post('/api/financial/pix/webhook')
        .send({
          event: 'pix.payment.received',
          invoiceId: '1001',
          clientId: '2270',
          amount: 99.90,
          txid: 'PIX-E2E-TEST-9988',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('PAGO');
      expect(res.body.invoiceId).toBe('1001');
    });

    it('deve transmitir evento de liquidação PIX em tempo real no stream SSE', (done) => {
      // O stream PIX agora exige autenticação (anti-IDOR); o ouvinte assina o
      // próprio clientId com o token do cliente 2270, como no stream da fila.
      const req = request(app)
        .get('/api/financial/pix/stream/me')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200)
        .expect('Content-Type', /^text\/event-stream/)
        .buffer(false);

      req.end((err, res) => {
        if (err) return done(err);

        let count = 0;
        res.on('data', (chunk: Buffer) => {
          const str = chunk.toString();
          if (str.includes('data:')) {
            count++;
            if (count === 1) {
              // Conexão estabelecida. Dispara o Webhook do PIX!
              setTimeout(async () => {
                await request(app)
                  .post('/api/financial/pix/webhook')
                  .send({
                    invoiceId: '1002',
                    clientId: '2270',
                    amount: 99.90,
                  });
              }, 40);
            } else if (count >= 2) {
              expect(str).toContain('PIX_CONFIRMED');
              expect(str).toContain('1002');
              res.destroy();
              done();
            }
          }
        });
      });
    });
  });

  describe('🎁 5. Extrato do Programa "Indique e Ganhe 50% OFF"', () => {
    it('deve obter extrato completo com link exclusivo e amigos indicados', async () => {
      const res = await request(app)
        .get('/api/referrals/2270')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .expect(200);

      expect(res.body.referralCode).toBe('DBS-2270');
      expect(res.body.referralLink).toBe('');
      expect(res.body.friends.length).toBe(2);

      const activeFriend = res.body.friends.find((f: any) => f.status === 'ACTIVE_DISCOUNT');
      expect(activeFriend).toBeDefined();
      expect(activeFriend.statusLabel).toContain('Desconto de 50%');
    });

    it('deve cadastrar um novo amigo indicado', async () => {
      const res = await request(app)
        .post('/api/referrals/2270')
        .set('Authorization', `Bearer ${tokenCliente2270}`)
        .send({
          referredName: 'Fernanda Caroline',
          referredPhone: '(49) 98811-2233',
        })
        .expect(201);

      expect(res.body.name).toBe('Fernanda Caroline');
      expect(res.body.status).toBe('PENDING_INSTALL');
    });
  });
});
