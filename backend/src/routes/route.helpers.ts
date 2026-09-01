import type { NextFunction, Request, Response } from 'express';

/**
 * Códigos de erro que podem ser ecoados ao cliente com segurança. Qualquer
 * outro código (ex.: códigos internos de drivers de banco, mensagens de
 * provedores) é normalizado para `erro_interno`, evitando que impressões
 * digitais da infraestrutura vazem na resposta HTTP.
 */
const ALLOWED_API_ERROR_CODES: ReadonlySet<string> = new Set([
  'IXC_UNAVAILABLE',
  'INVOICE_NOT_FOUND',
  'PROVIDER_NOT_CONFIGURED',
  'TOKEN_MISSING',
  'TOKEN_INVALID',
  'UNAUTHORIZED',
  'ADMIN_REQUIRED',
  'IDOR_FORBIDDEN',
  'CLIENT_ID_REQUIRED',
  'CHAT_SESSION_FORBIDDEN',
  'CHAT_SESSION_NOT_FOUND',
  'CSAT_VALIDATION_FAILED',
  'NOT_IMPLEMENTED',
  'TOO_MANY_REQUESTS',
  'PIX_PAYLOAD_INVALID',
  'PIX_SIGNATURE_REQUIRED',
  'PIX_SIGNATURE_INVALID',
  'PIX_REPLAY_REJECTED',
  'PIX_PERSISTENCE_FAILED',
  'QUEUE_ADMIN_REQUIRED',
  'CODIGO_DEPARTAMENTO_INVALIDO',
]);

/** Código genérico usado quando o erro não pertence à lista permitida. */
const FALLBACK_ERROR_CODE = 'erro_interno';

export function sendApiError(res: Response, fallbackMessage: string, error: unknown, fallbackStatus = 500) {
  const rawCode = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const normalized = rawCode.trim().toUpperCase();
  const code = ALLOWED_API_ERROR_CODES.has(normalized) ? normalized : FALLBACK_ERROR_CODE;
  const status = code === 'IXC_UNAVAILABLE' ? 503 : fallbackStatus;
  return res.status(status).json({ error: fallbackMessage, code });
}

/**
 * Envolve handlers assíncronos para que qualquer rejeição seja encaminhada ao
 * Error Handler global do Express. Sem isso, uma Promise rejeitada fora de
 * try/catch derruba o processo Node inteiro (Express 4 não captura rejeições).
 */
export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncRouteHandler): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function redactUserAccount(user: any) {
  const { passwordHash: _passwordHash, defaultPasswordCpf: _defaultPasswordCpf, ...safeUser } = user;
  return safeUser;
}

