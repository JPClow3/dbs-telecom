import { Platform } from 'react-native';
import type { ApiDataState, ChatMessage } from '../../types';
import { isUnauthorizedStatus, normalizeAuthToken } from './policies';

export type ApiErrorKind = 'UNAVAILABLE' | 'UNAUTHORIZED' | 'HTTP' | 'INVALID_RESPONSE';

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

export async function responseError(res: Response, fallback: string): Promise<ApiServiceError> {
  const data = await res.json().catch(() => ({}));
  const message = data?.message || data?.error || fallback;
  if (isUnauthorizedStatus(res.status)) {
    setAuthToken(null);
    return new ApiServiceError(message, 'UNAUTHORIZED', res.status);
  }
  return new ApiServiceError(message, 'HTTP', res.status);
}

export function unavailableError(message: string): ApiServiceError {
  return new ApiServiceError(message, 'UNAVAILABLE');
}

export function unavailableMessage(
  message: string,
  kind: Extract<ApiDataState, 'UNAVAILABLE' | 'UNAUTHORIZED'> = 'UNAVAILABLE',
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
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000/api';
  }
  return 'http://localhost:3000/api';
}
