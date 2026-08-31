import { aiService, type AIClassificationResult } from '../ai/ai.service.js';
import { commercialService } from '../commercial/commercial.service.js';
import { financialService } from '../financial/financial.service.js';
import { supportService } from '../support/support.service.js';
import { queueService } from '../queue/queue.service.js';
import { chatRepository } from './chat.repository.js';
import { generateMsgId, type ChatMessage, type ChatSession } from './chat.types.js';

/**
 * Narrow seam used by the conversation state machine. Keeping session access
 * behind this interface lets ChatService own lifecycle/cache concerns while
 * this module owns classification and department-specific transitions.
 */
export interface ChatConversationContext {
  getOrCreateSession(sessionId: string, clientId?: string, clientName?: string): Promise<ChatSession>;
  pushHistory(session: ChatSession, message: ChatMessage): Promise<void>;
}

export interface ChatConversationOptions {
  /** When true the caller already recorded the user turn (e.g. audio path). */
  skipUserTurn?: boolean;
  /**
   * Identificador estável do turno do usuário (messageId do cliente). Usado
   * como id persistido para que retries do cliente converjam (upsert por id)
   * em vez de duplicarem a mensagem no histórico.
   */
  clientMessageId?: string;
}

/**
 * Processes one user message through classification, guardrails, queue,
 * support, financial, and commercial workflows.
 *
 * The response construction intentionally remains contract-compatible with
 * the original ChatService implementation. This extraction is orchestration
 * only: route handlers and the public ChatService signature are unchanged.
 */
