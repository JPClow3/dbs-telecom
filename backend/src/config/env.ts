import dotenv from 'dotenv';
import crypto from 'node:crypto';

// Cloudflare injects secret bindings into process.env with nodejs_compat.
// Loading a local .env file is only useful for the Node development server.
const isCloudflareWorkerRuntime = typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== 'undefined';
if (!isCloudflareWorkerRuntime) dotenv.config();

const runtimeNodeEnv = process.env.NODE_ENV || 'development';
const runtimeDemoMode = runtimeNodeEnv !== 'production' && (
  runtimeNodeEnv === 'test' || process.env.DBS_DEMO_MODE === 'true' || process.env.DEMO_MODE === 'true'
);

/**
 * Development/test tokens are generated for this process only. There is no
 * committed signing key to accidentally reuse in a deployed environment.
 */
let ephemeralJwtSecret: string | undefined;

const PLACEHOLDER_SECRET_PATTERNS = [
  /^change[-_ ]?me$/i,
  /^replace[-_ ]?me$/i,
  /^your[-_ ].+$/i,
  /^secret$/i,
  /^changeme$/i,
  /^todo$/i,
];

export function isPlaceholderSecret(value: string | undefined): boolean {
  const normalized = value?.trim();
  return !normalized || PLACEHOLDER_SECRET_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    /(?:default|demo|example|insecure|dbs[-_ ]?telecom.*secret)/i.test(normalized);
}

function resolveJwtSecret(value: string | undefined): string {
  if (!isPlaceholderSecret(value)) return value!.trim();
  // Do not generate entropy at Worker module scope: Cloudflare correctly
  // rejects global side effects. Development/test fallbacks are lazy only.
  ephemeralJwtSecret ||= crypto.randomBytes(48).toString('base64url');
  return ephemeralJwtSecret;
}

export const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: runtimeNodeEnv,
  demoMode: runtimeDemoMode,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  auth: {
    jwtSecret: resolveJwtSecret(process.env.JWT_SECRET),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  database: {
    url: process.env.DATABASE_URL?.trim() || '',
  },
  ixc: {
    baseUrl: process.env.IXC_BASE_URL || 'https://demo.ixcsoft.com.br/webservice/v1',
    token: process.env.IXC_TOKEN?.trim() || '',
  },
  pix: {
    webhookSecret: process.env.PIX_WEBHOOK_SECRET?.trim() || '',
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'gemini') as 'gemini' | 'openai' | 'hybrid' | 'mock',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.2'),
    guardrailsEnabled: process.env.AI_GUARDRAILS_ENABLED !== 'false',
  },
};

/**
 * Validação rigorosa de variáveis de ambiente para produção
 */
export function validateEnv(customEnv?: NodeJS.ProcessEnv): void {
  const env = customEnv || process.env;
  const nodeEnv = env.NODE_ENV || runtimeNodeEnv;

  if (nodeEnv === 'production') {
    const jwtSecret = env.JWT_SECRET;
    if (isPlaceholderSecret(jwtSecret) || jwtSecret!.trim().length < 32) {
      throw new Error(
        '[FATAL SECURITY CONFIG] Em produção, JWT_SECRET deve ser configurado explicitamente com uma chave forte (mínimo 32 caracteres).'
      );
    }

    const ixcToken = env.IXC_TOKEN;
    if (isPlaceholderSecret(ixcToken)) {
      throw new Error(
        '[FATAL SECURITY CONFIG] Em produção, IXC_TOKEN deve ser configurado explicitamente; nenhuma credencial padrão é permitida.'
      );
    }

    if (!env.DATABASE_URL?.trim()) {
      throw new Error(
        '[FATAL SECURITY CONFIG] Em produção, DATABASE_URL deve apontar para o PostgreSQL/Neon.'
      );
    }

    const pixWebhookSecret = env.PIX_WEBHOOK_SECRET;
    if (isPlaceholderSecret(pixWebhookSecret) || pixWebhookSecret!.trim().length < 32) {
      throw new Error(
        '[FATAL SECURITY CONFIG] Em produção, PIX_WEBHOOK_SECRET deve ser configurado com uma chave forte (mínimo 32 caracteres).'
      );
    }
  }
}
