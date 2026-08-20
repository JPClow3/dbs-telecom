import { createApp } from './app.js';
import { CONFIG, validateEnv } from './config/env.js';

// Validação de segurança em ambiente de produção
validateEnv();

const app = createApp();

app.listen(CONFIG.port, () => {
  console.log(`=======================================================`);
  console.log(`🚀 DBS TELECOM - BACKEND BFF & CHAT IA INICIADO`);
  console.log(`📡 Porta: http://localhost:${CONFIG.port}`);
  console.log(`🔗 Health Check: http://localhost:${CONFIG.port}/api/health`);
  console.log(`🔌 IXC Base URL: ${CONFIG.ixc.baseUrl}`);
  console.log(`🧠 AI Provider: ${CONFIG.ai.provider}`);
  console.log(`=======================================================`);
});
