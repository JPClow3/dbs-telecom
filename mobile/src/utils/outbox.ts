// Outbox offline para mensagens de chat: persiste envios que falharam por
// falta de conexão e permite reenvio quando a rede volta.
//
// Sem dependência estática do react-native / AsyncStorage no escopo do módulo
// (o storage é injetável), o utilitário roda também sob `tsx --test`.

export interface OutboxEntry {
  id: string;
  sessionId: string;
  text: string;
  createdAt: string;
  /** Número de tentativas de reenvio já feitas. */
  attempts: number;
  /** Customer identity that originated the message; required for safe flush. */
  clientId: string;
  /** Stable id shared with the backend idempotency key. */
  clientMessageId: string;
}

const STORAGE_KEY = '@dbs/outbox/chat';
const MAX_RETRIES = 3;

type StorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

let storage: StorageLike | null = null;

function getStorage(): StorageLike | null {
  if (storage) return storage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AsyncStorage =
      require('@react-native-async-storage/async-storage').default ??
      require('@react-native-async-storage/async-storage');
    storage = AsyncStorage as StorageLike;
  } catch {
    // Ambiente sem AsyncStorage (ex.: testes): outbox fica inoperante em vez
    // de derrubar o app; chamadores recebem listas vazias e false no flush.
    storage = null;
  }
  return storage;
}

/** Injeta um backend de armazenamento (usado pelos testes). */
export function setOutboxStorage(custom: StorageLike | null): void {
  storage = custom;
}

function makeId(): string {
  return `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function readAll(): Promise<OutboxEntry[]> {
  const store = getStorage();
  if (!store) return [];
  try {
    const raw = await store.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is OutboxEntry => Boolean(
      entry && typeof entry === 'object' &&
      typeof entry.id === 'string' &&
      typeof entry.sessionId === 'string' &&
      typeof entry.clientId === 'string' && entry.clientId.trim() &&
      typeof entry.clientMessageId === 'string' && entry.clientMessageId.trim() &&
      typeof entry.text === 'string' &&
      typeof entry.createdAt === 'string' &&
      Number.isFinite(entry.attempts)
    ));
  } catch {
    // JSON corrompido: recomeça vazio em vez de travar o chat para sempre.
    return [];
  }
}

async function writeAll(entries: OutboxEntry[]): Promise<void> {
  const store = getStorage();
  if (!store) return;
  await store.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function requireClientId(clientId: string, operation: string): string {
  const normalized = clientId.trim();
  if (!normalized) throw new Error(`clientId é obrigatório para ${operation}.`);
  return normalized;
}

/** Adiciona uma mensagem à fila persistente. */
export async function enqueue(
  sessionId: string,
  text: string,
  now = new Date(),
  metadata: { clientId?: string; clientMessageId?: string } = {}
): Promise<OutboxEntry> {
  const clientId = metadata.clientId?.trim();
  if (!clientId) throw new Error('clientId é obrigatório para enfileirar uma mensagem.');
  const entries = await readAll();
  const id = makeId();
  const entry: OutboxEntry = {
    id,
    sessionId,
    text,
    createdAt: now.toISOString(),
    attempts: 0,
    clientId,
    clientMessageId: metadata.clientMessageId?.trim() || id,
  };
  entries.push(entry);
  await writeAll(entries);
  return entry;
}

/** Lista todas as mensagens pendentes (ordem de envio). */
export async function list(clientId: string): Promise<OutboxEntry[]> {
  const scopedClientId = requireClientId(clientId, 'listar a outbox');
  const entries = await readAll();
  return entries.filter((entry) => entry.clientId === scopedClientId);
}

/** Remove uma entrada pelo id após reenvio bem-sucedido. */
export async function remove(id: string, clientId: string): Promise<void> {
  const scopedClientId = requireClientId(clientId, 'remover uma entrada da outbox');
  const entries = await readAll();
  await writeAll(entries.filter((entry) => entry.id !== id || entry.clientId !== scopedClientId));
}

/**
 * Incrementa tentativas; ao atingir o limite (`cap`, default 3), marca como
 * falha definitiva e retorna true para que o chamador mostre um aviso. A
 * entrada permanece armazenada até uma entrega ou remoção explícita.
 */
export async function markFailed(id: string, clientId: string, cap: number = MAX_RETRIES): Promise<boolean> {
  const scopedClientId = requireClientId(clientId, 'contar uma falha');
  const entries = await readAll();
  const next = entries.map((entry) =>
    entry.id === id && entry.clientId === scopedClientId
      ? { ...entry, attempts: Math.min(cap, entry.attempts + 1) }
      : entry
  );
  await writeAll(next);
  const updated = next.find((entry) => entry.id === id);
  return Boolean(updated && updated.attempts >= cap);
}

/**
 * Tenta reenviar todas as mensagens pendentes usando a função de envio
 * fornecida. Sucesso => remove da fila; falha => incrementa tentativas e,
 * no limite (default 3), desiste e reporta como definitivamente perdida.
 *
 * Interrompe a rodada na primeira falha (um outage queimaria todas as
 * tentativas de uma vez) e retorna os ids entregues e os que esgotaram
 * tentativas nesta rodada (para toast único). Entradas esgotadas permanecem
 * armazenadas para recuperação/remoção explícita, mas não são reenviadas.
 */
export async function flush(
  send: (entry: OutboxEntry) => Promise<unknown>,
  options: { maxRetries?: number; clientId: string }
): Promise<{ delivered: string[]; permanentlyFailed: OutboxEntry[] }> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const clientId = requireClientId(options.clientId, 'reenviar a outbox');
  const delivered: string[] = [];
  const permanentlyFailed: OutboxEntry[] = [];

  for (const entry of await list(clientId)) {
    if (entry.attempts >= maxRetries) continue;
    try {
      await send(entry);
      delivered.push(entry.id);
      await remove(entry.id, clientId);
    } catch {
      const exhausted = await markFailed(entry.id, clientId, maxRetries);
      if (exhausted) {
        const updated = (await list(clientId)).find((candidate) => candidate.id === entry.id);
        permanentlyFailed.push(updated || { ...entry, attempts: maxRetries });
      }
      break;
    }
  }

  return { delivered, permanentlyFailed };
}

