export interface DBSPlan {
  id: string;
  name: string;
  speed: string;
  downloadMbps: number;
  uploadMbps: number;
  price: number;
  priceOnTime?: number; // Preço com desconto de pontualidade
  description: string;
  type: 'URBANO' | 'WIFI6' | 'RETENCAO';
  isPopular?: boolean;
  recommendedForDevices?: string;
  features: string[];
}

export const DBS_PLANS: DBSPlan[] = [
  {
    id: 'dbs-400',
    name: 'Seja DBS 400MB',
    speed: '400 Mega',
    downloadMbps: 400,
    uploadMbps: 200,
    price: 109.90,
    type: 'URBANO',
    description: 'Ideal para navegação diária, redes sociais e streaming em HD.',
    recommendedForDevices: 'Até 4 dispositivos',
    features: [
      'Download 400 Mbps / Upload 200 Mbps',
      'Instalação 100% gratuita no plano fidelidade',
      'Wi-Fi Dual Band incluso',
      'Valor fixo mensal',
    ],
  },
  {
    id: 'dbs-500',
    name: 'Ideal DBS 500MB',
    speed: '500 Mega',
    downloadMbps: 500,
    uploadMbps: 250,
    price: 139.90,
    priceOnTime: 119.90,
    type: 'URBANO',
    isPopular: true,
    description: 'Nosso plano mais vendido! Perfeito para famílias conectadas e home office.',
    recommendedForDevices: 'De 4 a 8 dispositivos',
    features: [
      'Download 500 Mbps / Upload 250 Mbps',
      'Super desconto até o vencimento: R$ 119,90',
      'Instalação gratuita com fidelidade 12 meses',
      'Roteador Dual Band alta performance',
    ],
  },
  {
    id: 'dbs-600',
    name: 'Essencial DBS 600MB',
    speed: '600 Mega',
    downloadMbps: 600,
    uploadMbps: 300,
    price: 149.90,
    priceOnTime: 139.90,
    type: 'URBANO',
    description: 'Alta velocidade para streaming em 4K e múltiplos acessos simultâneos.',
    recommendedForDevices: '6 a 10 dispositivos',
    features: [
      'Download 600 Mbps / Upload 300 Mbps',
      'Desconto de pontualidade: R$ 139,90',
      'Instalação gratuita com fidelidade',
      'Prioridade na fila de atendimento',
    ],
  },
  {
    id: 'dbs-800',
    name: 'Entretenimento DBS 800MB',
    speed: '800 Mega',
    downloadMbps: 800,
    uploadMbps: 400,
    price: 159.90,
    type: 'URBANO',
    description: 'Ultra velocidade para gamers, downloads pesados e casas inteligentes.',
    recommendedForDevices: '8 a 15 dispositivos',
    features: [
      'Download 800 Mbps / Upload 400 Mbps',
      'Valor fixo sem surpresas',
      'Baixíssima latência para jogos online',
      'Equipamento Gigabit incluso',
    ],
  },
  {
    id: 'dbs-1gb',
    name: 'Hard DBS 1GB',
    speed: '1 Giga (1000 Mega)',
    downloadMbps: 1000,
    uploadMbps: 500,
    price: 249.90,
    type: 'URBANO',
    description: 'A potência máxima da fibra ótica DBS Telecom.',
    recommendedForDevices: '15+ dispositivos',
    features: [
      'Download 1000 Mbps / Upload 500 Mbps',
      'Equipamento topo de linha Wi-Fi 6',
      'Suporte VIP prioritário',
      'Valor fixo mensal',
    ],
  },
  {
    id: 'dbs-retencao-300',
    name: 'Retenção DBS 300MB',
    speed: '300 Mega',
    downloadMbps: 300,
    uploadMbps: 150,
    price: 89.90,
    type: 'RETENCAO',
    description: 'Plano especial econômico para retenção e necessidades especiais.',
    recommendedForDevices: 'Até 3 dispositivos',
    features: [
      'Download 300 Mbps / Upload 150 Mbps',
      'Fibra ótica com estabilidade garantida',
      'Valor fixo mensal de R$ 89,90',
    ],
  },
  // Planos Wi-Fi 6
  {
    id: 'wifi6-500',
    name: 'DBS Wi-Fi 6 500MB',
    speed: '500 Mega Wi-Fi 6',
    downloadMbps: 500,
    uploadMbps: 250,
    price: 119.90,
    type: 'WIFI6',
    description: 'Tecnologia 802.11ax: mais estabilidade e alcance sem interferências.',
    recommendedForDevices: 'Muitos aparelhos conectados',
    features: [
      'Roteador Wi-Fi 6 de última geração (802.11ax)',
      'Menor congestionamento e mais alcance',
      'Ponto adicional por apenas +R$ 19,90/mês',
    ],
  },
  {
    id: 'wifi6-600',
    name: 'DBS Wi-Fi 6 600MB',
    speed: '600 Mega Wi-Fi 6',
    downloadMbps: 600,
    uploadMbps: 300,
    price: 129.90,
    type: 'WIFI6',
    description: 'Combinação imbatível de velocidade e estabilidade com Wi-Fi 6.',
    recommendedForDevices: 'Casas com múltiplos usuários e IoT',
    features: [
      'Roteador Wi-Fi 6 incluso',
      'Suporte a múltiplos streamings simultâneos',
      'Ponto adicional por apenas +R$ 19,90/mês',
    ],
  },
  {
    id: 'wifi6-800',
    name: 'DBS Wi-Fi 6 800MB',
    speed: '800 Mega Wi-Fi 6',
    downloadMbps: 800,
    uploadMbps: 400,
    price: 159.90,
    type: 'WIFI6',
    isPopular: true,
    description: 'Plano Premium recomendado no script oficial de vendas.',
    recommendedForDevices: '8+ aparelhos e gamers',
    features: [
      'Tecnologia Wi-Fi 6 avançada',
      'Ideal para muitas pessoas e aparelhos em casa',
      'Ponto adicional por apenas +R$ 19,90/mês',
    ],
  },
  {
    id: 'wifi6-1000',
    name: 'DBS Wi-Fi 6 1000MB',
    speed: '1000 Mega Wi-Fi 6',
    downloadMbps: 1000,
    uploadMbps: 500,
    price: 189.90,
    type: 'WIFI6',
    description: 'Velocidade extrema e cobertura Wi-Fi 6 para toda a casa.',
    recommendedForDevices: 'Famílias grandes, gamers e criadores de conteúdo',
    features: [
      'Roteador Wi-Fi 6 topo de linha',
      'Máxima capacidade de conexão simultânea',
      'Ponto adicional por apenas +R$ 19,90/mês',
    ],
  },
];

