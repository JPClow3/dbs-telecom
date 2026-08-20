import { Router, type Request, type Response } from 'express';

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
apiRouter.get('/system/speedtest-payload', (req: Request, res: Response) => {
  const sizeBytes = Math.min(Math.max(parseInt((req.query.size as string) || '1048576', 10), 1024), 10485760);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Content-Disposition', 'inline; filename="speedtest.bin"');
  res.setHeader('Content-Length', sizeBytes);

  const chunk = Buffer.alloc(sizeBytes, 0x41);
  return res.send(chunk);
});

/**
 * ⚡ Endpoint para Teste Real de Velocidade de Envio (Upload Speed Test)
 */
apiRouter.post('/system/speedtest-payload', (req: Request, res: Response) => {
  const start = Date.now();
  const rawLength = req.headers['content-length'] ? parseInt(req.headers['content-length'] as string, 10) : 0;
  const bodySize = Buffer.isBuffer(req.body)
    ? req.body.length
    : (rawLength > 0 ? rawLength : (req.body ? (typeof req.body === 'string' ? req.body.length : JSON.stringify(req.body).length) : 0));
  const elapsedMs = Math.max(1, Date.now() - start);
  const throughputMbps = ((bodySize * 8) / (elapsedMs / 1000) / 1_000_000);

  return res.json({
    success: true,
    receivedBytes: bodySize,
    elapsedMs,
    throughputMbps: parseFloat(throughputMbps.toFixed(2)),
  });
});
}

