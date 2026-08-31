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
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
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

/** Adiciona uma mensagem à fila persistente. */
export async function enqueue(
  sessionId: string,
  text: string,
  now = new Date()
): Promise<OutboxEntry> {
  const entries = await readAll();
  const entry: OutboxEntry = {
    id: makeId(),
    sessionId,
    text,
    createdAt: now.toISOString(),
    attempts: 0,
  };
  entries.push(entry);
  await writeAll(entries);
  return entry;
}

/** Lista todas as mensagens pendentes (ordem de envio). */
export async function list(): Promise<OutboxEntry[]> {
  return readAll();
}

/** Remove uma entrada pelo id após reenvio bem-sucedido. */
export async function remove(id: string): Promise<void> {
  const entries = await readAll();
  await writeAll(entries.filter((entry) => entry.id !== id));
}

/**
 * Incrementa tentativas; ao atingir o limite (`cap`, default 3), marca como
 * falha definitiva e retorna true para que o chamador descarte/toaste.
 */
export async function markFailed(id: string, cap: number = MAX_RETRIES): Promise<boolean> {
  const entries = await readAll();
  const next = entries.map((entry) =>
    entry.id === id ? { ...entry, attempts: entry.attempts + 1 } : entry
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
 * tentativas nesta rodada (para toast único).
 */
export async function flush(
  send: (entry: OutboxEntry) => Promise<unknown>,
  options: { maxRetries?: number } = {}
): Promise<{ delivered: string[]; permanentlyFailed: OutboxEntry[] }> {
  const maxRetries = options.maxRetries ?? MAX_RETRIES;
  const delivered: string[] = [];
  const permanentlyFailed: OutboxEntry[] = [];

  for (const entry of await list()) {
    try {
      await send(entry);
      delivered.push(entry.id);
      await remove(entry.id);
    } catch {
      const exhausted = await markFailed(entry.id, maxRetries);
      if (exhausted) {
        permanentlyFailed.push(entry);
        await remove(entry.id);
      }
      break;
    }
  }

  return { delivered, permanentlyFailed };
}

