import type { ApiDataState, ChatMessage } from '../../types';
import { normalizeAuthToken, resolveAuthFailure } from './policies';
import {
  DEFAULT_TIMEOUT_MS,
  createTimeoutSignal,
  type TimeoutHandle,
} from '../../utils/timeout';
import { forceLogout } from '../../utils/session-events';

/** Códigos de corpo que indicam problema de token (e não permissão). */
const TOKEN_PROBLEM_CODE_RE =
  /token[_ -]?(expired|invalid|missing)|session[_ -]?expired|not[ _-]?authenticated|unauthorized/i;

export type ApiErrorKind = 'UNAVAILABLE' | 'UNAUTHORIZED' | 'HTTP' | 'INVALID_RESPONSE' | 'TIMEOUT';

/** A typed failure lets screens distinguish outage from auth rejection. */
export class ApiServiceError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(message: string, kind: ApiErrorKind, status?: number) {
    super(message);
    this.name = 'ApiServiceError';
    this.kind = kind;
    this.status = status;
  }
}

export class NetworkTimeoutError extends ApiServiceError {
  constructor(message = 'Tempo limite excedido') {
    super(message, 'TIMEOUT');
    this.name = 'NetworkTimeoutError';
  }
}

export function isNetworkTimeoutError(error: unknown): error is NetworkTimeoutError {
  return error instanceof NetworkTimeoutError;
}

export function isApiServiceError(error: unknown): error is ApiServiceError {
  return error instanceof ApiServiceError;
}

let currentAuthToken: string | null = null;
const productionApiUrl = 'https://dbs-telecom-api.joaopaulo-grv4.workers.dev/api';

export const setAuthToken = (token: string | null): void => {
  currentAuthToken = normalizeAuthToken(token);
};

export const getAuthToken = (): string | null => currentAuthToken;

export function getAuthHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (currentAuthToken) {
    headers.Authorization = `Bearer ${currentAuthToken}`;
  }
  return headers;
}

// `react-native` não pode ser importado estaticamente aqui: o runtime de teste
// (`tsx --test` sobre Node) não interpreta o Flow do RN. O acesso é lazy e
// tolerante a falha — em Node puro simplesmente não há plataforma nativa.
function resolvePlatformOs(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Platform } = require('react-native') as { Platform: { OS: string } };
    return Platform?.OS ?? 'web';
  } catch {
    return 'web';
  }
}

export function getApiUrl(): string {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return `${window.location.origin}/api`;
  }
  const envUrl = (process.env as Record<string, string | undefined>)?.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl;
  }
  if (!__DEV__) {
    return productionApiUrl;
  }
  if (resolvePlatformOs() === 'android') {
    return 'http://10.0.2.2:3000/api';
  }
  return 'http://localhost:3000/api';
}

export interface ApiFetchOptions extends RequestInit {
  /**
   * Timeout em ms para a requisição (default 15000). Use um valor maior para
   * streams de longa duração — o sinal do chamante continua abortável.
   */
  timeoutMs?: number;
  /** Quando true, não aplica timeout automático (streams gerenciados manualmente). */
  noTimeout?: boolean;
}

/**
 * Combina o sinal do chamante (abortável pelo componente) com o sinal de
 * timeout num único AbortController, para que ambos cancelem a requisição.
 */
function combineSignals(
  callerSignal: AbortSignal | null | undefined,
  timeoutHandle: TimeoutHandle | null
): { signal: AbortSignal | undefined; cleanup: () => void } {
  if (!callerSignal && !timeoutHandle) {
    return { signal: undefined, cleanup: () => undefined };
  }

  const controller = new AbortController();

  const onCallerAbort = callerSignal
    ? () => controller.abort(callerSignal.reason)
    : null;
  const onTimeoutAbort = timeoutHandle
    ? () => controller.abort(new Error('Tempo limite excedido'))
    : null;

  if (callerSignal) {
    callerSignal.addEventListener('abort', onCallerAbort as EventListener, { once: true });
  }
  if (timeoutHandle) {
    timeoutHandle.signal.addEventListener('abort', onTimeoutAbort as EventListener, { once: true });
  }

  const cleanup = () => {
    if (callerSignal && onCallerAbort) {
      callerSignal.removeEventListener('abort', onCallerAbort as EventListener);
    }
    if (timeoutHandle && onTimeoutAbort) {
      timeoutHandle.signal.removeEventListener('abort', onTimeoutAbort as EventListener);
    }
  };

  return { signal: controller.signal, cleanup };
}

