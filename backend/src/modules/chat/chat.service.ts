import { aiService, DepartmentType, AIClassificationResult } from '../ai/ai.service.js';
import { commercialService, DBSPlan } from '../commercial/commercial.service.js';
import { financialService, FormattedInvoice } from '../financial/financial.service.js';
import { supportService } from '../support/support.service.js';
import { ixcService } from '../ixc/ixc.service.js';
import { queueService, QueueEntry } from '../queue/queue.service.js';
import { geminiProvider } from '../ai/gemini.provider.js';
import { ixcContextBuilder, IXCContextBundle } from '../ai/ixc-context.builder.js';
import { fastRouterService } from '../ai/fast-router.service.js';
import { aiGuardrails } from '../ai/ai.guardrails.js';
import { CONFIG } from '../../config/env.js';
import { chatRepository } from './chat.repository.js';

export interface ChatMessage {
  id: string;
  sender: 'USER' | 'BOT' | 'SYSTEM';
  text: string;
  timestamp: string;
  department?: DepartmentType;
  quickOptions?: string[];
  aiProvider?: string;
  aiModel?: string;
  guardrailApplied?: boolean;
  cards?: {
    type: 'INVOICE' | 'PLANS' | 'DIAGNOSTIC' | 'TICKET' | 'CSAT' | 'QUEUE' | 'AUDIO';
    invoices?: FormattedInvoice[];
    plans?: DBSPlan[];
    ticketProtocol?: string;
    csat?: {
      id: string;
      question: string;
      context: 'DIAGNOSTIC' | 'HIRING' | 'FINANCIAL' | 'GENERAL';
      targetProtocol?: string;
    };
    queue?: QueueEntry;
    audio?: {
      transcript: string;
      durationSeconds?: number;
      mimeType?: string;
    };
  };
}

export interface ChatSession {
  sessionId: string;
  clientId?: string;
  clientName?: string;
  currentDepartment: DepartmentType;
  history: ChatMessage[];
  createdAt: string;
}

