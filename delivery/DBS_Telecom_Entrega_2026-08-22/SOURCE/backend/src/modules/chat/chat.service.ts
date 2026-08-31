import { DepartmentType } from '../ai/ai.service.js';
import { ixcService } from '../ixc/ixc.service.js';
import { geminiProvider } from '../ai/gemini.provider.js';
import { ixcContextBuilder } from '../ai/ixc-context.builder.js';
import { CONFIG } from '../../config/env.js';
import { chatRepository } from './chat.repository.js';
import { processChatMessage } from './chat.conversation.js';
import { generateMsgId, type ChatMessage, type ChatSession } from './chat.types.js';

export type { ChatMessage, ChatSession } from './chat.types.js';

/**
 * Estágios do pipeline emitidos como eventos SSE 'stage' para que o cliente
 * saiba que o atendimento está vivo enquanto ferramentas/IXC compõem a resposta.
 */
export type ChatPipelineStage =
  | 'recebido'
  | 'classificando'
  | 'consultando_ixc'
  | 'compondo_resposta';

export interface ProcessMessageOptions {
  /** Identificador gerado pelo cliente (uuid); habilita idempotência de ponta a ponta. */
  clientMessageId?: string;
  /** Observa o progresso do pipeline (usado pelos eventos SSE 'stage'). */
  onStage?: (stage: ChatPipelineStage) => void;
}

interface IdempotencyRecord<T> {
  createdAt: number;
  promise: Promise<T>;
}

/**
 * Guarda de idempotência em memória (LRU com TTL de 10 minutos).
 *
 * Garante execução única por chave (messageId do cliente): chamadas concorrentes
 * ou repetidas aguardam/recebem o resultado da primeira execução. Falhas NÃO são
 * memorizadas — a entrada é descartada para permitir retry legítimo do cliente.
 */
export class IdempotencyGuard {
  private static readonly TTL_MS = 10 * 60 * 1000;
  private static readonly MAX_ENTRIES = 1000;

  private records = new Map<string, IdempotencyRecord<unknown>>();

  private sweep(): void {
    const now = Date.now();
    for (const [key, record] of this.records) {
      if (now - record.createdAt > IdempotencyGuard.TTL_MS) {
        this.records.delete(key);
      }
    }
  }

  /**
   * Executa `work` no máximo uma vez por chave dentro do TTL.
   * Duplicatas aguardam a execução original e recebem o MESMO resultado.
   */
  async run<T>(key: string, work: () => Promise<T>): Promise<{ value: T; duplicate: boolean }> {
    this.sweep();
    const existing = this.records.get(key) as IdempotencyRecord<T> | undefined;
    if (existing) {
      return { value: await existing.promise, duplicate: true };
    }

    let fulfill!: (value: T) => void;
    let fail!: (error: unknown) => void;
    const promise = new Promise<T>((resolve, reject) => {
      fulfill = resolve;
      fail = reject;
    });
    // Evita unhandledRejection quando a execução falha sem nenhum duplicado esperando.
    promise.catch(() => undefined);

    const record: IdempotencyRecord<T> = { createdAt: Date.now(), promise };
    this.records.set(key, record as IdempotencyRecord<unknown>);
    if (this.records.size > IdempotencyGuard.MAX_ENTRIES) {
      const oldestKey = this.records.keys().next().value;
      if (oldestKey !== undefined && oldestKey !== key) {
        this.records.delete(oldestKey);
      }
    }

    try {
      const value = await work();
      fulfill(value);
      return { value, duplicate: false };
    } catch (error) {
      // Falha não é memorizada: o cliente pode reenviar o mesmo messageId.
      this.records.delete(key);
      fail(error);
      throw error;
    }
  }

  /** Limpa o mapa (uso em testes/diagnóstico). */
  reset(): void {
    this.records.clear();
  }
}

export const chatIdempotency = new IdempotencyGuard();

/**
 * Divide o texto em pedaços naturais de entrega (frases/linhas) preservando
 * EXATAMENTE a concatenação original (chunks.join('') === texto). Sem pausas
 * artificiais: os pedaços são entregues na velocidade em que existem.
 */
function splitIntoDeliveryChunks(text: string): string[] {
  if (!text) return [];
  const breakers = new Set(['.', '!', '?', '…', '\n']);
  const chunks: string[] = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    if (!breakers.has(text[i])) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < text.length && (breakers.has(text[j]) || text[j] === ' ' || text[j] === '\r')) {
      j += 1;
    }
    chunks.push(text.slice(start, j));
    start = j;
    i = j;
  }
  if (start < text.length) {
    chunks.push(text.slice(start));
  }
  return chunks.filter((chunk) => chunk.length > 0);
}

