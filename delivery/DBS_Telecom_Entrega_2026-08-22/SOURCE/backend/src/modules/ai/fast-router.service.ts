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
      /\b(falar com atendente|quero falar com uma pessoa|atendente por favor|preciso de um atendente|chama um atendente|me passa para um humano)\b/,
    ];

    if (humanHandoffPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'GERAL',
        confidence: 1.0,
        intent: 'TRANSBORDO_HUMANO',
        friendlyMessage: `Com certeza, ${customerFirstName}! Estou te transferindo agora mesmo para a nossa **Fila Virtual de Atendimento Humano**. Um de nossos especialistas da DBS Telecom assumirá a conversa em instantes para te ajudar pessoalmente.`,
        suggestedAction: 'NONE',
      };
    }

    // 1. --- INTENÇÃO: FINANCEIRO - DESBLOQUEIO EM CONFIANÇA / PROMESSA DE PAGAMENTO ---
    const unblockPatterns = [
      /\b(desbloqueio em confianca|desbloqueio confianca|promessa de pagamento|liberar sinal|desbloquear sinal|desbloquear internet|liberar internet|sinal bloqueado|internet bloqueada|fatura atrasada desbloquear|auto desbloqueio|desbloqueio imediato)\b/,
    ];

    if (unblockPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'FINANCEIRO',
        confidence: 1.0,
        intent: 'DESBLOQUEIO_CONFIANCA',
        friendlyMessage: `Entendi perfeitamente, ${customerFirstName}. Processei o seu pedido de **Desbloqueio em Confiança (Promessa de Pagamento)** por 72 horas para que o seu sinal de internet seja liberado imediatamente enquanto o pagamento é compensado!`,
        suggestedAction: 'NONE',
      };
    }

    // 2. --- INTENÇÃO: FINANCEIRO / BOLETO / FATURA / PIX / 2ª VIA ---
    const financialPatterns = [
      /\b(boleto|boletos|meu boleto|preciso do boleto|preciso do meu boleto|quero meu boleto|baixar boleto|pdf do boleto)\b/,
      /\b(fatura|faturas|minha fatura|segunda via|2 via|2a via|segunda-via|2via|conta|minha conta)\b/,
      /\b(pix|chave pix|codigo de barras|linha digitavel|codigo barras|codigo pix|copia e cola|pix copia e cola)\b/,
      /\b(pagar|pagamento|pagar fatura|pagar boleto|vencimento|venceu|debito|fatura pendente|fatura aberta)\b/,
      /\b(extrato|comprovante|valor da fatura|conta em aberto|fatura atrasada|ja paguei|paguei agora)\b/,
    ];

    if (financialPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'FINANCEIRO',
        confidence: 1.0,
        intent: 'CONSULTA_FATURA_BOLETO',
        friendlyMessage: `Localizei as informações da sua conta na DBS Telecom, ${customerFirstName}. Aqui está a sua fatura em aberto com opção de cópia do PIX em 1 clique ou linha digitável:`,
        extractedData: {
          invoiceRequested: true,
        },
        suggestedAction: 'GET_INVOICE',
      };
    }

    // 3. --- INTENÇÃO: GESTÃO DE WI-FI / TROCA DE SENHA / REDE DE VISITAS ---
    const wifiManagementPatterns = [
      /\b(trocar\s+(a\s+)?senha|mudar\s+(a\s+)?senha|senha\s+do\s+wifi|senha\s+da\s+internet|mudar\s+nome\s+do\s+wifi|nome\s+da\s+rede|senha\s+do\s+roteador|rede\s+de\s+visitas|qr\s+code\s+wifi|gerenciar\s+wifi)\b/,
      /\b(trocar|mudar|alterar)\b.*\b(senha|wifi|wi-fi|rede|roteador)\b/,
    ];

    if (wifiManagementPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'SUPORTE',
        confidence: 0.99,
        intent: 'GESTAO_WIFI_SENHA',
        friendlyMessage: `Para alterar o nome (SSID) e a senha da sua rede Wi-Fi 2.4G ou 5G, você pode acessar a aba **Perfil** e clicar em **Gerenciador Wi-Fi**!\n\nLá você também consegue criar uma **Rede de Visitas** isolada e gerar um **QR Code** para seus convidados se conectarem sem precisar digitar senha.`,
        suggestedAction: 'NONE',
      };
    }

    // 4. --- INTENÇÃO: TESTE DE VELOCIDADE / SPEEDTEST ---
    const speedTestPatterns = [
      /\b(teste\s+(de\s+)?velocidade|speedtest|testar\s+velocidade|medir\s+velocidade|quantos\s+megas|velocimetro)\b/,
      /\b(fazer|realizar|executar)\b.*\b(teste\s+de\s+velocidade|speedtest|teste)\b/,
    ];

    if (speedTestPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'SUPORTE',
        confidence: 0.99,
        intent: 'TESTE_VELOCIDADE_SPEEDTEST',
        friendlyMessage: `Você pode realizar o teste de velocidade oficial da DBS Telecom diretamente pelo aplicativo!\n\n💡 **Dica de Especialista:** Para medir a velocidade real da sua fibra, recomendamos fazer o teste conectado na rede **Wi-Fi 5 GHz** ou via **Cabo de Rede** bem próximo ao roteador. Vá na aba **Perfil** e clique em **SpeedTest DBS**.`,
        suggestedAction: 'NONE',
      };
    }

    // 5. --- INTENÇÃO: MUDANÇA DE ENDEREÇO / TRANSFERÊNCIA ---
    const relocationPatterns = [
      /\b(mudar\s+de\s+endereco|vou\s+me\s+mudar|troca\s+de\s+endereco|transferir\s+instalacao|transferir\s+titularidade|mudanca\s+de\s+casa|mudanca\s+de\s+apartamento|mudar\s+meu\s+plano\s+de\s+lugar)\b/,
      /\b(mudar|mudanca|transferir)\b.*\b(endereco|casa|apartamento|residencia|cidade|bairro)\b/,
    ];

    if (relocationPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'COMERCIAL',
        confidence: 0.99,
        intent: 'MUDANCA_ENDERECO',
        friendlyMessage: `Que bacana, ${customerFirstName}! A DBS Telecom realiza a transferência da sua fibra ótica para o seu novo endereço com todo o cuidado.\n\nPara verificarmos a viabilidade técnica e agendarmos a instalação na sua nova residência, vou registrar sua solicitação para a nossa equipe comercial entrar em contato:`,
        suggestedAction: 'NONE',
      };
    }

    // 6. --- INTENÇÃO: CANCELAMENTO (ACOLHIMENTO & RETENÇÃO EMPÁTICA) ---
    const cancellationPatterns = [
      /\b(cancelar\s+plano|quero\s+cancelar|cancelar\s+internet|cancelar\s+minha\s+internet|cancelamento|desistir\s+do\s+plano|encerrar\s+contrato)\b/,
      /\b(cancelar|desistir|encerrar)\b.*\b(plano|contrato|internet|assinatura)\b/,
    ];

    if (cancellationPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'GERAL',
        confidence: 0.98,
        intent: 'ACOLHIMENTO_CANCELAMENTO',
        friendlyMessage: `Poxa, ${customerFirstName}, sinto muito em saber que você está pensando em cancelar! 😔\n\nSua satisfação é muito importante para nós. Aconteceu algum problema com a sua conexão, velocidade ou você está precisando de um plano que se ajuste melhor ao seu orçamento? Quero muito te ajudar a encontrar a melhor solução!`,
        suggestedAction: 'NONE',
      };
    }

    // 7. --- INTENÇÃO: SUPORTE - ACOMPANHAMENTO DE CHAMADOS / ORDEM DE SERVIÇO (O.S.) ---
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
        friendlyMessage: `Consultei o andamento das suas Ordens de Serviço (O.S.) no sistema IXC da DBS Telecom, ${customerFirstName}. Veja o status em tempo real:`,
        suggestedAction: 'NONE',
      };
    }

    // 8. --- INTENÇÃO: SUPORTE / LENTIDÃO / QUEDA / SEM INTERNET ---
    const supportPatterns = [
      /\b(lenta|lento|lentidao|muito lenta|internet lenta|minha internet esta lenta|conexao lenta|ta lenta|ta devagar)\b/,
      /\b(sem internet|caiu|caiu a internet|caiu a net|sem net|queda|nao funciona|parou de funcionar|travando|nao abre)\b/,
      /\b(luz vermelha|sem sinal|los|pon|luz los|sinal vermelho|los piscando|pon apagada)\b/,
      /\b(roteador travando|reiniciar roteador|reiniciei o roteador|modem|roteador apagado)\b/,
      /\b(problema na conexao|conexao ruim|suporte|assistencia tecnica|visita tecnica|abrir chamado|ping alto|lag)\b/,
    ];

    if (supportPatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'SUPORTE',
        confidence: 1.0,
        intent: 'PROBLEMA_CONEXAO_LENTIDAO',
        friendlyMessage: `Poxa, sinto muito por isso, ${customerFirstName}! Sei o quanto a internet é importante para o seu dia a dia. Vou te guiar agora em um diagnóstico rápido para verificarmos os equipamentos e restabelecer sua conexão com máxima prioridade.`,
        extractedData: {
          slownessReported: true,
        },
        suggestedAction: 'START_DIAGNOSTIC',
      };
    }

    // 9. --- INTENÇÃO: COMERCIAL - CONFIRMAÇÃO DE CONTRATAÇÃO / FECHAMENTO ---
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

    // 10. --- INTENÇÃO: COMERCIAL - ESCOLHA DE PLANO ESPECÍFICO (CHECKOUT PROPOSAL) ---
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

    // 11. --- INTENÇÃO: COMERCIAL - OBJEÇÕES DO SCRIPT DE VENDAS ---
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

    if (/\b(indicacao|indicar|indiquei|amigo|vizinho|desconto indicacao|indique e ganhe)\b/.test(text)) {
      return {
        isDeterministic: true,
        department: 'COMERCIAL',
        confidence: 0.98,
        intent: 'INCENTIVO_INDICACAO',
        friendlyMessage: `E tem uma super vantagem exclusiva: indicando um amigo ou vizinho que feche com a DBS TELECOM, você ganha 50% de desconto na sua próxima mensalidade! Você pode compartilhar seu link direto na aba **Perfil > Indique e Ganhe**.`,
        extractedData: { objectionType: 'indicacao' },
        suggestedAction: 'HANDLE_OBJECTION',
      };
    }

    // 12. --- INTENÇÃO: COMERCIAL / PLANOS GERAIS / WI-FI 6 ---
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
        friendlyMessage = `Para garantir a melhor experiência e estabilidade para múltiplos aparelhos simultâneos, recomendo fortemente os planos com **Wi-Fi 6 (802.11ax)** da DBS Telecom:`;
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

    // 13. --- INTENÇÃO: AGRADECIMENTO & ELOGIOS ---
    const gratitudePatterns = [
      /^(obrigado|obrigada|valeu|muito obrigado|muito obrigada|valeu davi|ajudou muito|show|top|perfeito|maravilha|obrigado davi)$/,
      /\b(muito obrigado davi|valeu davi|voce ajudou muito|agradeco|agradecido)\b/,
    ];

    if (gratitudePatterns.some((pattern) => pattern.test(text))) {
      return {
        isDeterministic: true,
        department: 'GERAL',
        confidence: 0.98,
        intent: 'AGRADECIMENTO_GERAL',
        friendlyMessage: `Imagina, ${customerFirstName}! Fico muito feliz em ter ajudado. Se precisar de mais alguma coisa para a sua conexão, pode me chamar a qualquer momento. Tenha um excelente dia com a DBS Telecom! 🚀🌟`,
        suggestedAction: 'NONE',
      };
    }

    // 14. --- INTENÇÃO: SAUDAÇÕES BÁSICAS / GERAL ---
    const greetingPatterns = [
      /^(oi|ola|ola dbs|ola emanuel|bom dia|boa tarde|boa noite|opa|e ai|hey|oi davi|ola davi|tudo bem|como vai)$/,
      /^(tchau|ate mais|ate logo|bom descanso|boa noite davi)$/,
    ];

    if (greetingPatterns.some((pattern) => pattern.test(text))) {
      const hour = new Date().getHours();
      const timeGreeting = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
      return {
        isDeterministic: true,
        department: 'GERAL',
        confidence: 0.95,
        intent: 'SAUDACAO_GERAL',
        friendlyMessage: `${timeGreeting}, ${customerFirstName}! Sou o **Davi**, especialista digital da **DBS TELECOM**. Como posso te ajudar hoje? Escolha uma das opções rápidas abaixo ou me diga o que você precisa:`,
        suggestedAction: 'NONE',
      };
    }

    // Se a mensagem for complexa, contextual ou não determinística, retorna null para acionar o LLM
    return null;
  }
}

export const fastRouterService = new FastRouterService();
