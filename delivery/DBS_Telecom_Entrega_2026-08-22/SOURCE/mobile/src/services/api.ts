import * as authApi from './api/auth';
import * as catalogApi from './api/catalog';
import * as chatApi from './api/chat';
import * as financialApi from './api/financial';
import * as networkApi from './api/network';
import * as notificationsApi from './api/notifications';
import * as queueApi from './api/queue';
import * as referralsApi from './api/referrals';
import * as supportApi from './api/support';

export type { ApiErrorKind } from './api/transport';
export {
  ApiServiceError,
  getAuthToken,
  setAuthToken,
} from './api/transport';
export {
  exitDemoMode,
  isDemoMode,
  startDemoMode,
} from './api/demoAdapter';

/**
 * Compatibility facade for the mobile screens.
 *
 * Domain implementations live under ./api, while this object intentionally
 * preserves the existing import path and complete method surface.
 */
export const apiService = {
  loginClient: authApi.loginClient,
  identifyClient: authApi.identifyClient,
  getInitialGreeting: chatApi.getInitialGreeting,
  sendMessage: chatApi.sendMessage,
  sendMessageStream: chatApi.sendMessageStream,
  sendAudioMessage: chatApi.sendAudioMessage,
  submitCSAT: chatApi.submitCSAT,
  getCSATStats: chatApi.getCSATStats,
  joinQueue: queueApi.joinQueue,
  getQueueStatus: queueApi.getQueueStatus,
  subscribeQueueStream: queueApi.subscribeQueueStream,
  leaveQueue: queueApi.leaveQueue,
  advanceQueue: queueApi.advanceQueue,
  getInvoices: financialApi.getInvoices,
  requestUnblockPromise: financialApi.requestUnblockPromise,
  getInvoicePdfUrl: financialApi.getInvoicePdfUrl,
  downloadInvoicePdf: financialApi.downloadInvoicePdf,
  getClientTickets: supportApi.getClientTickets,
  getTrafficConsumption: supportApi.getTrafficConsumption,
  runRealSpeedTest: supportApi.runRealSpeedTest,
  getPlans: catalogApi.getPlans,
  getWifiSettings: networkApi.getWifiSettings,
  updateWifiSettings: networkApi.updateWifiSettings,
  getWifiGuestQr: networkApi.getWifiGuestQr,
  restartWifi: networkApi.restartWifi,
  getOpticalDiagnostics: networkApi.getOpticalDiagnostics,
  getNotifications: notificationsApi.getNotifications,
  markNotificationAsRead: notificationsApi.markNotificationAsRead,
  markAllNotificationsAsRead: notificationsApi.markAllNotificationsAsRead,
  subscribeToPixPayment: notificationsApi.subscribeToPixPayment,
  getReferralSummary: referralsApi.getReferralSummary,
  addReferral: referralsApi.addReferral,
};