export class ChatService {
  /** Limite de sessões em memória para evitar crescimento descontrolado. */
  private static readonly MAX_CACHED_SESSIONS = 200;

  /** TTL do cache em memória: evita servir estado de sessão obsoleto por dias. */
  private static readonly SESSION_TTL_MS = 30 * 60 * 1000;

  private sessions: Map<string, ChatSession> = new Map();

  private sessionCacheTimestamps: Map<string, number> = new Map();

  private touchSession(sessionId: string): void {
    this.sessionCacheTimestamps.set(sessionId, Date.now());
  }

  private evictSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.sessionCacheTimestamps.delete(sessionId);
  }

  /** Remove do cache sessões inativas há mais de SESSION_TTL_MS. */
  private sweepExpiredSessions(): void {
    const now = Date.now();
    for (const [sessionId, cachedAt] of this.sessionCacheTimestamps) {
      if (now - cachedAt > ChatService.SESSION_TTL_MS) {
        this.evictSession(sessionId);
      }
    }
  }

  /** Cache miss se a entrada expirou (TTL); nesse caso descarta e recarrega. */
  private getFreshCachedSession(sessionId: string): ChatSession | undefined {
    const cached = this.sessions.get(sessionId);
    const cachedAt = this.sessionCacheTimestamps.get(sessionId);
    if (!cached) return undefined;
    if (cachedAt === undefined || Date.now() - cachedAt > ChatService.SESSION_TTL_MS) {
      this.evictSession(sessionId);
      return undefined;
    }
    this.touchSession(sessionId);
    return cached;
  }

  private cacheSession(session: ChatSession): void {
    this.sweepExpiredSessions();
    this.sessions.set(session.sessionId, session);
    this.touchSession(session.sessionId);
    if (this.sessions.size > ChatService.MAX_CACHED_SESSIONS) {
      // Descarta a entrada mais antiga (ordem de inserção do Map).
      const oldestKey = this.sessions.keys().next().value;
      if (oldestKey !== undefined) {
        this.evictSession(oldestKey);
      }
    }
  }

  /**
   * Obtém ou inicializa uma sessão de atendimento com persistência SQLite
   */
  async getOrCreateSession(sessionId: string, clientId?: string, clientName?: string): Promise<ChatSession> {
    let session = this.getFreshCachedSession(sessionId);
    if (!session) {
      try {
        session = await chatRepository.getOrCreateSession(sessionId, clientId, clientName);
      } catch (err) {
        console.warn('[ChatService] Erro ao acessar SQLite, usando fallback em memória:', err);
        session = {
          sessionId,
          clientId,
          clientName: clientName || (clientId ? 'Cliente' : undefined),
          currentDepartment: 'GERAL',
          history: [],
          createdAt: new Date().toISOString(),
        };
      }
      this.cacheSession(session);
    } else {
      let updated = false;
      if (clientId && !session.clientId) {
        session.clientId = clientId;
        updated = true;
      }
      if (clientName && !session.clientName) {
        session.clientName = clientName;
        updated = true;
      }
      if (updated) {
        try {
          await chatRepository.updateSession(session);
        } catch {}
      }
    }
    return session;
  }

  /**
   * Adiciona mensagem ao histórico com limite de 50 mensagens e persiste no SQLite
   */
  private async pushHistory(session: ChatSession, msg: ChatMessage): Promise<void> {
    session.history.push(msg);
    // Sessão ativa em conversa não deve expirar no meio do atendimento.
    if (this.sessions.has(session.sessionId)) {
      this.touchSession(session.sessionId);
    }
    if (session.history.length > 50) {
      session.history = session.history.slice(-50);
    }
    try {
      await chatRepository.addMessage(session.sessionId, msg);
    } catch (err) {
      console.warn('[ChatService] Erro ao persistir mensagem no SQLite:', err);
    }
  }

  /**
   * Recupera o histórico completo persistido de uma sessão
   */
  async getSessionHistory(sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
    const cached = this.getFreshCachedSession(sessionId);
    if (cached && cached.history.length > 0) {
      return cached.history;
    }
    try {
      const history = await chatRepository.getSessionHistory(sessionId, limit);
      if (cached) cached.history = history;
      return history;
    } catch {
      return cached ? cached.history : [];
    }
  }

  /** Returns the persisted owner without creating a session. */
  async getSessionOwner(sessionId: string): Promise<string | null | undefined> {
    try {
      const persistedOwner = await chatRepository.getSessionOwner(sessionId);
      if (persistedOwner !== undefined) return persistedOwner;
    } catch {
      // Fall through to the in-process cache for test/dev SQLite outages.
    }
    return this.getFreshCachedSession(sessionId)?.clientId;
  }

  /**
   * Lista todas as sessões de um determinado cliente
   */
  async listClientSessions(clientId: string): Promise<ChatSession[]> {
    try {
      return await chatRepository.listSessionsByClient(clientId);
    } catch {
      this.sweepExpiredSessions();
      return Array.from(this.sessions.values()).filter((s) => s.clientId === clientId);
    }
  }

  /**
   * Gera a mensagem de saudação personalizada inicial consultando o IXC
  /**
   * Gera a mensagem de saudação personalizada inicial consultando o IXC com contexto de horário
   */
  async getInitialGreeting(clientId: string): Promise<ChatMessage> {
    const client = await ixcService.findClientById(clientId);
    const firstName = client?.razao ? client.razao.split(' ')[0] : 'Cliente';

    const hour = new Date().getHours();
    let timeGreeting = 'Olá';
    if (hour >= 5 && hour < 12) {
      timeGreeting = 'Bom dia';
    } else if (hour >= 12 && hour < 18) {
      timeGreeting = 'Boa tarde';
    } else {
      timeGreeting = 'Boa noite';
    }

    const greetingMsg: ChatMessage = {
      id: generateMsgId('msg'),
      sender: 'BOT',
      text: `${timeGreeting}, ${firstName}! 👋\n\nSou o **Davi**, seu especialista de atendimento digital da **DBS TELECOM**. Estou aqui para tornar sua experiência o mais rápida e simples possível.\n\nComo posso te ajudar agora? Escolha um dos atalhos abaixo ou me envie uma mensagem (em texto ou áudio):`,
      timestamp: new Date().toISOString(),
      department: 'GERAL',
      aiProvider: 'fast-route',
      aiModel: 'dbs-fast-router-v1',
      quickOptions: [
        'Preciso do meu boleto 💳',
        'Minha internet está lenta 🛠️',
        'Quero contratar ou mudar de plano 🚀',
        'Conhecer planos Wi-Fi 6 📶',
        'Falar com atendente 👤',
      ],
    };

    return greetingMsg;
  }

  /**
   * Processa a mensagem do cliente com Fast Router / IA Gemini / Guardrails / IXC
   *
   * Compartilha o MESMO espaço de chaves de idempotência do fluxo de streaming:
   * um reenvio síncrono do cliente (fallback pós-falha de stream) com o mesmo
   * messageId devolve o resultado original em vez de duplicar ticket/histórico.
   */
  async processMessage(
    sessionId: string,
    userText: string,
    clientId?: string,
    options: { clientMessageId?: string } = {}
  ): Promise<ChatMessage> {
    const idempotencyKey = options.clientMessageId
      ? `chat:${sessionId}:${options.clientMessageId}`
      : `chat:${sessionId}:auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { value } = await chatIdempotency.run(idempotencyKey, () =>
      processChatMessage(
        {
          getOrCreateSession: this.getOrCreateSession.bind(this),
          pushHistory: this.pushHistory.bind(this),
        },
        sessionId,
        userText,
        clientId,
        // O turno do usuário recebe o messageId do cliente como id estável;
        // o upsert por id no SQLite converge retries em vez de duplicar.
        { clientMessageId: options.clientMessageId }
      )
    );
    return value;
  }

  /**
   * ⚡ Processa mensagem com entrega progressiva HONESTA via SSE.
   *
   * O pipeline de atendimento (classificação, guardrails, IXC, fila, suporte)
   * é orquestrado e compõe a resposta completa — não existe geração token a
   * token por trás dele. Em vez de fingir digitação com delays artificiais,
   * este método:
   *   1. emite eventos de estágio ('stage') para o cliente acompanhar o
   *      progresso real (classificação, consultas IXC, composição);
   *   2. entrega o texto final em pedaços naturais (frases/linhas) sem NENHUM
   *      delay sintético — a latência que existe é a do processamento real;
   *   3. garante idempotência por messageId (retry do cliente não duplica
   *      ticket, mensagem persistida ou entrada de fila).
   */
  async processStreamMessage(
    sessionId: string,
    userText: string,
    clientId: string | undefined,
    onChunk: (chunkText: string) => void,
    options: ProcessMessageOptions = {}
  ): Promise<ChatMessage> {
    const session = await this.getOrCreateSession(sessionId, clientId);
    const currentClientId = clientId || session.clientId || '';
    const { clientMessageId, onStage } = options;

    onStage?.('recebido');

    // Idempotência: a mesma mensagem do cliente (mesmo messageId) nunca executa
    // o pipeline duas vezes — evita ticket duplicado, mensagem repetida no
    // histórico e entrada dupla na fila quando o cliente reenvia após falha.
    const idempotencyKey = clientMessageId
      ? `chat:${sessionId}:${clientMessageId}`
      : `chat:${sessionId}:auto-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { value: finalBotMessage, duplicate } = await chatIdempotency.run(idempotencyKey, async () => {
      onStage?.('classificando');
      const message = await this.processMessage(sessionId, userText, currentClientId);
      onStage?.('compondo_resposta');
      return message;
    });

    if (duplicate) {
      // Retry de mensagem já processada: devolve o MESMO resultado sem
      // reexecutar o pipeline (nenhum ticket/histórico/fila duplicado).
      onStage?.('compondo_resposta');
    }

    // Entrega progressiva honesta: pedaços naturais do texto, sem delays
    // artificiais. A concatenação dos chunks reproduz exatamente o texto final.
    for (const piece of splitIntoDeliveryChunks(finalBotMessage.text)) {
      onChunk(piece);
    }

    return finalBotMessage;
  }

  /**
   * 🎙️ Processa mensagem de áudio / voz do usuário via Google Gemini Multimodal
   */
  async processAudioMessage(
    sessionId: string,
    audioBase64: string,
    mimeType: string = 'audio/webm',
    clientId?: string
  ): Promise<{ transcript: string; userMessage: ChatMessage; botMessage: ChatMessage }> {
    const session = await this.getOrCreateSession(sessionId, clientId);
    const currentClientId = clientId || session.clientId || '';

    let transcript = '';

    // 1. Tenta processamento com Google Gemini Multimodal
    if (geminiProvider.isConfigured()) {
      try {
        const bundle = await ixcContextBuilder.buildContext(currentClientId);
        const geminiRes = await geminiProvider.processAudioMessage({
          audioBase64,
          mimeType,
          clientId: currentClientId,
          contextBundle: bundle,
        });

        if (geminiRes?.transcript) {
          transcript = geminiRes.transcript.trim();
        }
      } catch (err) {
        console.warn('[ChatService] Falha na transcrição multimodal do Gemini:', err);
      }
    }

    if (!transcript) {
      transcript = 'Mensagem de áudio';
    }

    // 2. Registra a mensagem de áudio do usuário
    const userVoiceMsg: ChatMessage = {
      id: generateMsgId('usr-audio'),
      sender: 'USER',
      text: `🎙️ "${transcript}"`,
      timestamp: new Date().toISOString(),
      cards: {
        type: 'AUDIO',
        audio: {
          transcript,
          mimeType,
          durationSeconds: 5,
        },
      },
    };
    await this.pushHistory(session, userVoiceMsg);

    // 3. Se for áudio inaudível, tom puro ou ruído estático sem fala
    const isUnaudible =
      transcript.includes('[Áudio inaudível') ||
      transcript.includes('[tom de discagem]') ||
      transcript.toLowerCase().includes('ruído') ||
      transcript.toLowerCase().includes('ruido') ||
      transcript.toLowerCase().includes('estática') ||
      transcript.toLowerCase().includes('estatica') ||
      transcript.toLowerCase().includes('inaudível') ||
      transcript.toLowerCase().includes('inaudivel') ||
      transcript === 'Mensagem de áudio';

    let botResponse: ChatMessage;

    if (isUnaudible) {
      botResponse = {
        id: generateMsgId('msg'),
        sender: 'BOT',
        text: '🎙️ Recebi sua mensagem de voz, mas não consegui ouvir com clareza o que foi falado. Por favor, envie o áudio novamente ou escolha uma das opções abaixo:',
        timestamp: new Date().toISOString(),
        department: 'GERAL',
        aiProvider: 'gemini',
        aiModel: CONFIG.ai.geminiModel,
        quickOptions: [
          'Preciso do meu boleto 💳',
          'Minha internet está lenta 🛠️',
          'Contratar plano de internet 🚀',
          'Falar com atendente 👤',
        ],
      };
      await this.pushHistory(session, botResponse);
    } else {
      // 4. Processa a transcrição com todo o pipeline de IA, Guardrails e IXC.
      // A mensagem do usuário já foi registrada acima (áudio + transcrição),
      // então o pipeline não deve duplicá-la no histórico.
      botResponse = await processChatMessage(
        {
          getOrCreateSession: this.getOrCreateSession.bind(this),
          pushHistory: this.pushHistory.bind(this),
        },
        sessionId,
        transcript,
        currentClientId,
        { skipUserTurn: true },
      );
    }

    return {
      transcript,
      userMessage: userVoiceMsg,
      botMessage: botResponse,
    };
  }
}

export const chatService = new ChatService();
