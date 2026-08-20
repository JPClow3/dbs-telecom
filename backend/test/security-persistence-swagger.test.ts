import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { jwtService } from '../src/modules/auth/jwt.service.js';
import { chatService } from '../src/modules/chat/chat.service.js';
import { chatRepository } from '../src/modules/chat/chat.repository.js';
import { getDatabase, closeDatabase } from '../src/database/db.js';

const app = createApp();

describe('🔐 1. JWT Authentication & Anti-IDOR Security Suite', () => {
  const clientA = {
    id: '2270',
    cpfCnpj: '154.293.707-89',
    name: 'Emanuel da Silva',
  };

  const clientB = {
    id: '9999',
    cpfCnpj: '999.888.777-66',
    name: 'Cliente Hacker',
  };

  const tokenA = jwtService.generateToken({
    clientId: clientA.id,
    cpfCnpj: clientA.cpfCnpj,
    name: clientA.name,
    role: 'client',
  });

  const tokenB = jwtService.generateToken({
    clientId: clientB.id,
    cpfCnpj: clientB.cpfCnpj,
    name: clientB.name,
    role: 'client',
  });

  it('deve emitir token JWT válido no endpoint /api/auth/login', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ cpfCnpj: '154.293.707-89', password: '15429370789' });

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.expiresIn).toBeDefined();

    const decoded = jwtService.verifyToken(res.body.token);
    expect(decoded.clientId).toBeTruthy();
    expect(decoded.name).toBeTruthy();
  });

  it('deve rejeitar requisição sem token em rotas protegidas com HTTP 401', async () => {
    const res = await request(app).get('/api/financial/invoices/2270');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_MISSING');
  });

  it('deve rejeitar token corrompido ou forjado com HTTP 401', async () => {
    const res = await request(app)
      .get('/api/financial/invoices/2270')
      .set('Authorization', 'Bearer token_invalido_ou_forjado');

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('deve permitir que o Cliente A consulte suas próprias faturas (200 OK)', async () => {
    const res = await request(app)
      .get('/api/financial/invoices/2270')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.invoices).toBeDefined();
    expect(Array.isArray(res.body.invoices)).toBe(true);
  });

  it('deve permitir resolução automática do ID via alias "me" (200 OK)', async () => {
    const res = await request(app)
      .get('/api/financial/invoices/me')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.invoices).toBeDefined();
  });

  it('🛡️ ANTI-IDOR: deve BLOQUEAR com HTTP 403 quando Cliente A tenta consultar faturas do Cliente B', async () => {
    const res = await request(app)
      .get('/api/financial/invoices/9999')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IDOR_FORBIDDEN');
    expect(res.body.error).toContain('Anti-IDOR');
    expect(res.body.requestedClientId).toBe('9999');
    expect(res.body.authenticatedClientId).toBe('2270');
  });

  it('🛡️ ANTI-IDOR: deve BLOQUEAR com HTTP 403 tentativa de IDOR em chamados técnicos (/support/tickets/:clientId)', async () => {
    const res = await request(app)
      .get('/api/support/tickets/9999')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IDOR_FORBIDDEN');
  });

  it('🛡️ ANTI-IDOR: deve BLOQUEAR com HTTP 403 tentativa de IDOR em consumo de tráfego (/traffic/consumption/:clientId)', async () => {
    const res = await request(app)
      .get('/api/traffic/consumption/9999')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IDOR_FORBIDDEN');
  });

  it('🛡️ ANTI-IDOR: deve BLOQUEAR com HTTP 403 tentativa de IDOR no chat (/chat/message)', async () => {
    const res = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        sessionId: 'session-attacker',
        clientId: '9999',
        message: 'Quero faturas',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IDOR_FORBIDDEN');
  });

  it('🛡️ ANTI-IDOR: deve BLOQUEAR com HTTP 403 tentativa de IDOR no desbloqueio em confiança (/financial/unblock-promise)', async () => {
    const res = await request(app)
      .post('/api/financial/unblock-promise')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        clientId: '9999',
      });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('IDOR_FORBIDDEN');
  });
});

