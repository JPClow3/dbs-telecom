import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireAdmin } from '../middlewares/auth.middleware.js';
import { getDatabase } from '../database/db.js';

/**
 * Liveness: responde 200 se o processo está de pé. Intencionalmente NÃO
 * consulta dependências — um ping de banco transitório não deve derrubar
 * orquestradores/healthchecks e causar flap-restart em loop.
 */
export function registerHealthRoutes(apiRouter: Router): void {
  apiRouter.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      system: 'DBS Telecom Smart Service BFF',
      timestamp: new Date().toISOString(),
    });
  });

/**
 * Readiness: verifica dependências reais (PostgreSQL/Neon). Requer papel
 * admin — os detalhes internos (flags, provedores, baseUrl) não são mais
 * expostos a chamadores anônimos.
 */
  apiRouter.get('/health/ready', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
    let postgresConnected = false;
    try {
      await getDatabase().prepare('SELECT 1 AS connected').get();
      postgresConnected = true;
    } catch (error) {
      console.error('[Health] PostgreSQL/Neon indisponível:', error);
    }

    // Sem baseUrl do IXC, sem feature flags, sem detalhes do motor de IA:
    // apenas o estado agregado das dependências para operação.
    return res.status(postgresConnected ? 200 : 503).json({
      status: postgresConnected ? 'ready' : 'degraded',
      dependencies: {
        postgres: postgresConnected,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