function isAbortError(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    ((error as { name?: string }).name === 'AbortError' ||
      (error as { name?: string }).name === 'TimeoutError')
  ) {
    return true;
  }
  // Node e alguns runtimes rejeitam com o *motivo* do abort em vez de um
  // DOMException AbortError; reconhece a mensagem canônica do timeout.
  return error instanceof Error && /tempo limite excedido/i.test(error.message || '');
}

/**
 * Emite o logout global quando a falha realmente invalida a sessão.
 * - 401: sempre (sessão expirada/inválida).
 * - 403: apenas quando código/endpoint indicam problema de token; negação de
 *   permissão comum é propagada ao chamador sem deslogar o usuário.
 */
async function handleAuthExpiry(res: Response, url: string): Promise<void> {
  let errorCode: string | null = null;
  if (res.status === 403) {
    // Espia o corpo (clone preserva o original para o chamador) para
    // distinguir token inválido de permissão insuficiente.
    const peeked = await res
      .clone()
      .json()
      .catch(() => null);
    const rawCode =
      typeof (peeked as any)?.code === 'string'
        ? (peeked as any).code
        : typeof (peeked as any)?.error === 'string'
          ? (peeked as any).error
          : null;
    errorCode = rawCode && TOKEN_PROBLEM_CODE_RE.test(rawCode) ? rawCode : null;
  }

  const failure = resolveAuthFailure(res.status, url, errorCode);
  if (failure.shouldForceLogout) {
    setAuthToken(null);
    forceLogout(failure.kind === 'PERMISSION_DENIED' ? 'permissao_negada' : 'sessao_expirada');
  }
}

/**
 * Wrapper central de fetch para os serviços da API.
 *
 * - Timeout padrão de 15s (override por requisição via `timeoutMs`/`noTimeout`).
 * - Sinal do chamante combinado com o de timeout (componente continua podendo
 *   abortar streams/subscriptions).
 * - 401 emite forceLogout('sessao_expirada'); 403 só quando indica problema de
 *   token — negação de permissão chega ao chamador como erro HTTP comum.
 */
export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { timeoutMs, noTimeout, signal: callerSignal, ...rest } = options;

  const timeoutHandle: TimeoutHandle | null = noTimeout
    ? null
    : createTimeoutSignal(timeoutMs ?? DEFAULT_TIMEOUT_MS);

  const { signal, cleanup } = combineSignals(callerSignal, timeoutHandle);

  try {
    const res = await fetch(url, { ...rest, signal });
    if (res.status === 401 || res.status === 403) {
      await handleAuthExpiry(res, url);
    }
    return res;
  } catch (error) {
    if (isAbortError(error)) {
      const timedOut = !noTimeout && timeoutHandle?.signal.aborted;
      if (timedOut) {
        throw new NetworkTimeoutError('Tempo limite excedido');
      }
      // Abort originado no chamador (unsubscribe/desmontagem): propaga.
      throw error;
    }
    throw error;
  } finally {
    cleanup();
    timeoutHandle?.clear();
  }
}

export async function responseError(res: Response, fallback: string): Promise<ApiServiceError> {
  const data = await res.json().catch(() => ({}));
  const message = data?.message || data?.error || fallback;
  if (res.status === 401 || res.status === 403) {
    // Mesma política do apiFetch: 401 sempre invalida a sessão; 403 apenas
    // quando indica problema de token — senão é erro de permissão comum.
    const rawCode =
      typeof (data as any)?.code === 'string'
        ? (data as any).code
        : typeof (data as any)?.error === 'string'
          ? (data as any).error
          : null;
    const errorCode = res.status === 403 && rawCode && TOKEN_PROBLEM_CODE_RE.test(rawCode) ? rawCode : null;
    const failure = resolveAuthFailure(res.status, undefined, errorCode);
    if (failure.shouldForceLogout) {
      setAuthToken(null);
      forceLogout('sessao_expirada');
    }
    return new ApiServiceError(message, failure.kind === 'PERMISSION_DENIED' ? 'HTTP' : 'UNAUTHORIZED', res.status);
  }
  return new ApiServiceError(message, 'HTTP', res.status);
}

export function unavailableError(message: string): ApiServiceError {
  return new ApiServiceError(message, 'UNAVAILABLE');
}

export function unavailableMessage(
  message: string,
  kind: Extract<ApiDataState, 'UNAVAILABLE' | 'UNAUTHORIZED'> = 'UNAVAILABLE'
): ChatMessage {
  return {
    id: `msg-unavailable-${Date.now()}`,
    sender: 'SYSTEM',
    text: message,
    timestamp: new Date().toISOString(),
    department: 'GERAL',
    dataState: kind,
  };
}