function generateMsgId(prefix: string = 'msg'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export class ChatService {
  private sessions: Map<string, ChatSession> = new Map();

  /**
   * Obtém ou inicializa uma sessão de atendimento com persistência SQLite
   */
  getOrCreateSession(sessionId: string, clientId?: string, clientName?: string): ChatSession {
    let session = this.sessions.get(sessionId);
    if (!session) {
      try {
        session = chatRepository.getOrCreateSession(sessionId, clientId, clientName);
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
          chatRepository.updateSession(session);
        } catch {}
      }
    }
    return session;
  }

  /**
   * Adiciona mensagem ao histórico com limite de 50 mensagens e persiste no SQLite
   */
  private pushHistory(session: ChatSession, msg: ChatMessage): void {
    session.history.push(msg);
    if (session.history.length > 50) {
      session.history = session.history.slice(-50);
    }
    try {
      chatRepository.addMessage(session.sessionId, msg);
    } catch (err) {
      console.warn('[ChatService] Erro ao persistir mensagem no SQLite:', err);
    }
  }

  /**
   * Recupera o histórico completo persistido de uma sessão
   */
  getSessionHistory(sessionId: string, limit: number = 50): ChatMessage[] {
    const cached = this.sessions.get(sessionId);
    if (cached && cached.history.length > 0) {
      return cached.history;
    }
    try {
      const history = chatRepository.getSessionHistory(sessionId, limit);
      if (cached) cached.history = history;
      return history;
    } catch {
      return cached ? cached.history : [];
    }
  }

  /**
   * Lista todas as sessões de um determinado cliente
   */
  listClientSessions(clientId: string): ChatSession[] {
    try {
      return chatRepository.listSessionsByClient(clientId);
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
    const session = this.getOrCreateSession(sessionId, clientId);
    const currentClientId = clientId || session.clientId || '2270';
    const customerFirstName = session.clientName ? session.clientName.split(' ')[0] : 'Cliente';

    // Registra a mensagem do usuário no histórico da sessão
    const userMsg: ChatMessage = {
      id: generateMsgId('usr'),
      sender: 'USER',
      text: userText,
      timestamp: new Date().toISOString(),
    };
    this.pushHistory(session, userMsg);

    // 1. Invoca motor de classificação com Fast Router, Guardrails e Injeção de Contexto do IXC
    const classification: AIClassificationResult = await aiService.classifyMessage(userText, {
      clientId: currentClientId,
      customerName: session.clientName,
      previousDepartment: session.currentDepartment,
      history: session.history.map((m) => ({ sender: m.sender, text: m.text })),
    });

    // Se a intenção for TRANSBORDO HUMANO / FALAR COM ATENDENTE
    if (classification.intent === 'TRANSBORDO_HUMANO') {
      const queueEntry = queueService.joinQueue({
        sessionId,
        clientId: currentClientId,
        clientName: session.clientName || 'Emanuel da Silva',
        department: session.currentDepartment || 'GERAL',
        reason: userText,
      });

      const botMsg: ChatMessage = {
        id: generateMsgId('msg'),
        sender: 'BOT',
        text: `👤 **Fila Virtual de Atendimento Humano DBS Telecom**\n\nTransferi sua solicitação para a nossa equipe de especialistas. Você está na posição **${queueEntry.position}º lugar** com tempo estimado de espera de **~${queueEntry.estimatedWaitMinutes} minutos**.\n\nEnquanto isso, você pode continuar tirando dúvidas com o assistente inteligente ou aguardar seu chamado ser atendido:`,
        timestamp: new Date().toISOString(),
        department: session.currentDepartment,
        aiProvider: 'queue-system',
        aiModel: 'dbs-virtual-queue-v1',
        quickOptions: ['Cancelar espera ❌', 'Ver status da fila ⏱️', 'Minha internet está lenta 🛠️', 'Segunda via boleto 💳'],
        cards: {
          type: 'QUEUE',
          queue: queueEntry,
        },
      };

      this.pushHistory(session, botMsg);
      return botMsg;
    }

    // Se a mensagem foi interceptada por um Guardrail de segurança ou escopo, retorna imediatamente
    if (classification.guardrailApplied) {
      const botMsg: ChatMessage = {
        id: generateMsgId('msg'),
        sender: 'BOT',
        text: classification.friendlyMessage || 'Olá! Sou o assistente oficial da **DBS TELECOM**. Como posso te ajudar com a sua conexão?',
        timestamp: new Date().toISOString(),
        department: classification.department || 'GERAL',
        aiProvider: classification.aiProvider,
        aiModel: classification.aiModel,
        guardrailApplied: true,
        quickOptions: [
          'Preciso do meu boleto 💳',
          'Minha internet está lenta 🛠️',
          'Contratar plano de internet 🚀',
          'Planos Wi-Fi 6 📶',
          'Falar com atendente 👤',
        ],
      };
      this.pushHistory(session, botMsg);
      return botMsg;
    }

    const diagState = supportService.getState(currentClientId);

    // Se estiver em suporte ativo e o usuário estiver respondendo ao teste (sem mudança brusca para financeiro/comercial)
    const isExplicitDepartmentChange =
      (classification.department === 'FINANCEIRO' && classification.confidence > 0.9) ||
      (classification.department === 'COMERCIAL' && classification.confidence > 0.9);

    if (diagState && diagState.step !== 'RESOLVED' && diagState.step !== 'ESCALATED' && !isExplicitDepartmentChange) {
      const diagRes = await supportService.processDiagnosticStep(currentClientId, userText);
      session.currentDepartment = 'SUPORTE';
      try { chatRepository.updateSession(session); } catch {}

      const isResolved = diagRes.step === 'RESOLVED';
      const isEscalated = diagRes.step === 'ESCALATED';

      const botMsg: ChatMessage = {
        id: generateMsgId('msg'),
        sender: 'BOT',
        text: diagRes.message,
        timestamp: new Date().toISOString(),
        department: 'SUPORTE',
        aiProvider: classification.aiProvider,
        aiModel: classification.aiModel,
        quickOptions: diagRes.options,
        cards: isResolved || isEscalated
          ? {
              type: 'CSAT',
              ticketProtocol: diagRes.protocolo,
              csat: {
                id: `csat-diag-${Date.now()}`,
                question: 'Como você avalia o diagnóstico de suporte técnico da DBS Telecom?',
                context: 'DIAGNOSTIC',
                targetProtocol: diagRes.protocolo,
              },
            }
          : diagRes.protocolo
          ? {
              type: 'TICKET',
              ticketProtocol: diagRes.protocolo,
            }
          : undefined,
      };

      this.pushHistory(session, botMsg);
      return botMsg;
    }

    // Se mudou de assunto, reseta qualquer diagnóstico pendente
    if (isExplicitDepartmentChange && diagState) {
      supportService.reset(currentClientId);
    }

    session.currentDepartment = classification.department;
    try { chatRepository.updateSession(session); } catch {}

    let botMessage: ChatMessage;

    // --- FLUXO FINANCEIRO ---
    if (classification.department === 'FINANCEIRO') {
      // 1. Caso especial: Desbloqueio em Confiança (Promessa de Pagamento)
      if (classification.intent === 'DESBLOQUEIO_CONFIANCA') {
        const unblockRes = await financialService.unblockPromise(currentClientId);
        botMessage = {
          id: generateMsgId('msg'),
          sender: 'BOT',
          text: `⚡ **Desbloqueio em Confiança Efetuado com Sucesso!**\n\n${unblockRes.message}\n\n📋 **Protocolo:** \`${unblockRes.protocolo}\`\n⏳ **Validade da Liberação:** ${unblockRes.unblockUntil}\n\nVocê já pode voltar a navegar normalmente enquanto o pagamento da fatura é compensado!`,
          timestamp: new Date().toISOString(),
          department: 'FINANCEIRO',
          aiProvider: classification.aiProvider,
          aiModel: classification.aiModel,
          guardrailApplied: classification.guardrailApplied,
          quickOptions: ['Ver faturas e PIX', 'Testar conexão', 'Voltar ao início'],
          cards: {
            type: 'TICKET',
            ticketProtocol: unblockRes.protocolo,
          },
        };
      } else {
        const invoices = await financialService.getInvoicesByClientId(currentClientId);

        if (invoices.length === 0) {
          botMessage = {
            id: generateMsgId('msg'),
            sender: 'BOT',
            text: classification.friendlyMessage || 'Consultei nosso sistema no IXC e você não possui faturas em aberto no momento! Sua conta está 100% em dia com a DBS Telecom. 🌟',
            timestamp: new Date().toISOString(),
            department: 'FINANCEIRO',
            aiProvider: classification.aiProvider,
            aiModel: classification.aiModel,
            guardrailApplied: classification.guardrailApplied,
            quickOptions: ['Ver outros assuntos', 'Planos disponíveis', 'Voltar ao início'],
          };
        } else {
          const openInvoice = invoices[0];
          const defaultText = `💳 **Central de Faturas DBS Telecom**\n\nLocalizei sua fatura em aberto no valor de **${openInvoice.valorFormatado}** com vencimento em **${openInvoice.dataVencimentoFormatada}**.\n\nVocê pode copiar a linha digitável, a chave PIX ou baixar o PDF do boleto bancário abaixo:`;

          botMessage = {
            id: generateMsgId('msg'),
            sender: 'BOT',
            text: classification.friendlyMessage || defaultText,
            timestamp: new Date().toISOString(),
            department: 'FINANCEIRO',
            aiProvider: classification.aiProvider,
            aiModel: classification.aiModel,
            guardrailApplied: classification.guardrailApplied,
            quickOptions: ['Copiar código de barras', 'Copiar PIX', 'Desbloquear em confiança', 'Falar com atendente'],
            cards: {
              type: 'INVOICE',
              invoices,
            },
          };
        }
      }
    }
    // --- FLUXO DE SUPORTE ---
    else if (classification.department === 'SUPORTE') {
      if (classification.intent === 'ACOMPANHAMENTO_CHAMADOS') {
        const tickets = await supportService.getClientTickets(currentClientId);
        if (tickets.length === 0) {
          botMessage = {
            id: generateMsgId('msg'),
            sender: 'BOT',
            text: `🛠️ **Acompanhamento de Ordens de Serviço (O.S.)**\n\nNão encontrei nenhuma Ordem de Serviço ou chamado técnico aberto para o seu contrato no momento. Sua conexão está operando normalmente!`,
            timestamp: new Date().toISOString(),
            department: 'SUPORTE',
            aiProvider: classification.aiProvider,
            aiModel: classification.aiModel,
            guardrailApplied: classification.guardrailApplied,
            quickOptions: ['Minha internet está lenta', 'Fazer teste de velocidade', 'Voltar ao início'],
          };
        } else {
          const latestTicket = tickets[0];
          botMessage = {
            id: generateMsgId('msg'),
            sender: 'BOT',
            text: `🛠️ **Central de Chamados Técnicos DBS Telecom**\n\nLocalizei sua Ordem de Serviço mais recente:\n\n📋 **Protocolo:** \`${latestTicket.protocolo || latestTicket.id}\`\n📌 **Assunto:** ${latestTicket.assunto}\n🚦 **Status Atual:** **${latestTicket.statusLabel || 'Em Andamento'}**\n👨‍🔧 **Responsável:** ${latestTicket.nome_tecnico || 'Equipe de Campo DBS'}\n📅 **Previsão:** ${latestTicket.previsao_visita || 'Em atendimento hoje'}`,
            timestamp: new Date().toISOString(),
            department: 'SUPORTE',
            aiProvider: classification.aiProvider,
            aiModel: classification.aiModel,
            guardrailApplied: classification.guardrailApplied,
            quickOptions: ['Falar com atendente', 'Testar conexão', 'Voltar ao início'],
            cards: {
              type: 'TICKET',
              ticketProtocol: latestTicket.protocolo || latestTicket.id,
            },
          };
        }
      } else {
        const diagInit = supportService.startDiagnostic(currentClientId);

        botMessage = {
          id: generateMsgId('msg'),
          sender: 'BOT',
          text: diagInit.message,
          timestamp: new Date().toISOString(),
          department: 'SUPORTE',
          aiProvider: classification.aiProvider,
          aiModel: classification.aiModel,
          guardrailApplied: classification.guardrailApplied,
          quickOptions: diagInit.options,
        };
      }
    }
    // --- FLUXO COMERCIAL & SCRIPT DE VENDAS ---
    else if (classification.department === 'COMERCIAL') {
      // 1. Confirmação final de contratação / pedido
      if (classification.intent === 'CONFIRMAR_CONTRATACAO') {
        const specificPlan = commercialService.findPlanByText(userText) || commercialService.getAllPlans()[1];
        const confirmation = commercialService.getContractingConfirmation(specificPlan, customerFirstName);
        botMessage = {
          id: generateMsgId('msg'),
          sender: 'BOT',
          text: confirmation.message,
          timestamp: new Date().toISOString(),
          department: 'COMERCIAL',
          aiProvider: classification.aiProvider,
          aiModel: classification.aiModel,
          guardrailApplied: classification.guardrailApplied,
          quickOptions: confirmation.options,
          cards: {
            type: 'CSAT',
            ticketProtocol: confirmation.protocolo,
            csat: {
              id: `csat-com-${Date.now()}`,
              question: 'Como você avalia a facilidade de contratação de planos na DBS Telecom?',
              context: 'HIRING',
              targetProtocol: confirmation.protocolo,
            },
          },
        };
      }
      // 2. Proposta de contratação de um plano específico selecionado
      else if (classification.intent === 'PROPOSTA_CONTRATACAO_PLANO' || commercialService.findPlanByText(userText)) {
        const specificPlan = commercialService.findPlanByText(userText) || commercialService.getAllPlans()[1];
        const proposal = commercialService.getContractingProposal(specificPlan, customerFirstName);
        botMessage = {
          id: generateMsgId('msg'),
          sender: 'BOT',
          text: proposal.message,
          timestamp: new Date().toISOString(),
          department: 'COMERCIAL',
          aiProvider: classification.aiProvider,
          aiModel: classification.aiModel,
          guardrailApplied: classification.guardrailApplied,
          quickOptions: proposal.options,
          cards: {
            type: 'PLANS',
            plans: [proposal.plan],
          },
        };
      }
      // 3. Quebra de objeção do script de vendas
      else if (classification.extractedData?.objectionType) {
        const objectionText = classification.friendlyMessage || commercialService.getObjectionHandling(classification.extractedData.objectionType);
        botMessage = {
          id: generateMsgId('msg'),
          sender: 'BOT',
          text: objectionText,
          timestamp: new Date().toISOString(),
          department: 'COMERCIAL',
          aiProvider: classification.aiProvider,
          aiModel: classification.aiModel,
          guardrailApplied: classification.guardrailApplied,
          quickOptions: ['Quero fechar agora!', 'Ver planos Wi-Fi 6', 'Falar com vendedor'],
        };
      }
      // 4. Recomendação com base no número de aparelhos ou catálogo geral
      else {
        const recommendation = commercialService.recommendPlan(
          classification.extractedData?.devicesCount ?? undefined,
          classification.extractedData?.wantsWifi6 ?? undefined
        );

        const defaultText = `🚀 **Planos DBS Telecom Fibra Ótica**\n\n💡 **Recomendação Especial:**\n${recommendation.reason}\n\nConfira abaixo nossas principais opções com instalação 100% gratuita na contratação com fidelidade de 12 meses:`;

        botMessage = {
          id: generateMsgId('msg'),
          sender: 'BOT',
          text: classification.friendlyMessage ? `${classification.friendlyMessage}\n\n💡 **Recomendação Especial:**\n${recommendation.reason}` : defaultText,
          timestamp: new Date().toISOString(),
          department: 'COMERCIAL',
          aiProvider: classification.aiProvider,
          aiModel: classification.aiModel,
          guardrailApplied: classification.guardrailApplied,
          quickOptions: ['Quero contratar o plano', 'Tirar dúvidas de Wi-Fi 6', 'Regras de fidelidade'],
          cards: {
            type: 'PLANS',
            plans: [recommendation.recommended, ...recommendation.alternatives],
          },
        };
      }
    }
    // --- FLUXO GERAL / GUARDRAILS / SAUDAÇÃO ---
    else {
      botMessage = {
        id: generateMsgId('msg'),
        sender: 'BOT',
        text: classification.friendlyMessage || 'Olá! Sou o assistente virtual da **DBS TELECOM**. Como posso te ajudar hoje? Escolha uma das opções abaixo ou digite sua solicitação:',
        timestamp: new Date().toISOString(),
        department: 'GERAL',
        aiProvider: classification.aiProvider,
        aiModel: classification.aiModel,
        guardrailApplied: classification.guardrailApplied,
        quickOptions: [
          'Preciso do meu boleto 💳',
          'Minha internet está lenta 🛠️',
          'Contratar plano de internet 🚀',
          'Planos Wi-Fi 6 📶',
          'Falar com atendente 👤',
        ],
      };
    }

    this.pushHistory(session, botMessage);
    return botMessage;
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
    const session = this.getOrCreateSession(sessionId, clientId);
    const currentClientId = clientId || session.clientId || '2270';

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
    const session = this.getOrCreateSession(sessionId, clientId);
    const currentClientId = clientId || session.clientId || '2270';

    let transcript = 'Mensagem de áudio recebida';

    // Tenta processamento com Google Gemini Multimodal
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
          transcript = geminiRes.transcript;
        }
      } catch (err) {
        console.warn('[ChatService] Falha na transcrição multimodal do Gemini:', err);
      }
    }

    // Se não tiver transcrição pelo Gemini, usa fallback baseado no tamanho/simulação
    if (transcript === 'Mensagem de áudio recebida') {
      transcript = 'Olá, gostaria de verificar a minha fatura e segunda via do boleto da DBS Telecom.';
    }

    // Registra a mensagem de áudio do usuário
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
    this.pushHistory(session, userVoiceMsg);

    // Processa a transcrição com todo o pipeline de IA, Guardrails e IXC
    const botResponse = await this.processMessage(sessionId, transcript, currentClientId);

    return {
      transcript,
      userMessage: userVoiceMsg,
      botMessage: botResponse,
    };
  }
}

export const chatService = new ChatService();
