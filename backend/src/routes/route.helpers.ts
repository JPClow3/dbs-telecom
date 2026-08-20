import type { Response } from 'express';

export function sendApiError(res: Response, fallbackMessage: string, error: unknown, fallbackStatus = 500) {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: unknown }).code || 'INTERNAL_ERROR')
    : 'INTERNAL_ERROR';
  const status = code === 'IXC_UNAVAILABLE' ? 503 : fallbackStatus;
  return res.status(status).json({ error: fallbackMessage, code });
}

export function redactUserAccount(user: any) {
  const { passwordHash: _passwordHash, defaultPasswordCpf: _defaultPasswordCpf, ...safeUser } = user;
  return safeUser;
}

