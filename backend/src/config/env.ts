import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const CONFIG = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'replace-with-at-least-32-random-characters',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  database: {
    path: process.env.DB_PATH || path.resolve(process.cwd(), 'data', 'dbs_telecom.sqlite'),
  },
  ixc: {
    baseUrl: process.env.IXC_BASE_URL || 'https://demo.ixcsoft.com.br/webservice/v1',
    token: process.env.IXC_TOKEN || 'replace-with-a-rotated-ixc-token',
  },
  ai: {
    provider: (process.env.AI_PROVIDER || 'gemini') as 'gemini' | 'openai' | 'hybrid' | 'mock',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.2'),
    guardrailsEnabled: process.env.AI_GUARDRAILS_ENABLED !== 'false',
  },
};