export async function processChatMessage(
  context: ChatConversationContext,
  sessionId: string,
  userText: string,
  clientId?: string,
  options: ChatConversationOptions = {},
): Promise<ChatMessage> {
  const session = await context.getOrCreateSession(sessionId, clientId);
  const currentClientId = clientId || session.clientId || '';
  const customerFirstName = session.clientName ? session.clientName.split(' ')[0] : 'Cliente';

  // Registra a mensagem do usuário no histórico da sessão (exceto quando o
  // chamador já a registrou, como no fluxo de áudio, evitando duplicação).
  if (!options.skipUserTurn) {
    const userMsg: ChatMessage = {
      id: options.clientMessageId || generateMsgId('usr'),
      sender: 'USER',
      text: userText,
      timestamp: new Date().toISOString(),
    };
    await context.pushHistory(session, userMsg);
  }

  // 1. Invoca motor de classificação com Fast Router, Guardrails e Injeção de Contexto do IXC
  const classification: AIClassificationResult = await aiService.classifyMessage(userText, {
    clientId: currentClientId,
    customerName: session.clientName,
    previousDepartment: session.currentDepartment,
    history: session.history.map((m) => ({ sender: m.sender, text: m.text })),
  });

  // Se a intenção for TRANSBORDO HUMANO / FALAR COM ATENDENTE
  if (classification.intent === 'TRANSBORDO_HUMANO') {
    const queueEntry = await queueService.joinQueue({
      sessionId,
      clientId: currentClientId,
      clientName: session.clientName || 'Cliente',
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

    await context.pushHistory(session, botMsg);
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
    await context.pushHistory(session, botMsg);
    return botMsg;
  }

  const diagState = await supportService.getState(currentClientId);

  // Se estiver em suporte ativo e o usuário estiver respondendo ao teste (sem mudança brusca para financeiro/comercial)
  const isExplicitDepartmentChange =
    (classification.department === 'FINANCEIRO' && classification.confidence > 0.9) ||
    (classification.department === 'COMERCIAL' && classification.confidence > 0.9);

  if (diagState && diagState.step !== 'RESOLVED' && diagState.step !== 'ESCALATED' && !isExplicitDepartmentChange) {
    const diagRes = await supportService.processDiagnosticStep(currentClientId, userText);
    session.currentDepartment = 'SUPORTE';
    try { await chatRepository.updateSession(session); } catch {}

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

    await context.pushHistory(session, botMsg);
    return botMsg;
  }

  // Se mudou de assunto, reseta qualquer diagnóstico pendente
  if (isExplicitDepartmentChange && diagState) {
    await supportService.reset(currentClientId);
  }

  session.currentDepartment = classification.department;
  try { await chatRepository.updateSession(session); } catch {}

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
    } else if (classification.intent === 'GESTAO_WIFI_SENHA' || classification.intent === 'TESTE_VELOCIDADE_SPEEDTEST') {
      botMessage = {
        id: generateMsgId('msg'),
        sender: 'BOT',
        text: classification.friendlyMessage || 'Você pode gerenciar seu Wi-Fi e realizar testes de velocidade diretamente na aba Perfil do aplicativo.',
        timestamp: new Date().toISOString(),
        department: 'SUPORTE',
        aiProvider: classification.aiProvider,
        aiModel: classification.aiModel,
        guardrailApplied: classification.guardrailApplied,
        quickOptions: classification.intent === 'GESTAO_WIFI_SENHA'
          ? ['Dicas de Wi-Fi 📶', 'Fazer teste de velocidade 🚀', 'Voltar ao início 🏠']
          : ['Dicas para melhorar o sinal 📶', 'Minha internet está lenta 🛠️', 'Conhecer Wi-Fi 6 🚀'],
      };
    } else {
      const diagInit = await supportService.startDiagnostic(currentClientId);

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
    // 1. Mudança de Endereço / Transferência
    if (classification.intent === 'MUDANCA_ENDERECO') {
      botMessage = {
        id: generateMsgId('msg'),
        sender: 'BOT',
        text: classification.friendlyMessage || `A DBS Telecom realiza a transferência da sua fibra ótica para o seu novo endereço com todo o cuidado, ${customerFirstName}.`,
        timestamp: new Date().toISOString(),
        department: 'COMERCIAL',
        aiProvider: classification.aiProvider,
        aiModel: classification.aiModel,
        guardrailApplied: classification.guardrailApplied,
        quickOptions: ['Consultar viabilidade 📍', 'Falar com comercial 👤', 'Voltar ao início 🏠'],
      };
    }
    // 2. Confirmação final de contratação / pedido
    else if (classification.intent === 'CONFIRMAR_CONTRATACAO') {
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
  // --- FLUXO GERAL / GUARDRAILS / SAUDAÇÃO / CASOS ESPECÍFICOS ---
  else {
    let dynamicQuickOptions = [
      'Preciso do meu boleto 💳',
      'Minha internet está lenta 🛠️',
      'Contratar plano de internet 🚀',
      'Planos Wi-Fi 6 📶',
      'Falar com atendente 👤',
    ];

    if (classification.intent === 'ACOLHIMENTO_CANCELAMENTO') {
      dynamicQuickOptions = [
        'Quero negociar meu plano 💰',
        'Minha internet está lenta 🛠️',
        'Falar com especialista 👤',
        'Voltar ao início 🏠',
      ];
    } else if (classification.intent === 'MUDANCA_ENDERECO') {
      dynamicQuickOptions = [
        'Consultar viabilidade 📍',
        'Falar com comercial 👤',
        'Voltar ao início 🏠',
      ];
    } else if (classification.intent === 'GESTAO_WIFI_SENHA') {
      dynamicQuickOptions = [
        'Dicas de Wi-Fi 📶',
        'Fazer teste de velocidade 🚀',
        'Voltar ao início 🏠',
      ];
    } else if (classification.intent === 'TESTE_VELOCIDADE_SPEEDTEST') {
      dynamicQuickOptions = [
        'Dicas para melhorar o sinal 📶',
        'Minha internet está lenta 🛠️',
        'Conhecer Wi-Fi 6 🚀',
      ];
    } else if (classification.intent === 'AGRADECIMENTO_GERAL') {
      dynamicQuickOptions = [
        'Ver faturas 💳',
        'Planos de internet 🚀',
        'Indique e Ganhe 50% 🎁',
      ];
    }

    botMessage = {
      id: generateMsgId('msg'),
      sender: 'BOT',
      text: classification.friendlyMessage || `Olá, ${customerFirstName}! Sou o **Davi**, seu especialista de atendimento da **DBS TELECOM**. Como posso te ajudar hoje? Escolha uma das opções rápidas abaixo ou me diga o que você precisa:`,
      timestamp: new Date().toISOString(),
      department: 'GERAL',
      aiProvider: classification.aiProvider,
      aiModel: classification.aiModel,
      guardrailApplied: classification.guardrailApplied,
      quickOptions: dynamicQuickOptions,
    };
  }

  await context.pushHistory(session, botMessage);
  return botMessage;
}