export class CommercialService {
  /**
   * Retorna catálogo completo de planos
   */
  getAllPlans(type?: 'URBANO' | 'WIFI6'): DBSPlan[] {
    if (type) {
      return DBS_PLANS.filter((p) => p.type === type);
    }
    return DBS_PLANS;
  }

  /**
   * Localiza um plano específico mencionado no texto do usuário
   */
  findPlanByText(text: string): DBSPlan | undefined {
    const lower = text.toLowerCase();

    // Wi-Fi 6 específicos
    if (lower.includes('wifi 6 800') || lower.includes('wifi6 800') || lower.includes('wi-fi 6 800')) {
      return DBS_PLANS.find((p) => p.id === 'wifi6-800');
    }
    if (lower.includes('wifi 6 1000') || lower.includes('wifi6 1000') || lower.includes('wi-fi 6 1000')) {
      return DBS_PLANS.find((p) => p.id === 'wifi6-1000');
    }
    if (lower.includes('wifi 6 600') || lower.includes('wifi6 600') || lower.includes('wi-fi 6 600')) {
      return DBS_PLANS.find((p) => p.id === 'wifi6-600');
    }
    if (lower.includes('wifi 6 500') || lower.includes('wifi6 500') || lower.includes('wi-fi 6 500')) {
      return DBS_PLANS.find((p) => p.id === 'wifi6-500');
    }

    // Planos por velocidade ou nome
    if (lower.includes('ideal') || lower.includes('500mb') || lower.includes('500 mega') || lower.includes('500m')) {
      return DBS_PLANS.find((p) => p.id === 'dbs-500');
    }
    if (lower.includes('seja') || lower.includes('400mb') || lower.includes('400 mega') || lower.includes('400m')) {
      return DBS_PLANS.find((p) => p.id === 'dbs-400');
    }
    if (lower.includes('essencial') || lower.includes('600mb') || lower.includes('600 mega') || lower.includes('600m')) {
      return DBS_PLANS.find((p) => p.id === 'dbs-600');
    }
    if (lower.includes('entretenimento') || lower.includes('800mb') || lower.includes('800 mega') || lower.includes('800m')) {
      return DBS_PLANS.find((p) => p.id === 'dbs-800') || DBS_PLANS.find((p) => p.id === 'wifi6-800');
    }
    if (lower.includes('hard') || lower.includes('1gb') || lower.includes('1000mb') || lower.includes('1 giga') || lower.includes('1000 mega')) {
      return DBS_PLANS.find((p) => p.id === 'dbs-1gb') || DBS_PLANS.find((p) => p.id === 'wifi6-1000');
    }

    return undefined;
  }

