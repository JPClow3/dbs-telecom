import type { Customer } from '../../types';
import { isDemoOptInEnabled } from './policies';
import { ApiServiceError, setAuthToken } from './transport';

// Demo data is available only after an explicit development opt-in. It is
// never enabled by a production build and is never used for authentication or
// financial/support actions.
export const DEMO_MODE_ENABLED = isDemoOptInEnabled(
  typeof __DEV__ !== 'undefined' ? __DEV__ : undefined,
  (process.env as Record<string, string | undefined>)?.EXPO_PUBLIC_DEMO_MODE,
);

let demoMode = false;

export const DEMO_CUSTOMER: Customer = {
  id: 'demo-2270',
  nome: '[DEMO] Emanuel da Silva',
  fantasia: 'Demonstração local',
  cpfCnpj: '154.293.707-89',
  email: 'demo@dbstelecom.local',
  telefone: '(49) 98877-6655',
  endereco: 'Ambiente de demonstração local',
  isDemo: true,
};

/** Starts only the explicitly opted-in local visual demo; it has no auth token. */
export const startDemoMode = (): Customer => {
  if (!DEMO_MODE_ENABLED) {
    throw new ApiServiceError('A demonstração local está desabilitada.', 'UNAUTHORIZED', 403);
  }
  demoMode = true;
  setAuthToken(null);
  return { ...DEMO_CUSTOMER };
};

export const exitDemoMode = (): void => {
  demoMode = false;
  setAuthToken(null);
};

/**
 * Leaves the local visual demo without touching a token that was just issued
 * by the server. This is used when a user switches from the local shortcut to
 * the authenticated Gemini-backed preview.
 */
export const deactivateDemoMode = (): void => {
  demoMode = false;
};

export const isDemoMode = (): boolean => demoMode;
