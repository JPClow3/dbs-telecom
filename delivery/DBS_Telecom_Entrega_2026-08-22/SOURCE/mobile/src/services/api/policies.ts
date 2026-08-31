/** Pure transport/auth policies kept independent of React Native runtime modules. */
export function normalizeAuthToken(token: string | null | undefined): string | null {
  const normalized = token?.trim() || null;
  return normalized;
}

export function isDemoOptInEnabled(isDevelopmentBuild: boolean | undefined, flag: string | undefined): boolean {
  return isDevelopmentBuild === true && flag === 'true';
}

export function isUnauthorizedStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export type AuthFailureKind = 'SESSION_EXPIRED' | 'PERMISSION_DENIED' | 'NOT_AUTH_FAILURE';

export interface AuthFailure {
  kind: AuthFailureKind;
  /** Verdadeiro quando o logout global deve ser emitido. */
  shouldForceLogout: boolean;
}

const TOKEN_PROBLEM_CODES = new Set([
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'TOKEN_MISSING',
  'SESSION_EXPIRED',
  'UNAUTHORIZED',
  'NOT_AUTHENTICATED',
]);

const AUTH_ENDPOINT_HINTS = [/\/auth\//, /\/session/, /\/logout/, /\/refresh/];

/**
 * Distingue sessão inválida de mera negação de permissão:
 * - 401 sempre invalida a sessão (token ausente/expirado/rejeitado).
 * - 403 só é tratado como problema de token quando o corpo/código indica isso
 *   ou quando o endpoint é de autenticação/sessão; caso contrário é apenas
 *   permissão insuficiente e NÃO deve derrubar o usuário para o login.
 */
export function resolveAuthFailure(
  status: number,
  url?: string,
  errorCode?: string | null
): AuthFailure {
  if (status === 401) {
    return { kind: 'SESSION_EXPIRED', shouldForceLogout: true };
  }

  if (status === 403) {
    const normalizedCode = (errorCode || '').trim().toUpperCase();
    const codeIndicatesTokenProblem = TOKEN_PROBLEM_CODES.has(normalizedCode);
    const isAuthEndpoint = Boolean(url) && AUTH_ENDPOINT_HINTS.some((hint) => hint.test(url as string));
    if (codeIndicatesTokenProblem || isAuthEndpoint) {
      return { kind: 'SESSION_EXPIRED', shouldForceLogout: true };
    }
    return { kind: 'PERMISSION_DENIED', shouldForceLogout: false };
  }

  return { kind: 'NOT_AUTH_FAILURE', shouldForceLogout: false };
}
