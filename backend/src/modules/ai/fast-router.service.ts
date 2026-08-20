import { DepartmentType } from './ai.service.js';
import { commercialService } from '../commercial/commercial.service.js';

export interface FastRouteMatch {
  isDeterministic: boolean;
  department: DepartmentType;
  confidence: number;
  intent: string;
  friendlyMessage?: string;
  extractedData?: {
    devicesCount?: number | null;
    wantsWifi6?: boolean | null;
    objectionType?: 'pensar' | 'caro' | 'depois' | 'indicacao' | null;
    invoiceRequested?: boolean | null;
    slownessReported?: boolean | null;
  } | null;
  suggestedAction?: 'START_DIAGNOSTIC' | 'GET_INVOICE' | 'SHOW_PLANS' | 'HANDLE_OBJECTION' | 'NONE';
}

export class FastRouterService {
  /**
   * Normaliza o texto removendo pontuação redundante, emojis e acentos para correspondência precisa
   */
  private normalize(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^\w\s]/gi, ' ') // substitui pontuação por espaço
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Analisa a mensagem do usuário de forma ultra rápida e determinística (Tier 0).
   * Retorna FastRouteMatch caso haja correspondência determinística clara.
   */
  matchFastIntent(rawText: string, customerFirstName: string = 'Cliente'): FastRouteMatch | null {
    const text = this.normalize(rawText);

    if (!text) {
      return null;
    }

    // 0. --- INTENÇÃO: TRANSBORDO / FILA DE ESPERA COM ATENDENTE HUMANO ---
    const humanHandoffPatterns = [
      /\b(falar com atendente|falar com humano|atendente humano|falar com pessoa|quero atendente|passar para atendente|transferir para atendente|transferir para humano|falar com suporte humano|falar com vendedor humano|atendente real|suporte humano|atendimento humano|pessoa real)\b/,
      /\b(falar com atendente|quero falar com uma pessoa|atendente por favor)\b/,
    ];

    if (humanHandoffPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'GERAL',
        confidence: 1.0,
        intent: 'TRANSBORDO_HUMANO',
        friendlyMessage: `Compreendo perfeitamente, ${customerFirstName}. Estou inserindo você na nossa **Fila Virtual de Atendimento Humano**. Um de nossos especialistas assumirá seu atendimento em instantes.`,
        suggestedAction: 'NONE',
      };
    }

    // 1. --- INTENÇÃO: FINANCEIRO - DESBLOQUEIO EM CONFIANÇA / PROMESSA DE PAGAMENTO ---
    const unblockPatterns = [
      /\b(desbloqueio em confianca|desbloqueio confianca|promessa de pagamento|liberar sinal|desbloquear sinal|desbloquear internet|liberar internet|sinal bloqueado|internet bloqueada|fatura atrasada desbloquear|auto desbloqueio)\b/,
    ];

    if (unblockPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'FINANCEIRO',
        confidence: 1.0,
        intent: 'DESBLOQUEIO_CONFIANCA',
        friendlyMessage: `Solicitei a rotina de auto-desbloqueio do sinal para a sua conexão, ${customerFirstName}.`,
        suggestedAction: 'NONE',
      };
    }

    // 2. --- INTENÇÃO: FINANCEIRO / BOLETO / FATURA / PIX / 2ª VIA ---
    const financialPatterns = [
      /\b(boleto|boletos|meu boleto|preciso do boleto|preciso do meu boleto|quero meu boleto|baixar boleto|pdf do boleto)\b/,
      /\b(fatura|faturas|minha fatura|segunda via|2 via|2a via|segunda-via|2via)\b/,
      /\b(pix|chave pix|codigo de barras|linha digitavel|codigo barras|codigo pix)\b/,
      /\b(pagar|pagamento|pagar fatura|pagar boleto|vencimento|venceu|debito)\b/,
      /\b(extrato|comprovante|valor da fatura|conta em aberto|fatura atrasada)\b/,
    ];

    if (financialPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'FINANCEIRO',
        confidence: 1.0,
        intent: 'CONSULTA_FATURA_BOLETO',
        friendlyMessage: `Localizei as informações da sua conta na DBS Telecom, ${customerFirstName}.`,
        extractedData: {
          invoiceRequested: true,
        },
        suggestedAction: 'GET_INVOICE',
      };
    }

    // 3. --- INTENÇÃO: SUPORTE - ACOMPANHAMENTO DE CHAMADOS / ORDEM DE SERVIÇO (O.S.) ---
    const ticketTrackingPatterns = [
      /\b(acompanhar|consultar|rastrear|historico)\b.*\b(chamado|chamados|ordem de servico|ordens de servico|visita|visita tecnica|tecnico)\b/,
      /\b(meus chamados|minhas os|minha os|meu chamado|meus pedidos de suporte|status da os|status do chamado|status da visita|acompanhar os|acompanhar chamado|acompanhar chamados|acompanhar ordem de servico|tecnico a caminho)\b/,
      /\b(ver|status)\b.*\b(chamado|chamados|ordem de servico|ordens de servico|visita tecnica|visita do tecnico)\b/,
    ];

    if (ticketTrackingPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'SUPORTE',
        confidence: 1.0,
        intent: 'ACOMPANHAMENTO_CHAMADOS',
        friendlyMessage: `Consultei o andamento das suas Ordens de Serviço (O.S.) no sistema IXC da DBS Telecom, ${customerFirstName}.`,
        suggestedAction: 'NONE',
      };
    }

    // 4. --- INTENÇÃO: SUPORTE / LENTIDÃO / QUEDA / SEM INTERNET ---
    const supportPatterns = [
      /\b(lenta|lento|lentidao|muito lenta|internet lenta|minha internet esta lenta|conexao lenta)\b/,
      /\b(sem internet|caiu|caiu a internet|queda|nao funciona|parou de funcionar|travando)\b/,
      /\b(luz vermelha|sem sinal|los|pon|luz los|sinal vermelho)\b/,
      /\b(roteador travando|reiniciar roteador|reiniciei o roteador|modem)\b/,
      /\b(problema na conexao|conexao ruim|suporte|assistencia tecnica|visita tecnica|abrir chamado)\b/,
    ];

    if (supportPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'SUPORTE',
        confidence: 1.0,
        intent: 'PROBLEMA_CONEXAO_LENTIDAO',
        friendlyMessage: `Entendi que você está enfrentando problemas com sua conexão, ${customerFirstName}. Vou te encaminhar para o nosso setor de **Suporte** e realizar um pré-atendimento rápido para resolver seu problema.`,
        extractedData: {
          slownessReported: true,
        },
        suggestedAction: 'START_DIAGNOSTIC',
      };
    }

    // 5. --- INTENÇÃO: COMERCIAL - CONFIRMAÇÃO DE CONTRATAÇÃO / FECHAMENTO ---
    if (/\b(confirmar contratacao|confirmar pedido|confirmar plano|quero agendar|fechar agora|pode agendar|agendar instalacao)\b/.test(text)) {
      const defaultPlan = commercialService.getAllPlans().find((p) => p.id === 'dbs-500')!;
      const confirmation = commercialService.getContractingConfirmation(defaultPlan, customerFirstName);
      return {
        isDeterministic: true,
        department: 'COMERCIAL',
        confidence: 1.0,
        intent: 'CONFIRMAR_CONTRATACAO',
        friendlyMessage: confirmation.message,
        suggestedAction: 'SHOW_PLANS',
      };
    }

    // 6. --- INTENÇÃO: COMERCIAL - ESCOLHA DE PLANO ESPECÍFICO (CHECKOUT PROPOSAL) ---
    const specificPlan = commercialService.findPlanByText(rawText);
    const isHireIntent = /\b(gostei|contratar|assinar|quero|fechar|adquirir|como faco para contratar|como faco para assinar|mudar para|escolhi)\b/.test(text);

    if (specificPlan && isHireIntent) {
      const proposal = commercialService.getContractingProposal(specificPlan, customerFirstName);
      return {
        isDeterministic: true,
        department: 'COMERCIAL',
        confidence: 1.0,
        intent: 'PROPOSTA_CONTRATACAO_PLANO',
        friendlyMessage: proposal.message,
        extractedData: {
          wantsWifi6: specificPlan.type === 'WIFI6',
        },
        suggestedAction: 'SHOW_PLANS',
      };
    }

    // 7. --- INTENÇÃO: COMERCIAL - OBJEÇÕES DO SCRIPT DE VENDAS ---
    if (/\b(vou pensar|vou ver|preciso pensar|pensar melhor)\b/.test(text)) {
      return {
        isDeterministic: true,
        department: 'COMERCIAL',
        confidence: 0.98,
        intent: 'OBJECAO_VOU_PENSAR',
        friendlyMessage: `Entendo perfeitamente, ${customerFirstName}! Só lembrando que fechando agora com a DBS TELECOM, sua instalação é 100% gratuita no plano fidelidade e já garantimos o valor promocional na agenda desta semana.`,
        extractedData: { objectionType: 'pensar' },
        suggestedAction: 'HANDLE_OBJECTION',
      };
    }

    if (/\b(caro|muito caro|ta caro|esta caro|desconto|abaixar o preco)\b/.test(text)) {
      return {
        isDeterministic: true,
        department: 'COMERCIAL',
        confidence: 0.98,
        intent: 'OBJECAO_ESTA_CARO',
        friendlyMessage: `Compreendo sua preocupação com o orçamento, ${customerFirstName}! Temos opções com ótimo custo-benefício como o plano Seja DBS 400MB por R$ 109,90 e descontos de pontualidade com vencimento todo dia 10!`,
        extractedData: { objectionType: 'caro' },
        suggestedAction: 'HANDLE_OBJECTION',
      };
    }

    if (/\b(depois|outro dia|mais tarde|fechar depois|ver depois)\b/.test(text)) {
      return {
        isDeterministic: true,
        department: 'COMERCIAL',
        confidence: 0.98,
        intent: 'OBJECAO_FECHAR_DEPOIS',
        friendlyMessage: `Perfeito, ${customerFirstName}! Vale ressaltar que a agenda de instalação com taxa zero é limitada. Confirmando agora, agendamos sua instalação para os próximos dias e você só começa a pagar no mês seguinte!`,
        extractedData: { objectionType: 'depois' },
        suggestedAction: 'HANDLE_OBJECTION',
      };
    }

    if (/\b(indicacao|indicar|indiquei|amigo|vizinho|desconto indicacao)\b/.test(text)) {
      return {
        isDeterministic: true,
        department: 'COMERCIAL',
        confidence: 0.98,
        intent: 'INCENTIVO_INDICACAO',
        friendlyMessage: `E tem uma vantagem exclusiva: indicando um amigo ou vizinho que feche com a DBS TELECOM, você ganha 50% de desconto na sua próxima mensalidade!`,
        extractedData: { objectionType: 'indicacao' },
        suggestedAction: 'HANDLE_OBJECTION',
      };
    }

    // 8. --- INTENÇÃO: COMERCIAL / PLANOS GERAIS / WI-FI 6 ---
    const wantsWifi6 = /\b(wifi 6|wifi6|wi fi 6|802 11ax)\b/.test(text);
    const deviceMatch = text.match(/(\d+)\s*(aparelhos|dispositivos|celulares|tvs|pessoas)/);
    const devicesCount = deviceMatch ? parseInt(deviceMatch[1], 10) : undefined;

    const commercialPatterns = [
      /\b(plano|planos|ver planos|conhecer planos|mudar plano|trocar plano|upgrade)\b/,
      /\b(contratar|assinar|contratacao|quero assinar|quero contratar|comprar)\b/,
      /\b(preco|quanto custa|valor do plano|mensalidade|velocidade|megas|gigas)\b/,
      /\b(wifi 6|wifi6|wi-fi 6|roteador wifi 6)\b/,
    ];

    if (commercialPatterns.some((pattern) => pattern.test(text)) || wantsWifi6 || devicesCount !== undefined) {
      let friendlyMessage = `Vou apresentar para você as nossas principais opções de ultravelocidade da **DBS Telecom** com instalação 100% gratuita na contratação com fidelidade:`;

      if (wantsWifi6 || (devicesCount && devicesCount > 8)) {
        friendlyMessage = `Para garantir a melhor experiência e estabilidade para múltiplos aparelhos, recomendo fortemente os planos com **Wi-Fi 6 (802.11ax)** da DBS Telecom:`;
      } else if (devicesCount && devicesCount <= 4) {
        friendlyMessage = `Para até ${devicesCount} aparelhos, o plano **Ideal DBS 500MB** (R$ 119,90 no vencimento) é o mais indicado e econômico:`;
      }

      return {
        isDeterministic: true,
        department: 'COMERCIAL',
        confidence: 0.99,
        intent: wantsWifi6 ? 'CONSULTA_PLANOS_WIFI6' : 'CONSULTA_CONTRATACAO_PLANOS',
        friendlyMessage,
        extractedData: {
          wantsWifi6,
          devicesCount,
        },
        suggestedAction: 'SHOW_PLANS',
      };
    }

    // 9. --- INTENÇÃO: SAUDAÇÕES BÁSICAS / GERAL ---
    const greetingPatterns = [
      /^(oi|ola|ola dbs|ola emanuel|bom dia|boa tarde|boa noite|opa|e ai|hey)$/,
      /^(obrigado|obrigada|valeu|muito obrigado|tchau|ate mais|ate logo)$/,
    ];

    if (greetingPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'GERAL',
        confidence: 0.95,
        intent: 'SAUDACAO_GERAL',
        friendlyMessage: `Olá, ${customerFirstName}! Sou o assistente virtual da **DBS TELECOM**. Como posso te ajudar hoje? Escolha uma das opções abaixo ou digite sua solicitação:`,
        suggestedAction: 'NONE',
      };
    }

    // Se a mensagem for complexa, contextual ou não determinística, retorna null para acionar o LLM
    return null;
  }
}

export const fastRouterService = new FastRouterService();
