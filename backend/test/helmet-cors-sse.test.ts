import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { queueService } from '../src/modules/queue/queue.service.js';
import { queueRepository } from '../src/modules/queue/queue.repository.js';

describe('🛡️ Suite de Helmet, CORS Restrito e SSE na Fila Virtual', () => {
  const app = createApp();

  beforeEach(async () => {
    await queueRepository.clearAll();
  });

  describe('🔒 1. Middlewares de Segurança Helmet', () => {
    it('deve incluir cabeçalhos essenciais de proteção HTTP nos endpoints', async () => {
      const res = await request(app).get('/api/system/ping');

      expect(res.status).toBe(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-dns-prefetch-control']).toBe('off');
      expect(res.headers['x-download-options']).toBe('noopen');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });

  describe('🌐 2. Política de CORS', () => {
    it('deve permitir requisições sem origin (apps mobile nativos e curl)', async () => {
      const res = await request(app)
        .get('/api/system/ping');

      expect(res.status).toBe(200);
      expect(res.body.pong).toBe(true);
    });

    it('deve permitir origens oficiais da DBS Telecom em requisições web', async () => {
      const res = await request(app)
        .get('/api/system/ping')
        .set('Origin', 'https://dbstelecom.com.br');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://dbstelecom.com.br');
    });

    it('deve permitir subdomínios oficiais da DBS Telecom (app e central)', async () => {
      const res = await request(app)
        .get('/api/system/ping')
        .set('Origin', 'https://app.dbstelecom.com.br');

      expect(res.status).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe('https://app.dbstelecom.com.br');
    });
  });

  describe('⚡ 3. Server-Sent Events (SSE) na Fila Virtual', () => {
    it('deve abrir stream SSE em /api/queue/stream/:clientId com headers adequados', (done) => {
      void queueService.joinQueue({
        sessionId: 'session-sse-01',
        clientId: '2270',
        clientName: 'Emanuel da Silva',
        department: 'COMERCIAL',
      }).then(() => {
      const req = request(app)
        .get('/api/queue/stream/2270')
        .expect(200)
        .expect('Content-Type', /^text\/event-stream/)
        .expect('Cache-Control', /no-cache/)
        .expect('Connection', 'keep-alive')
        .buffer(false);

      req.end((err, res) => {
        if (err) return done(err);

        let dataReceived = '';
        res.on('data', (chunk: Buffer) => {
          dataReceived += chunk.toString();
          if (dataReceived.includes('data:')) {
            expect(dataReceived).toContain('"inQueue":true');
            expect(dataReceived).toContain('Emanuel da Silva');
            res.destroy(); // Fecha a conexão
            done();
          }
        });
      });
      }).catch(done);
    });

    it('deve emitir atualizações reativas no SSE quando a fila avança', (done) => {
      void queueService.joinQueue({
        sessionId: 'session-sse-02',
        clientId: '2271',
        clientName: 'Cliente SSE 2',
        department: 'SUPORTE',
      }).then(() => {
      const req = request(app)
        .get('/api/queue/stream/2271')
        .expect(200)
        .buffer(false);

      req.end((err, res) => {
        if (err) return done(err);

        let count = 0;
        res.on('data', (chunk: Buffer) => {
          const str = chunk.toString();
          if (str.includes('data:')) {
            count++;
            if (count === 1) {
              // 1ª Mensagem recebida (estado inicial). Agora avança a fila!
              setTimeout(() => {
                void queueService.advanceQueue('2271');
              }, 50);
            } else if (count >= 2) {
              // 2ª Mensagem recebida via SSE reativo!
              expect(str).toContain('ASSIGNED');
              res.destroy();
              done();
            }
          }
        });
      });
      }).catch(done);
    });
  });

  describe('🚀 4. Throughput Tracker & SpeedTest Endpoints', () => {
    it('deve retornar ping e timestamp em GET /api/system/ping', async () => {
      const res = await request(app).get('/api/system/ping');
      expect(res.status).toBe(200);
      expect(res.body.pong).toBe(true);
      expect(typeof res.body.serverTimestamp).toBe('number');
    });

    it('deve gerar payload binário com tamanho configurável em GET /api/system/speedtest-payload', async () => {
      const res = await request(app)
        .get('/api/system/speedtest-payload?size=100000')
        .expect(200);

      expect(res.headers['content-type']).toContain('application/octet-stream');
      expect(Number(res.headers['content-length'])).toBe(100000);
      expect(res.body.length).toBe(100000);
    });

    it('deve receber payload de upload e calcular throughput em POST /api/system/speedtest-payload', async () => {
      const buffer = Buffer.alloc(100000, 0xaa);
      const res = await request(app)
        .post('/api/system/speedtest-payload')
        .set('Content-Type', 'application/octet-stream')
        .send(buffer)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.receivedBytes).toBe(100000);
      expect(res.body.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(typeof res.body.throughputMbps).toBe('number');
    });
  });
});
