import type { ChatMessage } from '../../types';
import { MOCK_INVOICES, MOCK_PLANS, MOCK_TICKETS } from './demoFixtures';
import { isDemoMode } from './demoState';
import { unavailableMessage } from './transport';

// Máquina de estados de diagnóstico local offline
interface LocalDiagState {
  step: 'STEP_1_DEVICES' | 'STEP_2_CABLES' | 'STEP_3_RESTART' | 'RESOLVED' | 'ESCALATED';
}
const localDiagStates: Map<string, LocalDiagState> = new Map();

/**
 * Legacy demo processor. Production and normal outage paths fail closed; this
 * is retained only behind an explicit development opt-in for the visual demo.
 */
export function processOfflineMessage(message: string, clientId?: string): ChatMessage {
  if (!isDemoMode()) {
    return unavailableMessage(
      'O atendimento está temporariamente indisponível. Nenhuma solicitação foi registrada.'
    );
  }

  const demoMessage = processOfflineMessageUnsafe(message, clientId);
  const demoCards = demoMessage.cards?.invoices
    ? {
        ...demoMessage.cards,
        invoices: demoMessage.cards.invoices.map((invoice) => ({
          ...invoice,
          id: `demo-${invoice.id}`,
          documento: `DEMO-${invoice.documento}`,
          linhaDigitavel: 'DEMO-LINHA-DIGITAVEL-NÃO-PAGAR',
          linhaDigitavelFormatada: 'DEMO • NÃO UTILIZAR',
          pixCopiaECola: 'DEMO-PIX-NÃO-PAGAR',
          obs: `[DEMO] ${invoice.obs || 'Fatura simulada'}`,
          simulated: true,
        })),
      }
    : demoMessage.cards;
  return {
    ...demoMessage,
    ...(demoCards ? { cards: demoCards } : {}),
    dataState: 'DEMO',
    text: `[DEMO] ${demoMessage.text}`,
  };
}

