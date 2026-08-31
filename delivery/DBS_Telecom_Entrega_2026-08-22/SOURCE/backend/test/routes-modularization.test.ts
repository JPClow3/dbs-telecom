import { describe, expect, it } from 'vitest';
import { apiRouter } from '../src/routes/api.router.js';

describe('API route registrar compatibility', () => {
  it('keeps the complete public route table and registration order', () => {
    const routes = (apiRouter as any).stack
      .filter((layer: any) => layer.route)
      .map((layer: any) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods).filter((method) => layer.route.methods[method]),
      }));

    expect(routes).toEqual([
      { path: '/health', methods: ['get'] },
      { path: '/health/ready', methods: ['get'] },
      { path: '/auth/login', methods: ['post'] },
      { path: '/auth/sync-users', methods: ['post'] },
      { path: '/auth/users', methods: ['get'] },
      { path: '/auth/change-password', methods: ['post'] },
      { path: '/auth/otp/request', methods: ['post'] },
      { path: '/auth/otp/verify', methods: ['post'] },
      { path: '/auth/identify', methods: ['post'] },
      { path: '/chat/greeting', methods: ['post'] },
      { path: '/chat/message', methods: ['post'] },
      { path: '/chat/history/:sessionId', methods: ['get'] },
      { path: '/chat/message/stream', methods: ['_all'] },
      { path: '/chat/audio', methods: ['post'] },
      { path: '/chat/csat', methods: ['post'] },
      { path: '/chat/csat/stats', methods: ['get'] },
      { path: '/chat/csat/client/:clientId', methods: ['get'] },
      { path: '/queue/join', methods: ['post'] },
      { path: '/queue/status/:clientId', methods: ['get'] },
      { path: '/queue/stream/:clientId', methods: ['get'] },
      { path: '/queue/leave', methods: ['post'] },
      { path: '/queue/progress', methods: ['post'] },
      { path: '/queue/stats', methods: ['get'] },
      { path: '/ai/classify', methods: ['post'] },
      { path: '/ai/context/:clientId', methods: ['get'] },
      { path: '/financial/invoices/:clientId', methods: ['get'] },
      { path: '/financial/unblock-promise', methods: ['post'] },
      { path: '/financial/invoices/:id/pdf', methods: ['get'] },
      { path: '/commercial/plans', methods: ['get'] },
      { path: '/support/diagnostic', methods: ['post'] },
      { path: '/support/tickets/:clientId', methods: ['get'] },
      { path: '/traffic/consumption/:clientId', methods: ['get'] },
      { path: '/system/ping', methods: ['_all'] },
      { path: '/system/speedtest-payload', methods: ['get'] },
      { path: '/system/speedtest-payload', methods: ['post'] },
      { path: '/wifi/settings/:clientId', methods: ['get'] },
      { path: '/wifi/settings/:clientId', methods: ['put'] },
      { path: '/wifi/qr/:clientId', methods: ['get'] },
      { path: '/wifi/restart/:clientId', methods: ['post'] },
      { path: '/optical/diagnostics/:clientId', methods: ['get'] },
      { path: '/notifications/:clientId', methods: ['get'] },
      { path: '/notifications/:clientId/read/:notificationId', methods: ['patch'] },
      { path: '/notifications/:clientId/read-all', methods: ['patch'] },
      { path: '/notifications/simulate', methods: ['post'] },
      { path: '/financial/pix/webhook', methods: ['post'] },
      { path: '/financial/pix/stream/:clientId', methods: ['get'] },
      { path: '/referrals/:clientId', methods: ['get'] },
      { path: '/referrals/:clientId', methods: ['post'] },
    ]);
  });
});
