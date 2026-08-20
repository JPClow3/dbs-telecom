import { ixcService } from '../ixc/ixc.service.js';
import { financialService } from '../financial/financial.service.js';
import { commercialService, DBS_PLANS } from '../commercial/commercial.service.js';
import { supportService } from '../support/support.service.js';

export interface IXCContextBundle {
  client?: {
    id: string;
    name: string;
    firstName: string;
    cpfCnpjMasked: string;
    address: string;
    city: string;
    neighborhood: string;
    phone: string;
    active: boolean;
  };
  contracts: Array<{
    id: string;
    status: string;
    planName?: string;
  }>;
  financial: {
    hasOpenInvoices: boolean;
    openInvoicesCount: number;
    nearestDueDate?: string;
    totalDueFormatted?: string;
    invoices: Array<{
      id: string;
      valor: string;
      vencimento: string;
      linhaDigitavel: string;
      documento: string;
      obs?: string;
    }>;
  };
  support: {
    inDiagnostic: boolean;
    step?: string;
    lastTicketProtocol?: string;
  };
  catalogSummary: {
    urbanPlans: string;
    wifi6Plans: string;
    referralProgram: string;
    loyaltyRule: string;
  };
}

export class IXCContextBuilder {
  /**
   * Constrói o contexto completo do cliente e da base IXC para ser injetado no modelo Gemini
   */
  async buildContext(clientId?: string): Promise<IXCContextBundle> {
    let clientData: IXCContextBundle['client'] = undefined;
    let contractsData: IXCContextBundle['contracts'] = [];
    let financialData: IXCContextBundle['financial'] = {
      hasOpenInvoices: false,
      openInvoicesCount: 0,
      invoices: [],
    };
    let supportData: IXCContextBundle['support'] = {
      inDiagnostic: false,
    };

    if (clientId) {
      try {
        // 1. Busca dados cadastrais no IXC
        const client = await ixcService.findClientById(clientId);
        if (client) {
          const rawCpf = client.cnpj_cpf || '';
          const maskedCpf = rawCpf.length === 11
            ? rawCpf.replace(/(\d{3})\d{3}\d{3}(\d{2})/, '$1.***.***-$2')
            : rawCpf.slice(0, 4) + '****' + rawCpf.slice(-2);

          clientData = {
            id: client.id,
            name: client.razao,
            firstName: client.razao ? client.razao.split(' ')[0] : 'Cliente',
            cpfCnpjMasked: maskedCpf,
            address: `${client.endereco || ''}, ${client.numero || ''}`.trim(),
            city: client.cidade || 'Chapecó',
            neighborhood: client.bairro || 'Centro',
            phone: client.fone || '',
            active: client.ativo === 'S',
          };
        }

        // 2. Busca contratos no IXC
        const contracts = await ixcService.getClientContracts(clientId);
        contractsData = contracts.map((c) => ({
          id: c.id,
          status: c.status === 'A' ? 'Ativo' : 'Inativo',
          planName: c.id_vd_plano ? `Plano DBS (ID ${c.id_vd_plano})` : 'Plano Fibra Ótica DBS',
        }));

        // 3. Busca faturas no IXC
        const invoices = await financialService.getInvoicesByClientId(clientId);
        if (invoices.length > 0) {
          const totalVal = invoices.reduce((acc, inv) => acc + inv.valor, 0);
          financialData = {
            hasOpenInvoices: true,
            openInvoicesCount: invoices.length,
            nearestDueDate: invoices[0].dataVencimentoFormatada,
            totalDueFormatted: `R$ ${totalVal.toFixed(2).replace('.', ',')}`,
            invoices: invoices.map((inv) => ({
              id: inv.id,
              valor: inv.valorFormatado,
              vencimento: inv.dataVencimentoFormatada,
              linhaDigitavel: inv.linhaDigitavel,
              documento: inv.documento,
              obs: inv.obs,
            })),
          };
        }

        // 4. Estado de suporte ativo
        const diagState = supportService.getState(clientId);
        if (diagState && diagState.step !== 'RESOLVED') {
          supportData = {
            inDiagnostic: true,
            step: diagState.step,
            lastTicketProtocol: diagState.protocolo,
          };
        }
      } catch (err) {
        console.warn('[IXCContextBuilder] Erro ao obter dados do IXC para contexto:', err);
      }
    }

    // 5. Resumo do catálogo comercial oficial DBS Telecom
    const urbanPlans = DBS_PLANS.filter((p) => p.type === 'URBANO')
      .map((p) => `- ${p.name}: ${p.speed} por R$ ${p.price.toFixed(2).replace('.', ',')}${p.priceOnTime ? ` (ou R$ ${p.priceOnTime.toFixed(2).replace('.', ',')} até o vencimento)` : ''}`)
      .join('\n');

    const wifi6Plans = DBS_PLANS.filter((p) => p.type === 'WIFI6')
      .map((p) => `- ${p.name}: ${p.speed} por R$ ${p.price.toFixed(2).replace('.', ',')} (+ ponto adicional R$ 19,90)`)
      .join('\n');

    return {
      client: clientData,
      contracts: contractsData,
      financial: financialData,
      support: supportData,
      catalogSummary: {
        urbanPlans,
        wifi6Plans,
        referralProgram: 'Indicando um amigo ou vizinho que feche com a DBS TELECOM, o cliente ganha 50% de desconto na próxima mensalidade.',
        loyaltyRule: 'Instalação 100% gratuita no plano com fidelidade de 12 meses. Sem fidelidade, taxa de ativação de R$ 600.',
      },
    };
  }