function processOfflineMessageUnsafe(message: string, clientId?: string): ChatMessage {
  const text = message.trim().toLowerCase();
  const cid = clientId || '2270';
  const diagState = localDiagStates.get(cid);

  // 0. Intenção: Transbordo / Fila Virtual
  if (text.includes('atendente') || text.includes('humano') || text.includes('pessoa')) {
    localDiagStates.delete(cid);
    return {
      id: `msg-${Date.now()}`,
      sender: 'BOT',
      text: '👤 **Fila Virtual de Atendimento Humano DBS Telecom**\n\nTransferi sua solicitação para a nossa equipe de especialistas. Você está na posição **2º lugar** com tempo estimado de espera de **~4 minutos**.\n\nEnquanto isso, você pode continuar tirando dúvidas com o assistente inteligente ou aguardar ser atendido:',
      timestamp: new Date().toISOString(),
      department: 'GERAL',
      aiModel: 'Offline Heuristic Engine',
      quickOptions: ['Cancelar espera ❌', 'Ver status da fila ⏱️', 'Minha internet está lenta 🛠️', 'Segunda via boleto 💳'],
      cards: {
        type: 'QUEUE',
        queue: {
          queueId: `QUEUE-${Date.now().toString().slice(-5)}`,
          position: 2,
          estimatedWaitMinutes: 4,
          department: 'GERAL',
          status: 'QUEUED',
        },
      },
    };
  }

  // 1. Continuação de diagnóstico de suporte em andamento
  if (diagState && diagState.step !== 'RESOLVED' && diagState.step !== 'ESCALATED') {
    if (diagState.step === 'STEP_1_DEVICES') {
      diagState.step = 'STEP_2_CABLES';
      localDiagStates.set(cid, diagState);
      return {
        id: `msg-${Date.now()}`,
        sender: 'BOT',
        text: '🔍 **Etapa 2 de 3: Verificação de Cabos e Sinal Ótico**\n\nVamos conferir os equipamentos instalados na sua casa:\n\n1. Olhe para as luzes (LEDs) do roteador/ONU: as luzes **PON/Internet** e **WLAN** estão acesas em **verde fixo**?\n2. O cabo de fibra ótica fino (amarelo ou azul) está bem conectado na parte traseira sem dobras?',
        timestamp: new Date().toISOString(),
        department: 'SUPORTE',
        aiModel: 'Offline Heuristic Engine',
        quickOptions: ['Sim, luzes verdes e cabos firmes', 'Tem luz vermelha/piscando ou cabo solto'],
      };
    }

    if (diagState.step === 'STEP_2_CABLES') {
      diagState.step = 'STEP_3_RESTART';
      localDiagStates.set(cid, diagState);
      return {
        id: `msg-${Date.now()}`,
        sender: 'BOT',
        text: '🔌 **Etapa 3 de 3: Reinicialização Assistida de Equipamentos**\n\nVamos realizar o procedimento padrão de limpeza de cache de conexão:\n\n1. **Desconecte a fonte do roteador/ONU da tomada** por **30 segundos**.\n2. Conecte novamente e aguarde cerca de **2 minutos** até todas as luzes estabilizarem.\n\nApós o procedimento, faça um teste de navegação. A conexão voltou a funcionar normalmente?',
        timestamp: new Date().toISOString(),
        department: 'SUPORTE',
        aiModel: 'Offline Heuristic Engine',
        quickOptions: ['Sim! Conexão normalizou ✅', 'Não, ainda continua com lentidão/sem internet ❌'],
      };
    }

    if (diagState.step === 'STEP_3_RESTART') {
      const isResolved = text.includes('sim') || text.includes('normalizou') || text.includes('voltou') || text.includes('✅');
      if (isResolved) {
        diagState.step = 'RESOLVED';
        localDiagStates.delete(cid);
        return {
          id: `msg-${Date.now()}`,
          sender: 'BOT',
          text: '🎉 **Conexão Restabelecida com Sucesso!**\n\nQue excelente notícia! Sua conexão foi restabelecida pelo pré-atendimento inteligente da DBS Telecom.\n\nPor gentileza, avalie como foi o seu atendimento abaixo:',
          timestamp: new Date().toISOString(),
          department: 'SUPORTE',
          aiModel: 'Offline Heuristic Engine',
          quickOptions: ['Voltar ao início', 'Ver faturas', 'Planos disponíveis'],
          cards: {
            type: 'CSAT',
            csat: {
              id: `csat-diag-${Date.now()}`,
              question: 'Como você avalia o diagnóstico inteligente de suporte da DBS Telecom?',
              context: 'DIAGNOSTIC',
            },
          },
        };
      } else {
        diagState.step = 'ESCALATED';
        const protocol = `OS-2026-${Math.floor(100000 + Math.random() * 900000)}`;
        localDiagStates.set(cid, diagState);
        return {
          id: `msg-${Date.now()}`,
          sender: 'BOT',
          text: `🎫 **Chamado Técnico Aberto com Sucesso!**\n\nComo o problema não foi solucionado pelos testes iniciais, registrei uma **Ordem de Serviço** prioritária no sistema IXC:\n\n📋 **Protocolo de Atendimento:** \`${protocol}\`\n\nEncaminhei seus dados com prioridade para a nossa **Equipe de Suporte Avançado Nível 2**. Por favor, avalie a experiência do atendimento guiado:`,
          timestamp: new Date().toISOString(),
          department: 'SUPORTE',
          aiModel: 'Offline Heuristic Engine',
          quickOptions: ['Acompanhar chamado', 'Falar com atendente', 'Voltar ao menu'],
          cards: {
            type: 'CSAT',
            ticketProtocol: protocol,
            csat: {
              id: `csat-esc-${Date.now()}`,
              question: 'Como você avalia o suporte técnico inicial da DBS Telecom?',
              context: 'DIAGNOSTIC',
              targetProtocol: protocol,
            },
          },
        };
      }
    }
  }

  // 2. Intenção: Desbloqueio em Confiança
  if (text.includes('desbloqueio') || text.includes('promessa de pagamento') || text.includes('desbloquear')) {
    localDiagStates.delete(cid);
    const expDate = new Date(Date.now() + 72 * 60 * 60 * 1000).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const protocol = `DBS-DESB-${Math.floor(100000 + Math.random() * 900000)}`;
    return {
      id: `msg-${Date.now()}`,
      sender: 'BOT',
      text: `⚡ **Desbloqueio em Confiança Efetuado com Sucesso!**\n\nSua conexão foi liberada temporariamente por 72 horas até **${expDate}**.\n\n📋 **Protocolo:** \`${protocol}\`\n\nVocê já pode voltar a navegar enquanto o pagamento do boleto é compensado!`,
      timestamp: new Date().toISOString(),
      department: 'FINANCEIRO',
      aiModel: 'Offline Heuristic Engine',
      quickOptions: ['Ver faturas e PIX', 'Testar conexão', 'Voltar ao início'],
      cards: {
        type: 'TICKET',
        ticketProtocol: protocol,
      },
    };
  }

  // 3. Intenção: Acompanhar Chamados / O.S.
  if (text.includes('acompanhar') || text.includes('meus chamados') || text.includes('ordem de servico') || text.includes('visita')) {
    localDiagStates.delete(cid);
    const ticket = MOCK_TICKETS[0];
    return {
      id: `msg-${Date.now()}`,
      sender: 'BOT',
      text: `🛠️ **Central de Chamados Técnicos DBS Telecom**\n\nLocalizei sua Ordem de Serviço mais recente:\n\n📋 **Protocolo:** \`${ticket.protocolo}\`\n📌 **Assunto:** ${ticket.assunto}\n🚦 **Status Atual:** **${ticket.statusLabel}**\n👨‍🔧 **Responsável:** ${ticket.nome_tecnico}\n📅 **Previsão:** ${ticket.previsao_visita}`,
      timestamp: new Date().toISOString(),
      department: 'SUPORTE',
      aiModel: 'Offline Heuristic Engine',
      quickOptions: ['Falar com atendente', 'Testar conexão', 'Voltar ao início'],
      cards: {
        type: 'TICKET',
        ticketProtocol: ticket.protocolo,
      },
    };
  }

  // 4. Intenção: Suporte / Lentidão / Queda
  const supportKeywords = [
    'lenta', 'lento', 'lentidão', 'lentidao', 'caiu', 'queda', 'sem internet',
    'não funciona', 'nao funciona', 'travando', 'sem sinal', 'luz vermelha',
    'roteador', 'reiniciar', 'suporte', 'visita', 'chamado', 'conexão ruim'
  ];
  if (supportKeywords.some((kw) => text.includes(kw))) {
    localDiagStates.set(cid, { step: 'STEP_1_DEVICES' });
    return {
      id: `msg-${Date.now()}`,
      sender: 'BOT',
      text: '🛠️ **Suporte Técnico Inteligente - DBS Telecom**\n\n📌 **Etapa 1 de 3: Identificação de Dispositivos**\nPara iniciarmos o teste de rede, me responda: a lentidão ou instabilidade está acontecendo em **todos os aparelhos** da sua residência (celulares, TVs, notebooks) ou apenas em um dispositivo específico?',
      timestamp: new Date().toISOString(),
      department: 'SUPORTE',
      aiModel: 'Offline Heuristic Engine',
      quickOptions: ['Acontece em todos os aparelhos', 'Apenas em um aparelho'],
    };
  }

  // 5. Intenção: Financeiro / Boleto / Fatura / 2ª via / PIX
  const financialKeywords = [
    'boleto', 'fatura', 'segunda via', '2 via', '2a via', 'segunda-via',
    'código de barras', 'codigo de barras', 'linha digitável', 'linha digitavel',
    'pix', 'pagar', 'pagamento', 'vencimento', 'venceu', 'débito', 'debito', 'conta', 'pdf'
  ];
  if (financialKeywords.some((kw) => text.includes(kw))) {
    localDiagStates.delete(cid);
    const invoice = MOCK_INVOICES[0];
    return {
      id: `msg-${Date.now()}`,
      sender: 'BOT',
      text: `💳 **Central de Faturas DBS Telecom**\n\nLocalizei sua fatura em aberto no valor de **${invoice.valorFormatado}** com vencimento em **${invoice.dataVencimentoFormatada}**.\n\nVocê pode copiar a linha digitável, a chave PIX ou baixar o PDF oficial do boleto abaixo:`,
      timestamp: new Date().toISOString(),
      department: 'FINANCEIRO',
      aiModel: 'Offline Heuristic Engine',
      quickOptions: ['Copiar código de barras', 'Copiar PIX', 'Desbloquear em confiança', 'Falar com atendente'],
      cards: {
        type: 'INVOICE',
        invoices: MOCK_INVOICES,
      },
    };
  }

  // 6. Intenção: Comercial - Confirmação de Contratação
  if (text.includes('confirmar contratacao') || text.includes('confirmar pedido') || text.includes('confirmar plano') || text.includes('fechar agora')) {
    localDiagStates.delete(cid);
    const protocol = `DBS-PED-${Math.floor(100000 + Math.random() * 900000)}`;
    return {
      id: `msg-${Date.now()}`,
      sender: 'BOT',
      text: `🚀 **Pedido de Contratação Confirmado com Sucesso!**\n\nParabéns, Emanuel! Registrei seu pedido de contratação no sistema da DBS Telecom.\n\n📋 **Protocolo Comercial:** \`${protocol}\`\n\n📅 **Próximos Passos:**\n1. Nossa equipe entrará em contato via WhatsApp/Telefone nas próximas 2 horas para agendar a visita de instalação 100% gratuita.\n\nPor favor, avalie a facilidade da sua contratação:`,
      timestamp: new Date().toISOString(),
      department: 'COMERCIAL',
      aiModel: 'Offline Heuristic Engine',
      quickOptions: ['Acompanhar pedido 📦', 'Voltar ao início 🏠', 'Falar com atendente 👤'],
      cards: {
        type: 'CSAT',
        ticketProtocol: protocol,
        csat: {
          id: `csat-com-${Date.now()}`,
          question: 'Como você avalia a facilidade de contratação de planos na DBS Telecom?',
          context: 'HIRING',
          targetProtocol: protocol,
        },
      },
    };
  }

  // 7. Intenção: Comercial - Escolha de Plano Específico (Checkout Proposal)
  const foundPlan = MOCK_PLANS.find(
    (p) =>
      text.includes(p.name.toLowerCase()) ||
      text.includes(p.speed.toLowerCase()) ||
      (text.includes('500') && p.id === 'dbs-500') ||
      (text.includes('400') && p.id === 'dbs-400') ||
      (text.includes('800') && p.id === 'wifi6-800')
  );
  const isHireIntent =
    text.includes('gostei') ||
    text.includes('contratar') ||
    text.includes('assinar') ||
    text.includes('como faco para contratar') ||
    text.includes('como faco para assinar') ||
    text.includes('quero');

  if (foundPlan && isHireIntent) {
    localDiagStates.delete(cid);
    const priceText = foundPlan.priceOnTime
      ? `R$ ${foundPlan.priceOnTime.toFixed(2).replace('.', ',')}/mês (com desconto de pontualidade)`
      : `R$ ${foundPlan.price.toFixed(2).replace('.', ',')}/mês`;

    return {
      id: `msg-${Date.now()}`,
      sender: 'BOT',
      text: `🎉 **Excelente escolha, Emanuel!**\n\nO plano **${foundPlan.name} (${foundPlan.speed})** é perfeito para garantir máxima velocidade e estabilidade!\n\n📋 **Condições Especiais da Sua Contratação:**\n• **Valor:** ${priceText}\n• **Instalação:** 100% GRATUITA com fidelidade de 12 meses (sem taxa de adesão)\n• **Equipamento:** Roteador Dual Band alta performance em comodato incluso\n• **Vencimento:** Melhor data à sua escolha (todo dia 10 com desconto)\n\nPodemos confirmar o seu pedido e solicitar o agendamento da visita de instalação?`,
      timestamp: new Date().toISOString(),
      department: 'COMERCIAL',
      aiModel: 'Offline Heuristic Engine',
      quickOptions: ['Confirmar contratação ✅', 'Ver regras de fidelidade 📄', 'Tirar outras dúvidas', 'Falar com atendente 👤'],
      cards: {
        type: 'PLANS',
        plans: [foundPlan],
      },
    };
  }

  // 8. Saudação Geral / Default
  return {
    id: `msg-${Date.now()}`,
    sender: 'BOT',
    text: 'Olá! 👋\n\nSou o **Davi**, seu assistente de atendimento da **DBS TELECOM**. Como posso te ajudar hoje? Escolha uma das opções rápidas abaixo ou digite sua solicitação:',
    timestamp: new Date().toISOString(),
    department: 'GERAL',
    aiModel: 'Offline Heuristic Engine',
    quickOptions: [
      'Preciso do meu boleto 💳',
      'Minha internet está lenta 🛠️',
      'Quero contratar ou mudar de plano 🚀',
      'Conhecer planos Wi-Fi 6 📶',
      'Falar com atendente 👤',
    ],
  };
}

