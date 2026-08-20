import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { apiRouter } from './routes/api.router.js';
import { CONFIG } from './config/env.js';
import { swaggerDocument, swaggerCustomOptions } from './docs/swagger.config.js';

export function createApp(): Express {
  const app = express();

  // Middlewares de Segurança e CORS
  app.use(cors({
    origin: CONFIG.corsOrigin === '*' ? true : CONFIG.corsOrigin,
    credentials: true,
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // 📖 Documentação Interativa Swagger / OpenAPI 3.0
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerCustomOptions));
  app.get('/api/docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.json(swaggerDocument);
  });
  app.get('/docs', (_req: Request, res: Response) => {
    res.redirect('/api/docs');
  });

  // Rate Limiting Tier 1: Proteção Geral da API (120 req/min)
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Limite de requisições excedido. Por favor, tente novamente em um minuto.' },
  });
  app.use('/api', generalLimiter);

  // Rate Limiting Tier 2: Proteção específica de IA e Chatbot (30 req/min)
  const chatAiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas mensagens enviadas em pouco tempo. Aguarde alguns segundos para continuar o atendimento.' },
  });
  app.use('/api/chat', chatAiLimiter);
  app.use('/api/ai', chatAiLimiter);

  // Rate Limiting Tier 3: Proteção de Autenticação e Login (10 req/min)
  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas tentativas de autenticação. Por favor, aguarde um minuto antes de tentar novamente.' },
  });
  app.use('/api/auth', authLimiter);

  // Logging simples de requisições
  app.use((req: Request, _res: Response, next: NextFunction) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl}`);
    next();
  });

  // Rotas da API
  app.use('/api', apiRouter);

  // Fallback 404
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