  /**
   * Serializa o bundle em uma representação textual clara e concisa para o System Prompt
   */
  formatContextForPrompt(bundle: IXCContextBundle): string {
    const sections: string[] = [];

    if (bundle.client) {
      sections.push(`[DADOS DO CLIENTE NA BASE IXC]:
- Nome: ${bundle.client.name} (Primeiro nome: ${bundle.client.firstName})
- ID no IXC: ${bundle.client.id}
- CPF Mascarado: ${bundle.client.cpfCnpjMasked}
- Endereço Cadastrado: ${bundle.client.address}, ${bundle.client.neighborhood}, ${bundle.client.city}
- Status do Cadastro: ${bundle.client.active ? 'Ativo e Regular' : 'Inativo'}`);
    } else {
      sections.push(`[DADOS DO CLIENTE]: Cliente não autenticado ou visitante.`);
    }

    if (bundle.contracts.length > 0) {
      const contractsStr = bundle.contracts.map((c) => `Contrato #${c.id} (${c.status})`).join(', ');
      sections.push(`[CONTRATOS ATIVOS IXC]: ${contractsStr}`);
    }

    if (bundle.financial.hasOpenInvoices) {
      const invDetails = bundle.financial.invoices
        .map((inv) => `  * Fatura #${inv.id}: Valor ${inv.valor} com vencimento em ${inv.vencimento}. Linha Digitável: ${inv.linhaDigitavel}`)
        .join('\n');
      sections.push(`[SITUAÇÃO FINANCEIRA IXC - FATURAS EM ABERTO]:
- Quantidade: ${bundle.financial.openInvoicesCount} fatura(s) pendente(s)
- Próximo Vencimento: ${bundle.financial.nearestDueDate}
- Valor Total: ${bundle.financial.totalDueFormatted}
- Faturas:
${invDetails}`);
    } else {
      sections.push(`[SITUAÇÃO FINANCEIRA IXC]: Nenhuma fatura em aberto. O cliente está 100% em dia com a DBS Telecom.`);
    }

    if (bundle.support.inDiagnostic) {
      sections.push(`[SUPORTE TÉCNICO ATIVO]: Cliente está na etapa de diagnóstico "${bundle.support.step}".${bundle.support.lastTicketProtocol ? ` Protocolo gerado: ${bundle.support.lastTicketProtocol}` : ''}`);
    }

    sections.push(`[CATÁLOGO OFICIAL DBS TELECOM]:
Planos Fibra Ótica Urbanos:
${bundle.catalogSummary.urbanPlans}

Planos Tecnologia Wi-Fi 6 (802.11ax):
${bundle.catalogSummary.wifi6Plans}

Regras Comerciais e Vendas:
- Fidelidade: ${bundle.catalogSummary.loyaltyRule}
- Campanha de Indicação: ${bundle.catalogSummary.referralProgram}
- Regra de Recomendação: Mais de 8 aparelhos -> Recomendar Wi-Fi 6 800MB (R$ 159,90). Até 4 aparelhos -> Recomendar Ideal 500MB (R$ 119,90 em dia).`);

    return sections.join('\n\n');
  }
}

export const ixcContextBuilder = new IXCContextBuilder();
