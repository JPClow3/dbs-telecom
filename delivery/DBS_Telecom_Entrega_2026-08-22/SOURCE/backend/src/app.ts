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
      /** Monotonic-ish arrival timestamp used for honest throughput metrics. */
      startedAt?: number;
    }
    interface Response {
      /** Marcado quando a resposta pertence a um stream SSE persistente. */
      isSse?: boolean;
    }
  }
}

/**
 * Registro central de respostas SSE ativas. O server.ts percorre este conjunto
 * durante o desligamento gracioso (SIGTERM/SIGINT): novas conexões param de ser
 * aceitas, os streams em andamento recebem uma janela de carência e depois são
 * encerrados — sem cortar SSEs no meio do deploy com um process.exit() seco.
 */
const activeSseResponses = new Set<Response>();

export function registerSseResponse(res: Response): void {
  activeSseResponses.add(res);
  res.on('close', () => activeSseResponses.delete(res));
}

export function getActiveSseCount(): number {
  return activeSseResponses.size;
}

/** Encerra todos os streams SSE remanescentes (fase final do shutdown). */
export function destroyAllSseResponses(): void {
  for (const res of Array.from(activeSseResponses)) {
    try {
      if (!res.writableEnded) res.end();
      const socket = (res as unknown as { socket?: { destroy?: () => void } }).socket;
      socket?.destroy?.();
    } catch {
      // Socket já morto; nada a fazer.
    }
  }
  activeSseResponses.clear();
}

export function createApp(): Express {
  // Keep programmatic starts (tests, workers, serverless adapters) subject to
  // the same production secret gate as src/server.ts.
  if (CONFIG.nodeEnv === 'production') validateEnv();

  const app = express();

  // Proxy reverso: apenas em produção, atrás de um proxy conhecido, habilitamos
  // `trust proxy = 1` para que a req.ip reflita o cliente real vindo de
  // X-Forwarded-For. Em desenvolvimento/teste o app costuma ficar exposto
  // diretamente; confiar nesse cabeçalho nesses cenários permitiria que
  // qualquer cliente forjasse seu IP para burlar o rate limit.
  if (CONFIG.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  /**
   * Chave de identidade do cliente para rate limiting.
   *
   * O cabeçalho cf-connecting-ip só é honrado quando o operador declara
   * explicitamente (via TRUST_CF_HEADERS=true) que esta instância roda atrás da
   * borda Cloudflare. Em Node/Docker puro qualquer cliente pode forjar esse
   * header e rotacionar identidades para escapar do limite; nesses casos a
   * identidade vem exclusivamente de req.ip resolvida pelo trust proxy acima.
   */
  const isCfHeaderTrusted = process.env.TRUST_CF_HEADERS === 'true';
  const rateLimitKey = (req: Request): string => {
    const cloudflareIp = isCfHeaderTrusted ? req.get('cf-connecting-ip') : undefined;
    return ipKeyGenerator(cloudflareIp || req.ip || '0.0.0.0');
  };

  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.startedAt = Date.now();
    next();
  });

  // 🛡️ Middlewares de Proteção HTTP (Helmet)
  //
  // CSP habilitada para o build web hospedado (mobile/dist), que renderiza
  // texto digitado por usuários e saída de LLM — sem ela, qualquer injeção de
  // <script> nesse conteúdo rodaria na origem da API. O bundle Expo é servido
  // como script próprio (/­_expo/static/js/...), sem scripts inline; estilos
  // são injetados dinamicamente pelo react-native-web, exigindo
  // 'unsafe-inline' em style-src (padrão confirmado no dist/index.html).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          scriptSrcAttr: ["'none'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'self'"],
          formAction: ["'self'"],
        },
      },
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
  // A documentação pública agora passa pelo limiter geral: antes disso
  // /api/docs e /api/docs.json eram montados ANTES dele e podiam ser raspados
  // sem controle de taxa algum.
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

  // 📖 OpenAPI document. The full Swagger UI package reads its assets via
  // __dirname, which is not available in a Worker module; keep a portable
  // documentation landing page and expose the authoritative OpenAPI document.
  // Movidos para DEPOIS dos limiters: documentação pública não deve ser servida
  // fora do controle de taxa.
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

  // Rate Limiting Tier 4 (estrito): Teste de Velocidade.
  //
  // Cada medição transfere até 10 MB no download + até 15 MB aceitos no
  // upload; pelo antigo limite geral (120 req/min) um único IP conseguia puxar
  // ~720 MB/min. O limite dedicado de 10 req/hora por IP vive em
  // system.routes.ts e é aplicado ANTES de servir qualquer byte do payload,
  // envolvendo tanto o GET quanto o POST do speedtest.

  // Logging simples de requisições
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (!req.originalUrl.startsWith('/_expo') && !req.originalUrl.endsWith('.ico') && !req.originalUrl.endsWith('.js') && !req.originalUrl.endsWith('.png')) {
      console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
    }
    next();
  });

  // Rotas da API (o limiter estrito do speedtest é acoplado dentro do router
  // de sistema, envolvendo GET e POST do payload).
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

    // Erros de middleware (ex.: CORS bloqueado, body JSON malformado) carregam
    // status próprio; falhas de rota podem expor err.status/err.statusCode.
    const status = Number(err?.status || err?.statusCode) || 500;
    const isClientError = status >= 400 && status < 500;
    const knownErrorCodes = ['IXC_UNAVAILABLE', 'INVOICE_NOT_FOUND', 'PROVIDER_NOT_CONFIGURED'];
    const code = knownErrorCodes.includes(err?.code) ? err.code : undefined;

    // Detalhes internos (stack, mensagem de driver) nunca vazam em produção.
    const exposeDetail = CONFIG.nodeEnv !== 'production' || isClientError;
    res.status(status).json({
      error: exposeDetail && err?.message ? err.message : isClientError ? 'Requisição inválida.' : 'Erro interno no servidor.',
      ...(code ? { code } : {}),
    });
  });

  return app;
}
