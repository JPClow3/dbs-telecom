import type { ChatMessage, DepartmentType } from '../../types';
import { apiFetch, getApiUrl, getAuthHeaders, isApiServiceError, responseError, unavailableError, unavailableMessage } from './transport';
import { isDemoMode, processOfflineMessage } from './demoAdapter';
import * as outbox from '../../utils/outbox';

export async function getInitialGreeting(clientId: string): Promise<ChatMessage> {
  if (isDemoMode()) {
    return processOfflineMessage('olá', clientId);
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/chat/greeting`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ clientId }),
    });
    if (res.ok) {
      const message = await res.json();
      return { ...message, dataState: 'LIVE' };
    }
    throw await responseError(res, 'Não foi possível carregar o atendimento.');
  } catch (e) {
    console.warn('Backend indisponível para greeting:', e);
    if (isApiServiceError(e) && e.kind === 'UNAUTHORIZED') {
      return unavailableMessage(
        'Sua sessão expirou. Volte à tela de login para autenticar novamente.',
        'UNAUTHORIZED'
      );
    }
  }

  return unavailableMessage(
    'O atendimento está temporariamente indisponível. Nenhuma solicitação foi registrada. Tente novamente em instantes.'
  );
}

export async function sendMessage(
  message: string,
  sessionId: string,
  clientId?: string,
  clientMessageId?: string,
  enqueueOnFailure = true,
): Promise<ChatMessage> {
  if (isDemoMode()) {
    return processOfflineMessage(message, clientId);
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/chat/message`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, sessionId, clientId, clientMessageId }),
    });

    if (res.ok) return { ...(await res.json()), dataState: 'LIVE' };
    throw await responseError(res, 'Não foi possível enviar sua mensagem.');
  } catch (e) {
    console.warn('Backend BFF offline ou inacessível:', e);
    const shouldQueue = !isApiServiceError(e) || e.kind === 'UNAVAILABLE' || e.kind === 'TIMEOUT';
    if (enqueueOnFailure && shouldQueue) {
      try {
        await outbox.enqueue(sessionId, message, new Date(), { clientId, clientMessageId });
      } catch (outboxError) {
        console.warn('Não foi possível salvar a mensagem para reenvio:', outboxError);
      }
    }
    if (isApiServiceError(e) && e.kind === 'UNAUTHORIZED') {
      return unavailableMessage(
        'Sua sessão expirou. Entre novamente para continuar o atendimento.',
        'UNAUTHORIZED'
      );
    }
  }

  return unavailableMessage(
    'Não consegui conectar ao atendimento. Sua mensagem não foi registrada. Tente novamente.'
  );
}

export async function sendMessageStream(
  message: string,
  sessionId: string,
  clientId: string,
  onChunk: (chunk: string) => void,
  onComplete: (msg: ChatMessage) => void,
  onError?: (err: any) => void,
  clientMessageId?: string
): Promise<void> {
  if (isDemoMode()) {
    const demoMessage = processOfflineMessage(message, clientId);
    const words = demoMessage.text.split(' ');
    for (let i = 0; i < words.length; i++) {
      onChunk((i === 0 ? '' : ' ') + words[i]);
      if (words.length > 5) await new Promise((resolve) => setTimeout(resolve, 14));
    }
    onComplete(demoMessage);
    return;
  }

  const controller = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), 90_000);
  };

  try {
    resetIdleTimer();
    const response = await apiFetch(`${getApiUrl()}/chat/message/stream`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ message, sessionId, clientId, clientMessageId }),
      signal: controller.signal,
      noTimeout: true,
    });

    if (!response.ok || !response.body) {
      throw new Error(`SSE stream HTTP error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finalizedMessage: ChatMessage | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resetIdleTimer();

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const eventBlock of events) {
        const lines = eventBlock.split('\n');
        let currentEvent = 'message';
        let dataStr = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataStr = line.slice(6).trim();
          }
        }

        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            if (currentEvent === 'chunk' && parsed.chunk) {
              onChunk(parsed.chunk);
            } else if (currentEvent === 'done' && parsed.message) {
              finalizedMessage = parsed.message;
            }
          } catch (e) {
            // ignore parse errors on fragmented SSE lines
          }
        }
      }
    }

    if (finalizedMessage) {
      onComplete(finalizedMessage);
      return;
    }
    throw unavailableError('O atendimento encerrou antes de concluir a resposta. Tente novamente.');
  } catch (e) {
    console.warn('Streaming SSE indisponível:', e);
    onError?.(isApiServiceError(e) ? e : unavailableError('Atendimento indisponível.'));
    throw e;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

export async function sendAudioMessage(
  audioBase64: string,
  mimeType: string,
  sessionId: string,
  clientId?: string
): Promise<{ transcript: string; userMessage: ChatMessage; botMessage: ChatMessage }> {
  if (isDemoMode()) {
    const transcript = '[DEMO] Mensagem de voz simulada';
    return {
      transcript,
      userMessage: {
        id: `demo-audio-user-${Date.now()}`,
        sender: 'USER',
        text: `🎙️ "${transcript}"`,
        timestamp: new Date().toISOString(),
        dataState: 'DEMO',
        cards: { type: 'AUDIO', audio: { transcript, mimeType, durationSeconds: 4 } },
      },
      botMessage: {
        id: `demo-audio-bot-${Date.now()}`,
        sender: 'BOT',
        text: '[DEMO] Áudio simulado. Nenhuma mensagem foi enviada ao servidor.',
        timestamp: new Date().toISOString(),
        department: 'GERAL',
        dataState: 'DEMO',
      },
    };
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/chat/audio`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ audioBase64, mimeType, sessionId, clientId }),
    });

    if (res.ok) {
      return await res.json();
    }
    throw await responseError(res, 'Não foi possível enviar o áudio.');
  } catch (e) {
    console.warn('Backend indisponível para áudio:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('Não foi possível enviar o áudio. Nenhuma mensagem foi registrada.');
  }
}

export async function submitCSAT(data: {
  clientId: string;
  clientName?: string;
  sessionId?: string;
  rating: number;
  comment?: string;
  tags?: string[];
  department?: DepartmentType;
  context?: 'DIAGNOSTIC' | 'HIRING' | 'FINANCIAL' | 'GENERAL';
  targetProtocol?: string;
}): Promise<{ success: boolean; message: string }> {
  if (isDemoMode()) {
    return { success: true, message: '[DEMO] Avaliação simulada; nenhuma resposta foi salva.' };
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/chat/csat`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });

    if (res.ok) {
      return await res.json();
    }
    throw await responseError(res, 'Não foi possível registrar sua avaliação.');
  } catch (e) {
    console.warn('Backend indisponível para CSAT:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('Não foi possível registrar sua avaliação. Nenhuma resposta foi salva.');
  }
}

export async function getCSATStats() {
  if (isDemoMode()) {
    return {
      totalResponses: 0,
      averageRating: 0,
      npsScore: 0,
      ratingDistribution: {},
      dataState: 'DEMO' as const,
    };
  }

  try {
    const res = await apiFetch(`${getApiUrl()}/chat/csat/stats`, { headers: getAuthHeaders() });
    if (res.ok) return await res.json();
    throw await responseError(res, 'Não foi possível carregar as avaliações.');
  } catch (e) {
    console.warn('Backend indisponível para CSAT stats:', e);
    throw isApiServiceError(e)
      ? e
      : unavailableError('Não foi possível carregar as avaliações.');
  }
}
