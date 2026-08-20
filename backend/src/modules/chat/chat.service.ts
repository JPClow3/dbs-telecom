import { DepartmentType } from '../ai/ai.service.js';
import { ixcService } from '../ixc/ixc.service.js';
import { geminiProvider } from '../ai/gemini.provider.js';
import { ixcContextBuilder } from '../ai/ixc-context.builder.js';
import { CONFIG } from '../../config/env.js';
import { chatRepository } from './chat.repository.js';
import { processChatMessage } from './chat.conversation.js';
import { generateMsgId, type ChatMessage, type ChatSession } from './chat.types.js';

export type { ChatMessage, ChatSession } from './chat.types.js';

export class ChatService {
  private sessions: Map<string, ChatSession> = new Map();

  /**
   * Obtém ou inicializa uma sessão de atendimento com persistência SQLite
   */
  async getOrCreateSession(sessionId: string, clientId?: string, clientName?: string): Promise<ChatSession> {
    let session = this.sessions.get(sessionId);
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
      this.sessions.set(sessionId, session);
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
    const cached = this.sessions.get(sessionId);
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
    return this.sessions.get(sessionId)?.clientId;
  }

  /**
   * Lista todas as sessões de um determinado cliente
   */
  async listClientSessions(clientId: string): Promise<ChatSession[]> {
    try {
      return await chatRepository.listSessionsByClient(clientId);
    } catch {
      return Array.from(this.sessions.values()).filter((s) => s.clientId === clientId);
    }
  }

  /**
   * Gera a mensagem de saudação personalizada inicial consultando o IXC
   */
  async getInitialGreeting(clientId: string): Promise<ChatMessage> {
    const client = await ixcService.findClientById(clientId);
    const firstName = client?.razao ? client.razao.split(' ')[0] : 'Cliente';

    const greetingMsg: ChatMessage = {
      id: generateMsgId('msg'),
      sender: 'BOT',
      text: `Olá, ${firstName}! 👋\n\nSou o **Davi**, seu assistente de atendimento da **DBS TELECOM**. Como posso te ajudar hoje? Escolha uma das opções rápidas abaixo ou digite sua dúvida:`,
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
   */
  async processMessage(sessionId: string, userText: string, clientId?: string): Promise<ChatMessage> {
    return processChatMessage(
      {
        getOrCreateSession: this.getOrCreateSession.bind(this),
        pushHistory: this.pushHistory.bind(this),
      },
      sessionId,
      userText,
      clientId,
    );
  }

  /**
   * ⚡ Processa mensagem com Streaming SSE (efeito digitação em tempo real tipo ChatGPT)
   */
  async processStreamMessage(
    sessionId: string,
    userText: string,
    clientId: string | undefined,
    onChunk: (chunkText: string) => void
  ): Promise<ChatMessage> {
    const session = await this.getOrCreateSession(sessionId, clientId);
    const currentClientId = clientId || session.clientId || '';

    // Primeiro processa a mensagem para garantir consistência de regras e dados IXC
    const finalBotMessage = await this.processMessage(sessionId, userText, currentClientId);

    // Emite o texto em chunks progressivos simulando a digitação do LLM se a resposta foi instantânea
    const fullText = finalBotMessage.text;
    const words = fullText.split(' ');

    for (let i = 0; i < words.length; i++) {
      const piece = (i === 0 ? '' : ' ') + words[i];
      onChunk(piece);
      // Pequeno delay para efeito fluido
      if (words.length > 5) {
        await new Promise((r) => setTimeout(r, 12));
      }
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
      // 4. Processa a transcrição com todo o pipeline de IA, Guardrails e IXC
      botResponse = await this.processMessage(sessionId, transcript, currentClientId);
    }

    return {
      transcript,
      userMessage: userVoiceMsg,
      botMessage: botResponse,
    };
  }
}

export const chatService = new ChatService();
