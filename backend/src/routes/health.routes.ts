import { Router, type Request, type Response } from 'express';
import { authMiddleware, requireAdmin } from '../middlewares/auth.middleware.js';
import { getDatabase } from '../database/db.js';
import { CONFIG, isPlaceholderSecret } from '../config/env.js';

function isIxcReady(): boolean {
  if (CONFIG.demoMode) return true;
  try {
    const url = new URL(CONFIG.ixc.baseUrl);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !isPlaceholderSecret(CONFIG.ixc.token);
  } catch {
    return false;
  }
}

function isAiReady(): boolean {
  if (CONFIG.demoMode || CONFIG.ai.provider === 'mock') return true;
  const geminiReady = !isPlaceholderSecret(CONFIG.ai.geminiApiKey);
  const openaiReady = !isPlaceholderSecret(CONFIG.ai.openaiApiKey);
  if (CONFIG.ai.provider === 'gemini') return geminiReady;
  if (CONFIG.ai.provider === 'openai') return openaiReady;
  return geminiReady && openaiReady;
}

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

    const ixcConfigured = isIxcReady();
    const aiConfigured = isAiReady();
    const ready = postgresConnected && ixcConfigured && aiConfigured;

    // Sem baseUrl, tokens, feature flags ou detalhes do motor de IA:
    // apenas flags agregadas das dependências necessárias para operar.
    return res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'degraded',
      dependencies: {
        postgres: postgresConnected,
        ixc: ixcConfigured,
        ai: aiConfigured,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
