import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authorizeRestoredSession, normalizeAuthSession, parseAuthSession } from '../src/services/sessionPolicy';

const customer = {
  id: 'customer-1',
  nome: 'Cliente Teste',
  cpfCnpj: '00000000000',
};

function tokenWithExpiry(exp: number): string {
  const encoded = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `header.${encoded}.signature`;
}

describe('mobile authentication session policy', () => {
  it('rejects identity-only and token-only records', () => {
    assert.equal(normalizeAuthSession({ customer }), null);
    assert.equal(normalizeAuthSession({ token: 'opaque-token' }), null);
  });

  it('rejects malformed persisted JSON and incomplete customer identity', () => {
    assert.equal(parseAuthSession('{not-json'), null);
    assert.equal(normalizeAuthSession({ customer: { id: '1' }, token: 'opaque-token' }), null);
  });

  it('rejects an expired JWT even when customer identity is present', () => {
    const now = Date.UTC(2026, 7, 20);
    const token = tokenWithExpiry(Math.floor(now / 1000) - 1);
    assert.equal(normalizeAuthSession({ customer, token }, now), null);
  });

  it('accepts a future token-backed session and derives its expiry', () => {
    const now = Date.UTC(2026, 7, 20);
    const expiresAt = now + 60_000;
    const token = tokenWithExpiry(Math.floor(expiresAt / 1000));
    assert.deepEqual(normalizeAuthSession({ customer, token }, now), {
      customer,
      token,
      expiresAt,
      mode: 'live',
    });
  });

  it('normalizes unknown modes to live and trims opaque tokens', () => {
    assert.deepEqual(
      normalizeAuthSession({ customer, token: '  opaque-token  ', mode: 'unexpected' }),
      { customer, token: 'opaque-token', mode: 'live' }
    );
  });

  it('exige biometria antes de autorizar uma sessão restaurada', async () => {
    const session = normalizeAuthSession({ customer, token: 'opaque-token' });
    assert.ok(session);

    const denied = await authorizeRestoredSession(session, true, async () => ({ success: false }));
    assert.equal(denied, null);

    const allowed = await authorizeRestoredSession(session, true, async () => ({ success: true }));
    assert.deepEqual(allowed, session);
  });

  it('falha fechado se a autenticação biométrica lançar erro ao restaurar a sessão', async () => {
    const session = normalizeAuthSession({ customer, token: 'opaque-token' });
    assert.ok(session);

    const restored = await authorizeRestoredSession(session, true, async () => {
      throw new Error('biometria indisponível');
    });
    assert.equal(restored, null);
  });
});
