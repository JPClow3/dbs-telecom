/**
 * Compatibility facade for the explicit local demo. The state, fixtures, and
 * handlers are split so no demo source file becomes a hidden monolith.
 */
export {
  DEMO_CUSTOMER,
  DEMO_MODE_ENABLED,
  deactivateDemoMode,
  exitDemoMode,
  isDemoMode,
  startDemoMode,
} from './demoState';
export { MOCK_INVOICES, MOCK_PLANS, MOCK_TICKETS } from './demoFixtures';
export { processOfflineMessage } from './demoHandlers';
