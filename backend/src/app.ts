import express, { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { apiRouter } from './routes/api.router.js';
import { CONFIG, validateEnv } from './config/env.js';
import { swaggerDocument } from './docs/swagger.config.js';

declare global {
  namespace Express {
    interface Request {
      /** Exact JSON bytes used to verify signed provider webhooks. */
      rawBody?: Buffer;
    }
  }
}

export function createApp(): Express {
  // Keep programmatic starts (tests, workers, serverless adapters) subject to
  // the same production secret gate as src/server.ts.
  if (CONFIG.nodeEnv === 'production') validateEnv();
  const app = express();
  const rateLimitKey = (req: Request): string => {
    const cloudflareIp = req.get('cf-connecting-ip') || req.get('x-forwarded-for')?.split(',')[0]?.trim();
    return ipKeyGenerator(cloudflareIp || req.ip || '0.0.0.0');
  };

  // 🛡️ Middlewares de Proteção HTTP (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Permite Swagger UI e bundles web estáticos
      crossOriginEmbedderPolicy: false,
    })
  );

  // 🌐 Política de CORS Restrita para Produção
  const allowedProductionOrigins = [
    'https://dbstelecom.com.br',
    'https://www.dbstelecom.com.br',
    'https://app.dbstelecom.com.br',
    'https://central.dbstelecom.com.br',
    'https://sac.dbstelecom.com.br',
    ...(CONFIG.corsOrigin !== '*' ? CONFIG.corsOrigin.split(',').map((s) => s.trim()) : []),
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        // 1. Requisições sem origin (como apps mobile nativos, curl, Postman, tarefas de background)
        if (!origin) {
          return callback(null, true);
        }

        // 2. Em ambiente de desenvolvimento / teste, permite origens locais e ferramentas de debug
        if (CONFIG.nodeEnv !== 'production') {
          if (
            CONFIG.corsOrigin === '*' ||
            origin.includes('localhost') ||
            origin.includes('127.0.0.1') ||
            origin.startsWith('exp://') ||
            origin.startsWith('http://localhost')
          ) {
            return callback(null, true);
          }
        }

        // 3. Em produção, valida estritamente os domínios oficiais da DBS Telecom
        const isAllowed = allowedProductionOrigins.some(
          (allowed) => origin === allowed || (allowed.startsWith('*.') && origin.endsWith(allowed.slice(1)))
        );

        if (isAllowed) {
          return callback(null, true);
        }

        return callback(
          new Error(`[CORS Blocked] Origem '${origin}' não autorizada pelas políticas de segurança da DBS Telecom.`)
        );
      },
      credentials: true,
    })
  );

  app.use(express.raw({ type: 'application/octet-stream', limit: '15mb' }));
  app.use(express.json({
    limit: '15mb',
    verify: (req, _res, buffer) => {
      (req as Request).rawBody = Buffer.from(buffer);
    },
  }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // 📖 OpenAPI document. The full Swagger UI package reads its assets via
  // __dirname, which is not available in a Worker module; keep a portable
  // documentation landing page and expose the authoritative OpenAPI document.
  app.get('/api/docs', (_req: Request, res: Response) => {
    res.type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DBS Telecom API</title></head><body><main><h1>DBS Telecom API</h1><p>Especificação OpenAPI disponível em <a href="/api/docs.json">/api/docs.json</a>.</p><p class="swagger-ui">Use um cliente compatível com Swagger UI para explorar a especificação.</p></main></body></html>`);
  });
  app.get('/api/docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerDocument);
  });
  app.get('/docs', (_req: Request, res: Response) => {
    res.redirect('/api/docs');
  });

  // Rate Limiting Configurado para Produção com tolerância para Testes e Dev
  const isDevOrTest = process.env.NODE_ENV !== 'production';

  // Rate Limiting Tier 1: Proteção Geral da API
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isDevOrTest ? 5000 : 120,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    message: { error: 'Limite de requisições excedido. Por favor, tente novamente em um minuto.' },
  });
  app.use('/api', generalLimiter);

  // Rate Limiting Tier 2: Proteção específica de IA e Chatbot
  const chatAiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isDevOrTest ? 5000 : 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    message: { error: 'Muitas mensagens enviadas em pouco tempo. Aguarde alguns segundos para continuar o atendimento.' },
  });
  app.use('/api/chat', chatAiLimiter);
  app.use('/api/ai', chatAiLimiter);

  // Rate Limiting Tier 3: Proteção de Autenticação e Login
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: isDevOrTest ? 5000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    message: { error: 'Muitas tentativas de autenticação. Por favor, aguarde um minuto antes de tentar novamente.' },
  });
  app.use('/api/auth', authLimiter);

  // Logging simples de requisições
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.originalUrl.startsWith('/_expo') && !req.originalUrl.endsWith('.ico') && !req.originalUrl.endsWith('.js') && !req.originalUrl.endsWith('.png')) {
      console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
    }
    next();
  });

  // Rotas da API
  app.use('/api', apiRouter);

  // The API runs in Cloudflare Workers as well as locally. Workers do not
  // have a project filesystem, so the optional Expo static hosting stays a
  // Node-only convenience; publish the mobile web build independently.
  const isCloudflareWorkerRuntime = typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';
  if (!isCloudflareWorkerRuntime) {
    const candidateDistPaths = [
      path.resolve(process.cwd(), '../mobile/dist'),
      path.resolve(process.cwd(), 'mobile/dist'),
      path.resolve(process.cwd(), 'dist'),
    ];
    const mobileDistPath = candidateDistPaths.find((candidate) => fs.existsSync(candidate));

    if (mobileDistPath) {
      app.use(express.static(mobileDistPath));
      app.get('*', (req: Request, res: Response, next: NextFunction) => {
        if (req.path.startsWith('/api') || req.path.startsWith('/docs')) return next();
        const indexPath = path.join(mobileDistPath, 'index.html');
        return fs.existsSync(indexPath) ? res.sendFile(indexPath) : next();
      });
    }
  }

  // Fallback 404 para rotas API
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint não encontrado no backend DBS Telecom.' });
  });

  // Tratamento Global de Erros
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[GlobalErrorHandler]', err);
    res.status(500).json({ error: 'Erro interno no servidor', message: err.message });
  });

  return app;
}
