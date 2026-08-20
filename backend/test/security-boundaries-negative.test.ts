import crypto from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CONFIG } from '../src/config/env.js';
import { jwtService } from '../src/modules/auth/jwt.service.js';
import { ixcCache } from '../src/modules/ixc/ixc.cache.js';
import { ixcService, IXCUnavailableError } from '../src/modules/ixc/ixc.service.js';
import { financialService } from '../src/modules/financial/financial.service.js';
import { userRepository } from '../src/modules/auth/user.repository.js';
import { userService } from '../src/modules/auth/user.service.js';
import { chatRepository } from '../src/modules/chat/chat.repository.js';

const app = createApp();
const clientToken = jwtService.generateToken({
  clientId: '2270',
  cpfCnpj: '15429370789',
  name: 'Cliente de teste',
  role: 'client',
});
const otherToken = jwtService.generateToken({
  clientId: '9999',
  cpfCnpj: '99999999999',
  name: 'Outro cliente',
  role: 'client',
});
const adminToken = jwtService.generateToken({
  clientId: 'admin',
  cpfCnpj: 'internal',
  name: 'Administrator',
  role: 'admin',
});

describe('negative security and truthfulness boundaries', () => {
  afterEach(async () => {
    CONFIG.demoMode = true;
    CONFIG.pix.webhookSecret = '';
    CONFIG.ixc.token = '';
    financialService.clearPixEventClaims();
    ixcCache.clear();
    await userRepository.clearAll();
    await chatRepository.clearAll();
  });

  it('does not expose user sync or user listings to a client token', async () => {
    const sync = await request(app)
      .post('/api/auth/sync-users')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ limit: 1 });
    expect(sync.status).toBe(403);
    expect(sync.body.code).toBe('ADMIN_REQUIRED');

    const list = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(list.status).toBe(403);
    expect(list.body.code).toBe('ADMIN_REQUIRED');
  });

  it('redacts password material even from the admin user listing', async () => {
    CONFIG.demoMode = true;
    await request(app)
      .post('/api/auth/sync-users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ limit: 1 })
      .expect(200);
    const list = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.users[0]).not.toHaveProperty('passwordHash');
    expect(list.body.users[0]).not.toHaveProperty('defaultPasswordCpf');
  });

  it('does not let a client read another client chat session', async () => {
    await chatRepository.getOrCreateSession('private-session', '9999', 'Other client');
    const response = await request(app)
      .get('/api/chat/history/private-session')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('CHAT_SESSION_FORBIDDEN');
  });

  it('stores only OTP hashes and locks verification after repeated guesses', async () => {
    const requested = await userService.requestOtp('154.293.707-89', 'SMS');
    expect(requested.success).toBe(true);

    const row = await (await import('../src/database/db.js')).getDatabase()
      .prepare('SELECT code, code_hash, attempts FROM otp_codes ORDER BY created_at DESC LIMIT 1')
      .get() as { code: string; code_hash: string; attempts: number };
    expect(row.code).toBe('[REDACTED]');
    expect(row.code_hash).toMatch(/^[a-f0-9]+:[a-f0-9]{64}$/);

    for (let i = 0; i < 5; i += 1) {
      const invalid = await userService.verifyOtp('154.293.707-89', '000000');
      expect(invalid.success).toBe(false);
    }
    const correctAfterLock = await userService.verifyOtp('154.293.707-89', userService.getDemoOtpCode('15429370789')!);
    expect(correctAfterLock.success).toBe(false);
    await expect((await import('../src/database/db.js')).getDatabase()
      .prepare('SELECT attempts FROM otp_codes ORDER BY created_at DESC LIMIT 1').get()).resolves.toMatchObject({ attempts: 5 });
  });

  it('requires authentication for invoice PDFs, AI classification, and payment streams', async () => {
    const pdf = await request(app).get('/api/financial/invoices/invoice-1/pdf');
    expect(pdf.status).toBe(401);

    const classify = await request(app)
      .post('/api/ai/classify')
      .send({ message: 'boleto' });
    expect(classify.status).toBe(401);

    CONFIG.demoMode = false;
    const stream = await request(app).get('/api/financial/pix/stream/2270');
    expect(stream.status).toBe(401);
  });

  it('rejects unsigned, stale, invalid, and replayed PIX webhooks', async () => {
    CONFIG.demoMode = false;
    CONFIG.pix.webhookSecret = 'local-test-webhook-secret-with-at-least-32-chars';
    const rawBody = JSON.stringify({
      invoiceId: 'invoice-1',
      clientId: '2270',
      amount: 100,
      txid: 'txid-negative-boundary-1',
    });

    const unsigned = await request(app)
      .post('/api/financial/pix/webhook')
      .set('Content-Type', 'application/json')
      .send(rawBody);
    expect(unsigned.status).toBe(401);

    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHmac('sha256', CONFIG.pix.webhookSecret).update(rawBody).digest('hex');
    const stale = await request(app)
      .post('/api/financial/pix/webhook')
      .set('Content-Type', 'application/json')
      .set('x-pix-signature', signature)
      .set('x-pix-timestamp', String(timestamp - 3600))
      .send(rawBody);
    expect(stale.status).toBe(401);

    const valid = await request(app)
      .post('/api/financial/pix/webhook')
      .set('Content-Type', 'application/json')
      .set('x-pix-signature', signature)
      .set('x-pix-timestamp', String(timestamp))
      .send(rawBody);
    expect(valid.status).toBe(200);
    expect(valid.body.status).toBe('PAGO');

    const replay = await request(app)
      .post('/api/financial/pix/webhook')
      .set('Content-Type', 'application/json')
      .set('x-pix-signature', signature)
      .set('x-pix-timestamp', String(timestamp))
      .send(rawBody);
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe('PIX_REPLAY_REJECTED');
  });

  it('fails closed when IXC is not configured instead of returning demo data or success', async () => {
    CONFIG.demoMode = false;
    CONFIG.ixc.token = '';
    await expect(ixcService.findClientById('2270')).rejects.toBeInstanceOf(IXCUnavailableError);
    await expect(financialService.getInvoicesByClientId('2270')).rejects.toMatchObject({ code: 'IXC_UNAVAILABLE' });
    await expect(ixcService.createTicket({
      id_cliente: '2270',
      assunto: 'Test',
      mensagem: 'Test',
    })).rejects.toMatchObject({ code: 'IXC_UNAVAILABLE' });
    await expect(ixcService.unblockPromise('2270')).rejects.toMatchObject({ code: 'IXC_UNAVAILABLE' });
  });

  it('does not expose synthetic enterprise adapters as live production integrations', async () => {
    CONFIG.demoMode = false;

    for (const path of [
      '/api/wifi/settings/2270',
      '/api/optical/diagnostics/2270',
      '/api/referrals/2270',
    ]) {
      const response = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${clientToken}`);
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        code: 'PROVIDER_NOT_CONFIGURED',
        dataState: 'UNAVAILABLE',
      });
    }

    const wifiMutation = await request(app)
      .post('/api/wifi/restart/2270')
      .set('Authorization', `Bearer ${clientToken}`);
    expect(wifiMutation.status).toBe(503);
    expect(wifiMutation.body.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('restricts synthetic notification injection to administrators', async () => {
    const response = await request(app)
      .post('/api/notifications/simulate')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ clientId: '2270', type: 'GENERAL', title: 'Fake', body: 'Fake' });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ADMIN_REQUIRED');
  });
});
