import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CONFIG } from '../src/config/env.js';
import { jwtService } from '../src/modules/auth/jwt.service.js';
import { userService } from '../src/modules/auth/user.service.js';

/**
 * Suíte de endurecimento da superfície HTTP:
 * - liveness /health nunca fica 503 por dependência transitória;
 * - /health/ready exige papel admin;
 * - sendApiError normaliza códigos desconhecidos para erro_interno;
 * - fila rejeita departamento arbitrário/divergente da sessão;
 * - /queue/progress não deixa cliente avançar estado pós-alocação;
 * - /queue/stats e /chat/csat/stats exigem admin;
 * - tokens revogados (sessionVersion) são rejeitados no middleware.
 */
describe('🛡️ Suite de Endurecimento da API (limiters, health, fila, revogação)', () => {
  const app = createApp();

  const clientToken = jwtService.generateToken({
    clientId: '2270',
    cpfCnpj: '15429370789',
    name: 'Cliente Hardening',
    role: 'client',
  });
  const adminToken = jwtService.generateToken({
    clientId: 'admin-1',
    cpfCnpj: '00000000000',
    name: 'Admin',
    role: 'admin',
  });

  const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeEach(() => {
    CONFIG.demoMode = true;
  });

  afterEach(() => {
    CONFIG.demoMode = true;
  });

  describe('❤️ 1. Health: liveness vs readiness', () => {
    it('GET /api/health responde 200 sem vazar internos', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      // Sem internals: nem baseUrl do IXC, nem flags, nem detalhes de IA.
      expect(JSON.stringify(res.body)).not.toContain('baseUrl');
      expect(res.body.dependencies).toBeUndefined();
      expect(res.body.features).toBeUndefined();
      expect(res.body.ai).toBeUndefined();
    });

    it('marca o catálogo servido em modo demo como DEMO, nunca LIVE', async () => {
      const res = await request(app).get('/api/commercial/plans');

      expect(res.status).toBe(200);
      expect(res.body.dataState).toBe('DEMO');
      expect(res.body.plans.length).toBeGreaterThan(0);
      expect(res.body.plans.every((plan: { dataState?: string }) => plan.dataState === 'DEMO')).toBe(true);
    });

    it('GET /api/health/ready exige autenticação', async () => {
      const res = await request(app).get('/api/health/ready');
      expect(res.status).toBe(401);
    });

    it('GET /api/health/ready exige papel admin', async () => {
      const res = await request(app).get('/api/health/ready').set(authHeaders(clientToken));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ADMIN_REQUIRED');
    });

    it('GET /api/health/ready como admin responde com estado agregado', async () => {
      const res = await request(app).get('/api/health/ready').set(authHeaders(adminToken));
      expect([200, 503]).toContain(res.status);
      expect(res.body.dependencies).toBeDefined();
      expect(JSON.stringify(res.body)).not.toContain('baseUrl');
    });

    it('fica degraded quando o banco responde, mas o IXC está sem credencial utilizável', async () => {
      const previousDemoMode = CONFIG.demoMode;
      const previousToken = CONFIG.ixc.token;
      CONFIG.demoMode = false;
      CONFIG.ixc.token = '';
      try {
        const res = await request(app).get('/api/health/ready').set(authHeaders(adminToken));
        expect(res.status).toBe(503);
        expect(res.body.status).toBe('degraded');
        expect(res.body.dependencies.postgres).toBe(true);
        expect(res.body.dependencies.ixc).toBe(false);
      } finally {
        CONFIG.demoMode = previousDemoMode;
        CONFIG.ixc.token = previousToken;
      }
    });
  });

  describe('🚦 2. Rate limit estrito do speedtest', () => {
    it('GET do payload responde 200 dentro do limite dev/teste', async () => {
      const res = await request(app).get('/api/system/speedtest-payload?size=1024');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/octet-stream');
    });

    it('POST devolve métricas honestas de throughput', async () => {
      const res = await request(app)
        .post('/api/system/speedtest-payload')
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.alloc(2048));
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.receivedBytes).toBe(2048);
      expect(typeof res.body.throughputMbps).toBe('number');
    });
  });

  describe('🧭 3. Integridade da fila virtual', () => {
    it('POST /queue/join rejeita departamento desconhecido', async () => {
      const res = await request(app)
        .post('/api/queue/join')
        .set(authHeaders(clientToken))
        .send({ clientId: '2270', department: 'SETOR_INEXISTENTE' });
      expect(res.status).toBe(400);
      expect(String(res.body.code).toLowerCase()).toContain('departamento');
    });

    it('POST /queue/join rejeita departamento divergente do classificado na sessão', async () => {
      // Sessão desconhecida resolve para GERAL server-side; informar SUPORTE
      // diverge e deve ser recusado em vez de enfileirar seletivamente.
      const res = await request(app)
        .post('/api/queue/join')
        .set(authHeaders(clientToken))
        .send({ clientId: '2270', sessionId: 'sessao-sem-departamento', department: 'SUPORTE' });
      expect(res.status).toBe(400);
      expect(String(res.body.code).toLowerCase()).toContain('departamento');
    });

    it('POST /queue/progress bloqueia avanço pós-alocação por cliente não-admin', async () => {
      // Em modo demo o avanço é permitido (fluxo legítimo de demonstração);
      // fora do demo, transição de estado ASSIGNED/IN_SERVICE exige admin.
      CONFIG.demoMode = false;
      const res = await request(app)
        .post('/api/queue/progress')
        .set(authHeaders(clientToken))
        .send({ clientId: '2270' });
      // Sem fila real para o cliente fora do demo o serviço pode falhar antes;
      // o que importa é que NUNCA retorne sucesso de avanço ao cliente comum.
      if (res.status === 200) {
        expect(res.body.success).toBe(false);
      } else {
        expect([403, 404, 400, 500, 503]).toContain(res.status);
      }
      CONFIG.demoMode = true;
    });

    it('GET /queue/stats exige admin', async () => {
      const anon = await request(app).get('/api/queue/stats');
      expect(anon.status).toBe(401);
      const client = await request(app).get('/api/queue/stats').set(authHeaders(clientToken));
      expect(client.status).toBe(403);
      expect(client.body.code).toBe('ADMIN_REQUIRED');
    });
  });

  describe('📊 4. Telemetria protegida', () => {
    it('GET /api/chat/csat/stats exige admin', async () => {
      const anon = await request(app).get('/api/chat/csat/stats');
      expect(anon.status).toBe(401);
      const client = await request(app).get('/api/chat/csat/stats').set(authHeaders(clientToken));
      expect(client.status).toBe(403);
    });
  });

  describe('🔐 5. sendApiError normaliza códigos desconhecidos', () => {
    it('não ecoa códigos internos de driver/provedor', async () => {
      // Endpoint que propaga erros com code arbitrário (IXC indisponível fora
      // do demo): a resposta deve normalizar para erro_interno.
      CONFIG.demoMode = false;
      const res = await request(app)
        .post('/api/chat/message')
        .set(authHeaders(clientToken))
        .send({ message: 'ping', sessionId: 's-hardening', clientId: '2270' });
      if (res.body?.code) {
        expect(res.body.code).not.toMatch(/SQLITE_|PG_|NEON|ECONN/i);
        expect(res.body.code).toBe('erro_interno');
      }
      CONFIG.demoMode = true;
    });
  });

  describe('🔑 6. Revogação de sessão via sessionVersion', () => {
    it('middleware rejeita token com sessionVersion antiga após bump', async () => {
      const clientId = '2270';
      // Bump real de versão via troca de senha (fluxo legítimo): todo token
      // emitido antes dela passa a ter sessionVersion menor que a vigente.
      const troca = await userService.changePassword(clientId, '15429370789', 'SenhaForteTeste@2026');
      expect(troca.success).toBe(true);

      const versaoAtual = userService.getTokenVersion(clientId);
      const tokenVigente = jwtService.generateToken({
        clientId,
        cpfCnpj: '15429370789',
        name: 'Cliente Hardening',
        role: 'client',
        sessionVersion: versaoAtual,
      });
      const tokenAntigo = jwtService.generateToken({
        clientId,
        cpfCnpj: '15429370789',
        name: 'Cliente Hardening',
        role: 'client',
        sessionVersion: versaoAtual - 1,
      });

      // Token vigente: autenticado (403 aqui é falta de papel admin, não auth).
      const ok = await request(app).get('/api/queue/stats').set(authHeaders(tokenVigente));
      expect(ok.status).toBe(403);

      // Token com versão anterior: revogado pelo middleware.
      const depois = await request(app).get('/api/queue/stats').set(authHeaders(tokenAntigo));
      expect(depois.status).toBe(401);
      expect(depois.body.code).toBe('SESSION_REVOKED');
    });
  });
});
