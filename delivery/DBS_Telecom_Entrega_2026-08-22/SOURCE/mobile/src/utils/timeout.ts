// Utilitários de timeout para requisições de rede (evita spinner eterno).

export const DEFAULT_TIMEOUT_MS = 15000;

export interface TimeoutHandle {
  signal: AbortSignal;
  /** Deve ser chamado em finally para liberar o timer. */
  clear(): void;
}

export function createTimeoutSignal(timeoutMs: number = DEFAULT_TIMEOUT_MS): TimeoutHandle {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Tempo limite excedido (${timeoutMs}ms)`));
  }, timeoutMs);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}
