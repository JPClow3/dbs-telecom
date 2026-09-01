import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import {
  apiFetch,
  getAuthToken,
  isNetworkTimeoutError,
  NetworkTimeoutError,
  getApiUrl,
  setAuthToken,
} from '../src/services/api/transport';
import {
  __resetSessionEventsForTests,
  forceLogout,
  onForceLogout,
} from '../src/utils/session-events';
import {
  enqueue,
  flush,
  list,
  markFailed,
  remove,
  setOutboxStorage,
} from '../src/utils/outbox';
import type { OutboxEntry } from '../src/utils/outbox';
import { resolveAuthFailure } from '../src/services/api/policies';
import { sendMessage } from '../src/services/api/chat';

// ---------------------------------------------------------------------------
// Stubs compartilhados
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Storage em memória com a mesma superfície do AsyncStorage. */
function makeMemoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    async getItem(key: string) {
      return map.get(key) ?? null;
    },
    async setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

beforeEach(() => {
  __resetSessionEventsForTests();
  setOutboxStorage(makeMemoryStorage());
  setAuthToken(null);
  process.env.EXPO_PUBLIC_API_URL = 'https://api.test';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.EXPO_PUBLIC_API_URL;
});

// ---------------------------------------------------------------------------
// 1. Timeout central
// ---------------------------------------------------------------------------

describe('network timeouts', () => {
  it('prefers EXPO_PUBLIC_API_URL over the browser origin for separately hosted deployments', () => {
    const previousWindow = (globalThis as any).window;
    (globalThis as any).window = { location: { origin: 'https://app.example.test' } };
    process.env.EXPO_PUBLIC_API_URL = 'https://api.example.test/custom-api/';

    try {
      assert.equal(getApiUrl(), 'https://api.example.test/custom-api');
    } finally {
      (globalThis as any).window = previousWindow;
    }
  });

  it('throws NetworkTimeoutError ("Tempo limite excedido") when the server never answers', async () => {
    let observedSignal: AbortSignal | undefined;
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      if (init?.signal) observedSignal = init.signal;
      // Fetch de verdade rejeita quando o sinal é abortado; o stub espelha isso.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject((init.signal as AbortSignal).reason ?? new Error('The operation was aborted'))
        );
      });
    }) as typeof fetch;

    const promise = apiFetch('https://api.test/slow', { timeoutMs: 25 });

    await assert.rejects(promise, (error: unknown) => {
      assert.ok(isNetworkTimeoutError(error));
      assert.equal((error as NetworkTimeoutError).message, 'Tempo limite excedido');
      assert.equal((error as NetworkTimeoutError).kind, 'TIMEOUT');
      return true;
    });

    // O sinal de timeout deve ter sido passado ao fetch real.
    assert.ok(observedSignal);
    assert.equal(observedSignal.aborted, true);
  });

  it('aborts when the CALLER unsubscribes, without classifying it as timeout', async () => {
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      // Reproduz o comportamento real: rejeita com o motivo do abort.
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason ?? new Error('The operation was aborted'))
        );
      });
    }) as typeof fetch;

    const controller = new AbortController();
    const promise = apiFetch('https://api.test/stream', { signal: controller.signal, timeoutMs: 5000 });
    controller.abort();

    await assert.rejects(promise, (error: unknown) => {
      // Abort do chamador NÃO é timeout tipado.
      assert.equal(isNetworkTimeoutError(error), false);
      return true;
    });
  });

  it('respects a large timeoutMs override for long-poll streams', async () => {
    let cleared = false;
    const realCreateTimeout = Date.now();
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      return new Promise<Response>((resolve) => {
        // Responde rápido, mas verifica que o timer não foi de 15s default:
        // se o sinal existir e não estiver abortado, o override foi aplicado.
        setTimeout(() => {
          cleared = !init?.signal?.aborted;
          resolve(jsonResponse({ ok: true }, 200));
        }, 20);
      });
    }) as typeof fetch;

    const res = await apiFetch('https://api.test/poll', { timeoutMs: 60_000 });
    assert.equal(res.status, 200);
    assert.equal(cleared, true);
    assert.ok(Date.now() - realCreateTimeout < 1000);
  });

  it('mantém o abort do chamador conectado ao corpo de um stream sem timeout', async () => {
    let fetchSignal: AbortSignal | undefined;
    globalThis.fetch = ((_url: string, init?: RequestInit) => {
      fetchSignal = init?.signal || undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          fetchSignal?.addEventListener('abort', () => {
            controller.error(fetchSignal?.reason ?? new Error('The operation was aborted'));
          }, { once: true });
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    }) as typeof fetch;

    const controller = new AbortController();
    const response = await apiFetch('https://api.test/stream', {
      signal: controller.signal,
      noTimeout: true,
    });
    const read = response.body!.getReader().read();
    controller.abort();

    await assert.rejects(read);
    assert.equal(fetchSignal, controller.signal);
  });
});