describe('💾 2. SQLite Database & Chat History Persistence Suite', () => {
  beforeEach(() => {
    chatRepository.clearAll();
  });

  it('deve criar e persistir uma nova sessão no banco de dados SQLite', () => {
    const session = chatRepository.getOrCreateSession('session-test-sql-1', '2270', 'Emanuel da Silva');
    expect(session.sessionId).toBe('session-test-sql-1');
    expect(session.clientId).toBe('2270');
    expect(session.clientName).toBe('Emanuel da Silva');
    expect(session.currentDepartment).toBe('GERAL');

    // Consulta direta no SQLite
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM chat_sessions WHERE session_id = ?').get('session-test-sql-1') as any;
    expect(row).toBeDefined();
    expect(row.client_id).toBe('2270');
  });

  it('deve persistir mensagens de usuário e robô com cards contextuais no SQLite', () => {
    const sessionId = 'session-test-sql-2';
    chatRepository.getOrCreateSession(sessionId, '2270', 'Emanuel');

    chatRepository.addMessage(sessionId, {
      id: 'msg-1',
      sender: 'USER',
      text: 'Preciso do meu boleto',
      timestamp: '2026-08-20T00:00:01.000Z',
    });

    chatRepository.addMessage(sessionId, {
      id: 'msg-2',
      sender: 'BOT',
      text: 'Localizei sua fatura no valor de R$ 119,90.',
      timestamp: '2026-08-20T00:00:02.000Z',
      department: 'FINANCEIRO',
      cards: {
        type: 'INVOICE',
        invoices: [
          {
            id: '145690',
            documento: '71820',
            valor: 119.9,
            valorFormatado: 'R$ 119,90',
            dataEmissao: '2026-08-10',
            dataVencimento: '2026-09-10',
            dataVencimentoFormatada: '10/09/2026',
            status: 'PENDENTE',
            linhaDigitavel: '04790000020000014569803047711654260000011990',
            linhaDigitavelFormatada: '04790.00002 00000.145698 03047.711654 2 60000011990',
            pixCopiaECola: 'pix-test-payload',
            isOverdue: false,
          },
        ],
      },
    });

    const history = chatRepository.getSessionHistory(sessionId);
    expect(history.length).toBe(2);
    expect(history[0].sender).toBe('USER');
    expect(history[0].text).toBe('Preciso do meu boleto');
    expect(history[1].sender).toBe('BOT');
    expect(history[1].department).toBe('FINANCEIRO');
    expect(history[1].cards?.type).toBe('INVOICE');
    expect(history[1].cards?.invoices?.[0].valorFormatado).toBe('R$ 119,90');
  });

  it('deve manter o histórico intacto após recriar a instância do ChatService (Simulação de Restart)', async () => {
    const sessionId = 'session-restart-simulation';
    const clientId = '2270';

    // 1. Processa mensagem através do ChatService
    const res1 = await chatService.processMessage(sessionId, 'Minha internet está lenta 🛠️', clientId);
    expect(res1.department).toBe('SUPORTE');

    // 2. Simula "queda e reinício do servidor" limpando o cache em memória do ChatService
    (chatService as any).sessions.clear();

    // 3. Ao consultar o histórico da sessão, deve carregar perfeitamente do SQLite
    const history = chatService.getSessionHistory(sessionId);
    expect(history.length).toBeGreaterThanOrEqual(2); // Usuário + Bot
    expect(history[0].text).toBe('Minha internet está lenta 🛠️');
    expect(history[1].department).toBe('SUPORTE');
  });

  it('deve recuperar histórico via endpoint REST /api/chat/history/:sessionId', async () => {
    const sessionId = 'session-rest-history';
    const clientId = '2270';
    const token = jwtService.generateToken({ clientId, cpfCnpj: '154.293.707-89', name: 'Emanuel', role: 'client' });

    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ sessionId, message: 'olá', clientId });

    const res = await request(app)
      .get(`/api/chat/history/${sessionId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBe(sessionId);
    expect(res.body.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(res.body.history)).toBe(true);
  });
});

describe('📖 3. Interactive Swagger / OpenAPI 3.0 Documentation Suite', () => {
  it('deve servir a interface interativa Swagger UI em /api/docs com status 200 e HTML', async () => {
    const res = await request(app).get('/api/docs/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('swagger-ui');
  });

  it('deve redirecionar /docs para /api/docs', async () => {
    const res = await request(app).get('/docs');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/api/docs');
  });

  it('deve servir a especificação OpenAPI 3.0 em JSON em /api/docs.json', async () => {
    const res = await request(app).get('/api/docs.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');

    const spec = res.body;
    expect(spec.openapi).toBe('3.0.3');
    expect(spec.info.title).toContain('DBS Telecom');
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
    expect(spec.paths['/auth/login']).toBeDefined();
    expect(spec.paths['/financial/invoices/{clientId}']).toBeDefined();
    expect(spec.paths['/chat/message']).toBeDefined();
  });
});
