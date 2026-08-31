import { Router } from 'express';
import { registerHealthRoutes } from './health.routes.js';
import { registerAuthRoutes } from './auth.routes.js';
import { registerChatRoutes } from './chat.routes.js';
import { registerQueueRoutes } from './queue.routes.js';
import { registerAiRoutes } from './ai.routes.js';
import { registerFinancialRoutes } from './financial.routes.js';
import { registerCommercialRoutes } from './commercial.routes.js';
import { registerSupportRoutes } from './support.routes.js';
import { registerSystemRoutes } from './system.routes.js';
import { registerEnterpriseRoutes } from './enterprise.routes.js';

export const apiRouter = Router();

// Keep registration order stable: middleware and overlapping parameterized
// routes rely on the same domain sequence as the legacy router.
registerHealthRoutes(apiRouter);
registerAuthRoutes(apiRouter);
registerChatRoutes(apiRouter);
registerQueueRoutes(apiRouter);
registerAiRoutes(apiRouter);
registerFinancialRoutes(apiRouter);
registerCommercialRoutes(apiRouter);
registerSupportRoutes(apiRouter);
registerSystemRoutes(apiRouter);
registerEnterpriseRoutes(apiRouter);
