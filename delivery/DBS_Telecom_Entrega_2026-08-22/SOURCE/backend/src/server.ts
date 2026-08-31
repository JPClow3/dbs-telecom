import { createApp, getActiveSseCount, destroyAllSseResponses } from './app.js';
import type { Request, Response } from 'express';
import http from 'node:http';
import { CONFIG, validateEnv } from './config/env.js';

// Validação de segurança em ambiente de produção
validateEnv();

const app = createApp();

const server = http.createServer(app);

server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[Servidor] ERRO: a porta ${CONFIG.port} já está em uso. Encerrando.`);
  } else {
    console.error('[Servidor] Erro no listener HTTP:', error);
  }
  process.exit(1);
});

server.listen(CONFIG.port, () => {
  console.log(`=======================================================`);
  console.log(`🚀 DBS TELECOM - BACKEND BFF & CHAT IA INICIADO`);
  console.log(`📡 Porta: http://localhost:${CONFIG.port}`);
  console.log(`🔗 Health Check: http://localhost:${CONFIG.port}/api/health`);
  console.log(`🔌 IXC Base URL: ${CONFIG.ixc.baseUrl}`);
  console.log(`🧠 AI Provider: ${CONFIG.ai.provider}`);
  console.log(`=======================================================`);
});

/**
 * Desligamento gracioso: para de aceitar conexões novas, dá uma janela de
 * carência para streams SSE em andamento e só então encerra — sem o corte
 * seco de um process.exit() imediato em cada deploy.
 */
const SHUTDOWN_GRACE_MS = 5000;

function gracefulShutdown(signal: string): void {
  console.log(`[Servidor] Recebido ${signal}. Iniciando desligamento gracioso...`);

  // 1. Para de aceitar conexões novas imediatamente.
  server.close(() => {
    console.log('[Servidor] Servidor HTTP encerrado.');
    process.exit(0);
  });

  // 2. Janela de carência para os SSEs terminarem; depois destrói o que restar.
  const sseGrace = setTimeout(() => {
    if (getActiveSseCount() > 0) {
      console.log(`[Servidor] Encerrando ${getActiveSseCount()} stream(s) SSE remanescente(s).`);
    }
    destroyAllSseResponses();
    // Conexões keep-alive remanescentes não devem segurar o processo.
    server.closeAllConnections?.();
  }, SHUTDOWN_GRACE_MS);

  // 3. Rede de segurança: nunca fica preso além da janela total.
  const hardExit = setTimeout(() => {
    console.warn('[Servidor] Tempo de carência esgotado; encerrando à força.');
    process.exit(0);
  }, SHUTDOWN_GRACE_MS + 2000);

  for (const timer of [sseGrace, hardExit]) {
    timer.unref();
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