  /**
   * Gera a proposta comercial personalizada para contratação de um plano específico
   */
  getContractingProposal(plan: DBSPlan, customerName: string = 'Cliente'): {
    message: string;
    options: string[];
    plan: DBSPlan;
  } {
    const priceText = plan.priceOnTime
      ? `R$ ${plan.priceOnTime.toFixed(2).replace('.', ',')}/mês (com desconto de pontualidade até o vencimento)`
      : `R$ ${plan.price.toFixed(2).replace('.', ',')}/mês`;

    const message = `🎉 **Excelente escolha, ${customerName}!**\n\nO plano **${plan.name} (${plan.speed})** é perfeito para garantir alta velocidade e estabilidade!\n\n📋 **Condições Especiais da Sua Contratação:**\n• **Valor:** ${priceText}\n• **Instalação:** 100% GRATUITA com fidelidade de 12 meses (sem taxa de adesão)\n• **Equipamento:** Roteador Dual Band alta performance em comodato incluso\n• **Vencimento:** Melhor data à sua escolha (todo dia 10 com desconto)\n\nPodemos confirmar o seu pedido e solicitar o agendamento da visita de instalação?`;

    return {
      message,
      options: ['Confirmar contratação ✅', 'Ver regras de fidelidade 📄', 'Tirar outras dúvidas', 'Falar com atendente 👤'],
      plan,
    };
  }

  /**
   * Gera a mensagem de pedido confirmado e agendamento gerado
   */
  getContractingConfirmation(plan: DBSPlan, customerName: string = 'Cliente', protocol?: string): {
    message: string;
    protocolo: string;
    options: string[];
  } {
    const prot = protocol || `DBS-PED-${Math.floor(100000 + Math.random() * 900000)}`;
    const message = `🚀 **Pedido de Contratação Confirmado com Sucesso!**\n\nParabéns, ${customerName}! Registrei seu pedido para o plano **${plan.name}** no sistema da DBS Telecom.\n\n📋 **Protocolo Comercial:** \`${prot}\`\n\n📅 **Próximos Passos:**\n1. Nossa equipe entrará em contato via WhatsApp/Telefone nas próximas 2 horas para agendar o melhor dia e turno da visita (manhã ou tarde).\n2. A taxa de instalação é 100% gratuita no plano fidelidade, sem cobrança antecipada.\n\nSeja muito bem-vindo à ultravelocidade da DBS Telecom! ⭐`;

    return {
      message,
      protocolo: prot,
      options: ['Acompanhar pedido 📦', 'Voltar ao início 🏠', 'Falar com atendente 👤'],
    };
  }

  /**
   * Recomenda plano baseado no script oficial de vendas da DBS Telecom
   */
  recommendPlan(devicesCount?: number, wantsWifi6?: boolean): { recommended: DBSPlan; reason: string; alternatives: DBSPlan[] } {
    if (wantsWifi6 || (devicesCount && devicesCount > 8)) {
      const plan = DBS_PLANS.find((p) => p.id === 'wifi6-800')!;
      return {
        recommended: plan,
        reason: 'Para casas com mais de 8 aparelhos conectados, recomendamos a tecnologia Wi-Fi 6. Ela garante conexão mais rápida, estável e sem oscilações para múltiplos dispositivos.',
        alternatives: DBS_PLANS.filter((p) => p.type === 'WIFI6' && p.id !== 'wifi6-800'),
      };
    }

    if (devicesCount && devicesCount <= 4) {
      const plan = DBS_PLANS.find((p) => p.id === 'dbs-500')!;
      return {
        recommended: plan,
        reason: 'Para até 4 aparelhos, o plano Ideal DBS 500MB oferece excelente custo-benefício (R$ 119,90 com desconto de pontualidade).',
        alternatives: [DBS_PLANS.find((p) => p.id === 'dbs-400')!, DBS_PLANS.find((p) => p.id === 'dbs-600')!],
      };
    }

    // Default: Ideal DBS 500MB
    const defaultPlan = DBS_PLANS.find((p) => p.id === 'dbs-500')!;
    return {
      recommended: defaultPlan,
      reason: 'O plano Ideal DBS 500MB é a nossa opção mais popular, com ótima velocidade e desconto de pontualidade.',
      alternatives: DBS_PLANS.filter((p) => p.id !== 'dbs-500').slice(0, 3),
    };
  }

  /**
   * Fornece argumentos de quebra de objeção do script de vendas
   */
  getObjectionHandling(objectionType: 'pensar' | 'caro' | 'depois' | 'indicacao'): string {
    switch (objectionType) {
      case 'pensar':
        return 'Entendo perfeitamente! Só preciso lembrar que quanto antes você ativar, mais rápido estará aproveitando uma internet estável e com instalação 100% gratuita. Fechando agora, você garante a melhor agenda e a taxa promocional.';
      case 'caro':
        return 'Entendo a preocupação com o orçamento. Temos planos excelentes a partir de R$ 109,90 e descontos de pontualidade imperdíveis, com vencimento programado para o dia 10 para facilitar o seu planejamento financeiro!';
      case 'depois':
        return 'Perfeito! Vale destacar que a agenda de instalação e os descontos são limitados. Se confirmarmos agora, agendamos sua instalação para amanhã e você só começa a pagar no próximo mês, proporcional aos dias de uso.';
      case 'indicacao':
        return 'E tem mais uma vantagem exclusiva! Indicando um amigo ou vizinho que também feche com a DBS TELECOM, você ganha 50% de desconto na sua próxima mensalidade!';
    }
  }
}

export const commercialService = new CommercialService();
