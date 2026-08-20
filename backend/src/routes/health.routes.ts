import { Router, type Request, type Response } from 'express';
import { ixcService } from '../modules/ixc/ixc.service.js';
import { geminiProvider } from '../modules/ai/gemini.provider.js';
import { CONFIG } from '../config/env.js';
import { getDatabase } from '../database/db.js';

export function registerHealthRoutes(apiRouter: Router): void {
/**
 * Health check & status da conexão IXC e Motor de IA Gemini
 */
apiRouter.get('/health', async (_req: Request, res: Response) => {
  let postgresConnected = false;
  try {
    await getDatabase().prepare('SELECT 1 AS connected').get();
    postgresConnected = true;
  } catch (error) {
    console.error('[Health] PostgreSQL/Neon indisponível:', error);
  }

  res.status(postgresConnected ? 200 : 503).json({
    status: postgresConnected ? 'online' : 'degraded',
    system: 'DBS Telecom Smart Service BFF',
    timestamp: new Date().toISOString(),
    mode: CONFIG.demoMode ? 'demo/test-adapter' : 'live-provider',
    dependencies: {
      postgres: {
        configured: Boolean(CONFIG.database.url),
        connected: postgresConnected,
        provider: 'neon',
      },
      ixc: {
        configured: Boolean(CONFIG.ixc.token),
        baseUrl: ixcService['baseUrl'],
      },
      pixWebhook: {
        configured: Boolean(CONFIG.pix.webhookSecret),
      },
    },
    ai: {
      provider: CONFIG.ai.provider,
      geminiConfigured: geminiProvider.isConfigured(),
      geminiModel: CONFIG.ai.geminiModel,
      guardrailsEnabled: CONFIG.ai.guardrailsEnabled,
      temperature: CONFIG.ai.temperature,
    },
    features: {
      jwtAntiIdor: true,
      postgresPersistence: true,
      openApiDocs: true,
      sseStreaming: true,
      audioMultimodal: true,
      csatNps: true,
      virtualQueue: true,
    },
  });
});
}