// ---------------------------------------------------------------------------
// 2. 401 sempre força logout; 403 de permissão, nunca
// ---------------------------------------------------------------------------

describe('auth expiry handling', () => {
  it('401 emits forceLogout("sessao_expirada") and clears the token', async () => {
    globalThis.fetch = (() => Promise.resolve(jsonResponse({ message: 'token expirado' }, 401))) as typeof fetch;
    setAuthToken('jwt-valido');

    const reasons: string[] = [];
    const unsubscribe = onForceLogout((reason) => reasons.push(reason));

    try {
      const res = await apiFetch('https://api.test/chat/history');
      assert.equal(res.status, 401);

      // Pequeno yield para qualquer emissão síncrona se materializar.
      await new Promise((r) => setTimeout(r, 0));

      assert.deepEqual(reasons, ['sessao_expirada']);
      assert.equal(getAuthToken(), null);
    } finally {
      unsubscribe();
    }
  });

  it('403 permission-style does NOT emit forceLogout and keeps the session', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse({ error: 'PERMISSAO_NEGADA', message: 'sem permissão' }, 403))) as typeof fetch;
    setAuthToken('jwt-valido');

    const reasons: string[] = [];
    const unsubscribe = onForceLogout((reason) => reasons.push(reason));

    try {
      const res = await apiFetch('https://api.test/admin/settings');
      assert.equal(res.status, 403);
      await new Promise((r) => setTimeout(r, 0));

      assert.deepEqual(reasons, []);
      assert.equal(getAuthToken(), 'jwt-valido');
    } finally {
      unsubscribe();
    }
  });

  it('403 with a token-problem code DOES emit forceLogout("sessao_expirada")', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(jsonResponse({ code: 'TOKEN_EXPIRED' }, 403))) as typeof fetch;
    setAuthToken('jwt-valido');

    const reasons: string[] = [];
    const unsubscribe = onForceLogout((reason) => reasons.push(reason));

    try {
      const res = await apiFetch('https://api.wifi.test/wifi/restart/c-1');
      assert.equal(res.status, 403);
      await new Promise((r) => setTimeout(r, 0));

      assert.deepEqual(reasons, ['sessao_expirada']);
      assert.equal(getAuthToken(), null);
    } finally {
      unsubscribe();
    }
  });

  it('classifier: 401 always logs out; plain 403 only surfaces permission error', () => {
    assert.equal(resolveAuthFailure(401).shouldForceLogout, true);
    assert.equal(resolveAuthFailure(403).shouldForceLogout, false);
    assert.equal(resolveAuthFailure(403).kind, 'PERMISSION_DENIED');
    assert.equal(
      resolveAuthFailure(403, 'https://api/auth/session', null).shouldForceLogout,
      true,
      'auth/session endpoints treat 403 as token problem'
    );
    assert.equal(resolveAuthFailure(500).shouldForceLogout, false);
  });

  it('forceLogout isolates broken listeners from healthy ones', () => {
    const seen: string[] = [];
    onForceLogout(() => {
      throw new Error('listener quebrado');
    });
    const unsubscribe = onForceLogout((reason) => seen.push(reason));

    forceLogout('sessao_expirada');

    assert.deepEqual(seen, ['sessao_expirada']);
    unsubscribe();
  });
});

// ---------------------------------------------------------------------------
// 3. Outbox offline: enfileirar -> reenviar -> remover, com teto de tentativas
// ---------------------------------------------------------------------------

