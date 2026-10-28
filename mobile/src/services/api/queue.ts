import type { DepartmentType, QueueCardData } from '../../types';
import { apiFetch, getApiUrl, getAuthHeaders, isApiServiceError, responseError, unavailableError } from './transport';
import { isDemoMode } from './demoAdapter';

export async function joinQueue(data: {
  sessionId: string;
  clientId: string;
  clientName?: string;
  department?: DepartmentType;
  reason?: string;
}): Promise<{ success: boolean; entry: QueueCardData }> {
  if (isDemoMode()) {
    return {
      success: true,
      entry: {
        queueId: 'DEMO-QUEUE',
        position: 1,
        estimatedWaitMinutes: 0,
        department: data.department || 'GERAL',
        status: 'QUEUED',
      },
    };
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/queue/join`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    if (res.ok) return await res.json();
    throw await responseError(res, 'Não foi possível entrar na fila de atendimento.');
  } catch (e) {
    console.warn('Backend indisponível para fila virtual:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('A fila de atendimento está indisponível. Nenhuma entrada foi criada.');
  }
}

export async function getQueueStatus(clientId: string): Promise<{ inQueue: boolean; entry?: QueueCardData; estimatedWaitMinutes: number }> {
  if (isDemoMode()) {
    return {
      inQueue: true,
      estimatedWaitMinutes: 0,
      entry: {
        queueId: 'DEMO-QUEUE',
        position: 1,
        estimatedWaitMinutes: 0,
        department: 'GERAL',
        status: 'QUEUED',
      },
    };
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/queue/status/${clientId}`, {
      headers: getAuthHeaders(),
    });
    if (res.ok) return await res.json();
    throw await responseError(res, 'Não foi possível consultar sua posição na fila.');
  } catch (e) {
    console.warn('Backend indisponível para status de fila:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('A fila de atendimento está indisponível.');
  }
}

export function subscribeQueueStream(
  clientId: string,
  onUpdate: (data: { inQueue: boolean; entry?: QueueCardData; estimatedWaitMinutes: number }) => void
): () => void {
  let isCancelled = false;
  const controller = new AbortController();
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pollingTimer: ReturnType<typeof setInterval> | undefined;
  let stableTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 3;
  const POLL_INTERVAL_MS = 5000;

  const clearTimer = (timer: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | undefined) => {
    if (timer) clearTimeout(timer);
  };

  const pollStatus = async () => {
    if (isCancelled) return;
    try {
      const res = await apiFetch(`${getApiUrl()}/queue/status/${clientId}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) onUpdate(await res.json());
    } catch (e) {
      if (!isCancelled) console.warn('[QueueSSE] Fallback de polling indisponível:', e);
    }
  };

  const startPolling = () => {
    if (isCancelled || pollingTimer) return;
    void pollStatus();
    pollingTimer = setInterval(() => void pollStatus(), POLL_INTERVAL_MS);
  };

  const scheduleReconnect = () => {
    if (isCancelled || pollingTimer) return;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      startPolling();
      return;
    }
    reconnectAttempts += 1;
    const delayMs = Math.min(1000 * 2 ** (reconnectAttempts - 1), 5000);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connectStream();
    }, delayMs);
    (reconnectTimer as any)?.unref?.();
  };

  const connectStream = async () => {
    try {
      const url = `${getApiUrl()}/queue/stream/${clientId}`;
      const res = await apiFetch(url, {
        headers: getAuthHeaders(),
        signal: controller.signal,
        noTimeout: true,
      });

      if (!res.ok || !res.body) {
        if (res.status === 401 || res.status === 403) {
          isCancelled = true;
          return;
        }
        scheduleReconnect();
        return;
      }

      clearTimer(stableTimer);
      stableTimer = setTimeout(() => { reconnectAttempts = 0; }, 30_000);
      (stableTimer as any)?.unref?.();

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (!isCancelled) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            try {
              const parsed = JSON.parse(jsonStr);
              onUpdate(parsed);
            } catch {
              // ignore parsing error
            }
          }
        }
      }
      if (!isCancelled) scheduleReconnect();
    } catch (e: any) {
      if (!isCancelled && e.name !== 'AbortError') {
        console.warn('[QueueSSE] Conexão SSE encerrada:', e?.message || e);
        scheduleReconnect();
      }
    }
  };

  connectStream();

  return () => {
    isCancelled = true;
    clearTimer(reconnectTimer);
    clearTimer(pollingTimer);
    clearTimer(stableTimer);
    controller.abort();
  };
}

export async function leaveQueue(clientId: string): Promise<{ success: boolean; message: string }> {
  if (isDemoMode()) {
    return { success: true, message: '[DEMO] Saída da fila simulada; nenhuma alteração foi enviada.' };
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/queue/leave`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ clientId }),
    });
    if (res.ok) return await res.json();
    throw await responseError(res, 'Não foi possível sair da fila.');
  } catch (e) {
    console.warn('Backend indisponível para sair da fila:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('A fila de atendimento está indisponível. Sua solicitação não foi confirmada.');
  }
}

export async function advanceQueue(clientId: string): Promise<{ success: boolean; entry: QueueCardData }> {
  if (isDemoMode()) {
    return {
      success: true,
      entry: {
        queueId: 'DEMO-QUEUE',
        position: 0,
        estimatedWaitMinutes: 0,
        department: 'SUPORTE',
        status: 'ASSIGNED',
        assignedAgent: {
          name: '[DEMO] Agente simulado',
          role: 'Demonstração local',
          department: 'SUPORTE',
        },
      },
    };
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/queue/progress`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ clientId }),
    });
    if (res.ok) return await res.json();
    throw await responseError(res, 'Não foi possível atualizar sua posição na fila.');
  } catch (e) {
    console.warn('Backend indisponível para avançar fila:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('A fila de atendimento está indisponível. Nenhuma alteração foi confirmada.');
  }
}

