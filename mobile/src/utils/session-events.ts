// Eventos de sessão globais: a camada de rede emite, a navegação escuta.
//
// Deliberadamente sem dependências de React/RN para poder ser importado por
// qualquer módulo (inclusive os testados via `tsx --test`).

export type ForceLogoutReason = 'sessao_expirada' | string;

type ForceLogoutListener = (reason: ForceLogoutReason) => void;

const listeners = new Set<ForceLogoutListener>();

/** Emite o pedido global de logout. Chamado pela camada de rede em 401/403 de sessão. */
export function forceLogout(reason: ForceLogoutReason): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(reason);
    } catch (error) {
      // Um listener quebrado não pode derrubar os demais nem o fluxo de rede.
      console.warn('[session-events] Listener de forceLogout falhou:', error);
    }
  }
}

/** Assina o evento global de logout; retorna a função de dessubscrição. */
export function onForceLogout(listener: ForceLogoutListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Uso exclusivo dos testes: limpa todos os listeners registrados. */
export function __resetSessionEventsForTests(): void {
  listeners.clear();
}
