import type { AuthSession, Customer } from '../types';

function decodeTokenExpiry(token: string): number | undefined {
  try {
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded =
      typeof globalThis.atob === 'function'
        ? globalThis.atob(normalized)
        : typeof Buffer !== 'undefined'
          ? Buffer.from(normalized, 'base64').toString('utf8')
          : '';
    const exp = JSON.parse(decoded).exp;
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

function isValidCustomer(customer: unknown): customer is Customer {
  if (!customer || typeof customer !== 'object') return false;
  const value = customer as Partial<Customer>;
  return Boolean(
    typeof value.id === 'string' && value.id.trim() &&
      typeof value.nome === 'string' && value.nome.trim() &&
      typeof value.cpfCnpj === 'string' && value.cpfCnpj.trim()
  );
}

export function normalizeAuthSession(
  input: unknown,
  now = Date.now()
): AuthSession | null {
  if (!input || typeof input !== 'object') return null;
  const parsed = input as Partial<AuthSession>;
  if (!isValidCustomer(parsed.customer) || typeof parsed.token !== 'string' || !parsed.token.trim()) {
    return null;
  }

  const expiresAt = parsed.expiresAt ?? decodeTokenExpiry(parsed.token);
  if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= now)) {
    return null;
  }

  return {
    customer: parsed.customer,
    token: parsed.token.trim(),
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    mode: parsed.mode === 'demo' ? 'demo' : 'live',
  };
}

export function parseAuthSession(json: string | null, now = Date.now()): AuthSession | null {
  if (!json) return null;
  try {
    return normalizeAuthSession(JSON.parse(json), now);
  } catch {
    return null;
  }
}
