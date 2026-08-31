import { Router, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { CONFIG } from '../config/env.js';

/**
 * Limiter estrito dedicado ao teste de velocidade: 10 requisições por hora por
 * IP. Cada medição transfere até 10 MB (download) e aceita até 15 MB de
 * upload; pelo antigo limite geral (120 req/min) um único IP conseguia puxar
 * ~720 MB/min. O middleware é aplicado ANTES do handler em GET e POST, então
 * nenhum byte de payload é servido a partir da 11ª requisição da janela.
 *
 * A chave usa o mesmo critério do limiter global (req.ip resolvida pelo trust
 * proxy; cf-connecting-ip apenas quando TRUST_CF_HEADERS=true declara que a
 * instância roda atrás da borda Cloudflare).
 */
const isCfHeaderTrusted = process.env.TRUST_CF_HEADERS === 'true';
const speedtestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: CONFIG.nodeEnv === 'production' ? 10 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator((isCfHeaderTrusted ? req.get('cf-connecting-ip') : undefined) || req.ip || '0.0.0.0'),
  message: {
    error: 'Limite de testes de velocidade excedido. Tente novamente em até 1 hora.',
    code: 'TOO_MANY_REQUESTS',
  },
});

/**
 * Teto do payload de download. O app móvel consome apenas 4 MB por medição
 * (services/api/support.ts), então 4 MB continuam medindo throughput real;
 * acima disso o endpoint era um amplificador gratuito de banda.
 */
const SPEEDTEST_MAX_BYTES = 4 * 1024 * 1024;

export function registerSystemRoutes(apiRouter: Router): void {
/**
 * ⚡ Endpoint ultra leve para Medição Real de Latência (Ping / Jitter)
 */
apiRouter.all('/system/ping', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  const now = Date.now();
  return res.json({
    pong: true,
    timestamp: now,
    serverTimestamp: now,
    serverTime: new Date(now).toISOString(),
    node: 'DBS-BFF-CORE-01',
    datacenter: 'Chapecó-SC (FTTH Backbone)',
  });
});

/**
 * ⚡ Endpoint para Teste Real de Velocidade / Throughput (Download Speed Test)
 */
apiRouter.get('/system/speedtest-payload', speedtestLimiter, (req: Request, res: Response) => {
  const sizeBytes = Math.min(Math.max(parseInt((req.query.size as string) || '1048576', 10) || 1048576, 1024), SPEEDTEST_MAX_BYTES);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Disposition', 'inline; filename="speedtest.bin"');
  res.setHeader('Content-Length', sizeBytes);

  // Transmite em chunks de 64 KiB em vez de alocar o payload inteiro de uma
  // vez, evitando que requisições simultâneas pressionem a memória do processo.
  const chunk = Buffer.alloc(64 * 1024, 0x41);

  // Workers sob cloudflare:node podem não expor o backpressure de socket da
  // mesma forma; um stream pull-based (ReadableStream) evita o busy-loop de
  // setImmediate. O loop manual permanece como fallback para runtimes puro Node.
  const supportsWebStreams = typeof ReadableStream !== 'undefined' && typeof res.write === 'function';
  if (supportsWebStreams) {
    let remaining = sizeBytes;
    const stream = new ReadableStream({
      // Apenas fecha o stream quando os bytes acabam; res.end() é sempre
      // responsabilidade do consumidor (pump), nunca do produtor — encerrar
      // aqui cortaria chunks ainda enfileirados antes do socket drenar.
      pull(controller) {
        if (remaining <= 0 || res.writableEnded || res.destroyed) { controller.close(); return; }
        const toWrite = Math.min(remaining, chunk.length);
        remaining -= toWrite;
        controller.enqueue(toWrite === chunk.length ? chunk : chunk.subarray(0, toWrite));
      },
    });
    // Conecta o web stream à resposta estilo Node sem depender de 'drain'.
    const reader = stream.getReader();
    const pump = (): Promise<void> =>
      reader.read().then(({ done, value }) => {
        if (done || res.writableEnded || res.destroyed) { reader.releaseLock(); res.end(); return; }
        return new Promise<void>((resolve) => {
          const ok = res.write(value);
          if (ok) resolve();
          else res.once('drain', resolve);
        }).then(pump);
      });
    void pump();
    return;
  }

  let remaining = sizeBytes;
  const writeNext = (): void => {
    if (remaining <= 0 || res.writableEnded) {
      res.end();
      return;
    }
    const toWrite = Math.min(remaining, chunk.length);
    remaining -= toWrite;
    if (!res.write(toWrite === chunk.length ? chunk : chunk.subarray(0, toWrite))) {
      res.once('drain', writeNext);
      return;
    }
    setImmediate(writeNext);
  };
  writeNext();
});

/**
 * ⚡ Endpoint para Teste Real de Velocidade de Envio (Upload Speed Test)
 */
apiRouter.post('/system/speedtest-payload', speedtestLimiter, (req: Request, res: Response) => {
  // O corpo já chegou bufferizado; o relógio honesto é o instante em que a
  // requisição entrou no servidor (req.startedAt), não o início deste handler.
  const startedAt = req.startedAt || Date.now();
  const rawLength = req.headers['content-length'] ? parseInt(req.headers['content-length'] as string, 10) : 0;
  const bodySize = Buffer.isBuffer(req.body)
    ? req.body.length
    : (rawLength > 0 ? rawLength : (req.body ? (typeof req.body === 'string' ? req.body.length : JSON.stringify(req.body).length) : 0));
  const elapsedMs = Math.max(1, Date.now() - startedAt);
  const throughputMbps = ((bodySize * 8) / (elapsedMs / 1000) / 1_000_000);

  return res.json({
    success: true,
    receivedBytes: bodySize,
    elapsedMs,
    throughputMbps: parseFloat(throughputMbps.toFixed(2)),
  });
});
}