describe('outbox', () => {
  it('recusa flush sem um cliente explícito', async () => {
    await assert.rejects(
      () => flush(async () => undefined, { clientId: '' }),
      /clientId é obrigatório/,
    );
  });

  it('enqueue persists messages in storage and list() returns them in order', async () => {
    await enqueue('session-1', 'primeira mensagem', new Date('2026-01-01T10:00:00Z'), { clientId: 'client-a' });
    await enqueue('session-1', 'segunda mensagem', new Date('2026-01-01T10:00:05Z'), { clientId: 'client-a' });

    const entries = await list('client-a');
    assert.equal(entries.length, 2);
    assert.equal(entries[0].text, 'primeira mensagem');
    assert.equal(entries[1].text, 'segunda mensagem');
    assert.ok(entries[0].id && entries[1].id);
    assert.equal(entries.every((e) => e.attempts === 0), true);
  });

  it('flush delivers pending messages through the same send path and removes them', async () => {
    await enqueue('session-9', 'mensagem offline', new Date(), { clientId: 'client-a', clientMessageId: 'mobile-msg-1' });
    const sentPayloads: string[] = [];

    const result = await flush(async (entry: OutboxEntry) => {
      sentPayloads.push(`${entry.sessionId}:${entry.text}`);
    }, { clientId: 'client-a' });

    assert.deepEqual(sentPayloads, ['session-9:mensagem offline']);
    assert.equal(result.delivered.length, 1);
    assert.equal(result.permanentlyFailed.length, 0);
    assert.deepEqual(await list('client-a'), [], 'outbox vazia após entrega');
  });

  it('flush removes only delivered entries when the first send fails mid-batch', async () => {
    await enqueue('s', 'falha', new Date('2026-01-01T00:00:00Z'), { clientId: 'client-a' });
    await enqueue('s', 'sucesso', new Date('2026-01-01T00:00:01Z'), { clientId: 'client-a' });

    let calls = 0;
    const result = await flush(async (entry) => {
      calls += 1;
      if (entry.text === 'falha') throw new Error('ainda offline');
    }, { clientId: 'client-a' });

    assert.equal(calls, 1, 'para na primeira falha para não queimar tentativas');
    assert.deepEqual(result.delivered, []);
    const remaining = await list('client-a');
    // A entrada que falhou permanece (tentativa recuperável) junto da que
    // não chegou a ser tentada nesta rodada.
    assert.equal(remaining.length, 2);
    const failedEntry = remaining.find((e) => e.text === 'falha');
    const pendingEntry = remaining.find((e) => e.text === 'sucesso');
    assert.equal(failedEntry?.attempts, 1, 'falha registrada como recuperável');
    assert.ok(failedEntry && !result.permanentlyFailed.includes(failedEntry));
    assert.equal(pendingEntry?.attempts, 0, 'não tentada, nenhuma queima');
  });

  it('caps retries at 3, reports permanent failure once and keeps the entry for recovery', async () => {
    const entry = await enqueue('session-x', 'nunca entregue', new Date(), { clientId: 'client-a' });
    const failingSend = async () => {
      throw new Error('offline');
    };

    // Rodadas 1 e 2: falha registrada, ainda recuperável.
    const round1 = await flush(failingSend, { clientId: 'client-a' });
    assert.equal(round1.permanentlyFailed.length, 0);
    assert.equal((await list('client-a'))[0].attempts, 1);

    await flush(failingSend, { clientId: 'client-a' });
    const round3 = await flush(failingSend, { clientId: 'client-a' });

    assert.equal(round3.permanentlyFailed.length, 1, 'toast único na 3ª falha');
    assert.equal(round3.permanentlyFailed[0].id, entry.id);
    assert.equal((await list('client-a'))[0].id, entry.id, 'entrada preservada até confirmação/ação do usuário');

    const round4 = await flush(failingSend, { clientId: 'client-a' });
    assert.equal(round4.permanentlyFailed.length, 0, 'não tenta indefinidamente uma entrada já esgotada');
    assert.equal((await list('client-a'))[0].attempts, 3);
  });

  it('remove() deletes exactly the delivered id and markFailed counts attempts', async () => {
    const kept = await enqueue('s', 'fica', new Date(), { clientId: 'client-a' });
    const gone = await enqueue('s', 'sai', new Date(), { clientId: 'client-a' });

    await remove(gone.id, 'client-a');
    let entries = await list('client-a');
    assert.deepEqual(entries.map((e) => e.text), ['fica']);

    assert.equal(await markFailed(kept.id, 'client-a'), false, '1 tentativa < cap de 3');
    assert.equal(await markFailed(kept.id, 'client-a'), false);
    assert.equal(await markFailed(kept.id, 'client-a'), true, '3 tentativas esgotam o cap');
    entries = await list('client-a');
    assert.equal(entries[0].attempts, 3);
  });

  it('associa a fila ao cliente e nunca reenvia mensagens de outro cliente', async () => {
    await enqueue('session-a', 'mensagem do cliente A', new Date(), { clientId: 'client-a', clientMessageId: 'a-1' });
    await enqueue('session-b', 'mensagem do cliente B', new Date(), { clientId: 'client-b', clientMessageId: 'b-1' });

    assert.deepEqual((await list('client-b')).map((entry) => entry.text), ['mensagem do cliente B']);

    const sent: string[] = [];
    await flush(async (entry) => sent.push(entry.text), { clientId: 'client-b' });
    assert.deepEqual(sent, ['mensagem do cliente B']);
    assert.deepEqual((await list('client-a')).map((entry) => entry.text), ['mensagem do cliente A']);
  });

  it('enfileira a mensagem quando o transporte falha antes de o servidor confirmar recebimento', async () => {
    globalThis.fetch = (async () => {
      throw new Error('network offline');
    }) as typeof fetch;

    const reply = await sendMessage('mensagem offline', 'session-offline', 'client-offline', 'mobile-offline-1');

    assert.equal(reply.dataState, 'UNAVAILABLE');
    const pending = await list('client-offline');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].clientMessageId, 'mobile-offline-1');
    assert.equal(pending[0].text, 'mensagem offline');
  });
});
