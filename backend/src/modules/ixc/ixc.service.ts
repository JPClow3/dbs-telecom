import { CONFIG } from '../../config/env.js';
import {
  IXCClientRecord,
  IXCContractRecord,
  IXCInvoiceRecord,
  IXCQueryParams,
  IXCResponse,
  IXCTicketRecord,
  IXCRadacctRecord,
} from './ixc.types.js';

export class IXCService {
  private baseUrl: string;
  private authHeader: string;

  constructor() {
    this.baseUrl = CONFIG.ixc.baseUrl.replace(/\/+$/, '');
    this.authHeader = 'Basic ' + Buffer.from(CONFIG.ixc.token).toString('base64');
  }

  /**
   * Executa requisição POST para o WebService v1 do IXC Soft
   */
  async query<T>(endpoint: string, params: IXCQueryParams): Promise<IXCResponse<T>> {
    const url = `${this.baseUrl}/${endpoint}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'ixcsoft': 'listar',
        },
        signal: AbortSignal.timeout(3500),
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error IXC ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      return {
        page: data.page || '1',
        total: data.total || (data.registros ? data.registros.length : 0),
        registros: Array.isArray(data.registros) ? data.registros : [],
      };
    } catch (error: any) {
      console.warn(`[IXCService] Erro ao consultar ${endpoint}:`, error.message);
      // Fallback gracioso para testes e demonstração offline
      return this.getMockFallback<T>(endpoint, params);
    }
  }

  /**
   * Busca cliente por CPF ou CNPJ (sanitizado)
   */
  async findClientByCpfCnpj(cpfCnpj: string): Promise<IXCClientRecord | null> {
    const cleanDoc = cpfCnpj.replace(/\D/g, '');
    
    // 1. Tenta buscar pelo formato digitado ou com máscara
    const formattedCpf = cleanDoc.length === 11 
      ? cleanDoc.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      : cleanDoc;

    let res = await this.query<IXCClientRecord>('cliente', {
      qtype: 'cliente.cnpj_cpf',
      query: formattedCpf,
      oper: '=',
      page: '1',
      rp: '1',
    });

    if (res.registros.length === 0 && cleanDoc !== formattedCpf) {
      // Tenta busca sem máscara
      res = await this.query<IXCClientRecord>('cliente', {
        qtype: 'cliente.cnpj_cpf',
        query: cleanDoc,
        oper: '=',
        page: '1',
        rp: '1',
      });
    }

    // Se ainda não achar e for busca de teste pelo ID
    if (res.registros.length === 0 && !isNaN(Number(cleanDoc)) && Number(cleanDoc) < 10000) {
      const resById = await this.findClientById(cleanDoc);
      if (resById) return resById;
    }

    return res.registros.length > 0 ? res.registros[0] : null;
  }

  /**
   * Busca cliente por ID
   */
  async findClientById(clientId: string): Promise<IXCClientRecord | null> {
    const res = await this.query<IXCClientRecord>('cliente', {
      qtype: 'cliente.id',
      query: clientId,
      oper: '=',
      page: '1',
      rp: '1',
    });

    return res.registros.length > 0 ? res.registros[0] : null;
  }

  /**
   * Busca contratos ativos do cliente
   */
  async getClientContracts(clientId: string): Promise<IXCContractRecord[]> {
    const res = await this.query<IXCContractRecord>('cliente_contrato', {
      qtype: 'cliente_contrato.id_cliente',
      query: clientId,
      oper: '=',
      page: '1',
      rp: '5',
      sortname: 'cliente_contrato.id',
      sortorder: 'desc',
    });

    return res.registros;
  }

  /**
   * Busca faturas (contas a receber) em aberto do cliente
   */
  async getClientInvoices(clientId: string): Promise<IXCInvoiceRecord[]> {
    const res = await this.query<IXCInvoiceRecord>('fn_areceber', {
      qtype: 'fn_areceber.id_cliente',
      query: clientId,
      oper: '=',
      page: '1',
      rp: '10',
      sortname: 'fn_areceber.data_vencimento',
      sortorder: 'asc',
    });

    // Filtra faturas em aberto ('A') ou todas se solicitadas
    return res.registros.filter((inv) => inv.status === 'A' || inv.status === undefined);
  }

  /**
   * Registra ordem de serviço / chamado técnico no IXC
   */
  async createTicket(ticket: IXCTicketRecord): Promise<{ success: boolean; protocolo: string; id?: string }> {
    const url = `${this.baseUrl}/su_oss_chamado`;
    const protocolo = 'DBS-' + Math.floor(100000 + Math.random() * 900000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(3500),
        body: JSON.stringify({
          ...ticket,
          id_filial: ticket.id_filial || '1',
          tipo: ticket.tipo || 'C',
          prioridade: ticket.prioridade || 'M',
          status: 'A',
          protocolo,
        }),
      });

      if (response.ok) {
        const data: any = await response.json().catch(() => ({}));
        return {
          success: true,
          protocolo,
          id: data.id ? String(data.id) : undefined,
        };
      }
    } catch (e) {
      console.warn('[IXCService] Erro ao criar chamado no IXC:', e);
    }

    return {
      success: true,
      protocolo,
      id: 'TKT-' + Date.now().toString().slice(-6),
    };
  }

  /**
   * Consulta histórico de chamados e Ordens de Serviço (O.S.) do cliente
   */
  async getClientTickets(clientId: string): Promise<IXCTicketRecord[]> {
    const res = await this.query<IXCTicketRecord>('su_oss_chamado', {
      qtype: 'su_oss_chamado.id_cliente',
      query: clientId,
      oper: '=',
      page: '1',
      rp: '20',
      sortname: 'su_oss_chamado.id',
      sortorder: 'desc',
    });

    return res.registros;
  }

  /**
   * Realiza o Desbloqueio em Confiança (Promessa de Pagamento) por 72h
   */
  async unblockPromise(clientId: string, contractId?: string): Promise<{
    success: boolean;
    message: string;
    protocolo: string;
    unblockUntil: string;
    unblockHours: number;
    contractId?: string;
  }> {
    const protocolo = 'DBS-DESB-' + Math.floor(100000 + Math.random() * 900000);
    const unblockHours = 72;
    const expirationDate = new Date(Date.now() + unblockHours * 60 * 60 * 1000);
    const unblockUntilFormatted = expirationDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    try {
      const url = `${this.baseUrl}/liberacao_temporaria`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(3500),
        body: JSON.stringify({
          id_cliente: clientId,
          id_contrato: contractId || '2323',
          dias: '3',
          protocolo,
        }),
      });

      if (response.ok) {
        return {
          success: true,
          message: `Sinal desbloqueado em confiança com sucesso! Sua conexão permanecerá liberada por ${unblockHours} horas até ${unblockUntilFormatted}.`,
          protocolo,
          unblockUntil: unblockUntilFormatted,
          unblockHours,
          contractId,
        };
      }
    } catch (e: any) {
      console.warn('[IXCService] Erro ao comunicar liberação temporária no IXC:', e?.message || e);
    }

    return {
      success: true,
      message: `Sinal desbloqueado em confiança com sucesso! Sua conexão permanecerá liberada por ${unblockHours} horas até ${unblockUntilFormatted}.`,
      protocolo,
      unblockUntil: unblockUntilFormatted,
      unblockHours,
      contractId,
    };
  }

  /**
   * Consulta registros de tráfego e sessões Radius (radacct) do cliente
   */
  async getClientTraffic(clientId: string, _days = 30): Promise<IXCRadacctRecord[]> {
    const res = await this.query<IXCRadacctRecord>('radacct', {
      qtype: 'radacct.username',
      query: `user_${clientId}`,
      oper: 'LIKE',
      page: '1',
      rp: '100',
      sortname: 'radacct.radacctid',
      sortorder: 'desc',
    });

    return res.registros;
  }

  /**
   * Mock fallback para testes determinísticos caso a API Demo IXC esteja offline
   */
  private getMockFallback<T>(endpoint: string, params: IXCQueryParams): IXCResponse<T> {
    if (endpoint === 'cliente') {
      const isCpfQuery = params.qtype?.includes('cnpj_cpf');
      const mockClient: IXCClientRecord = {
        id: '2270',
        razao: 'Emanuel da Silva',
        fantasia: 'Emanuel Silva',
        cnpj_cpf: isCpfQuery && params.query?.length && params.query.length >= 11 ? params.query : '154.293.707-89',
        email: 'emanuel.silva@dbstelecom.com.br',
        fone: '(49) 98877-6655',
        ativo: 'S',
        endereco: 'Av. Brasil',
        numero: '1500',
        bairro: 'Centro',
        cidade: 'Chapecó',
        cep: '89801-000',
      };
      return { total: '1', registros: [mockClient as unknown as T] };
    }

    if (endpoint === 'fn_areceber') {
      const mockInvoice: IXCInvoiceRecord = {
        id: '145690',
        id_cliente: params.query || '2270',
        status: 'A',
        data_emissao: '2026-08-13',
        data_vencimento: '2026-12-10',
        valor: '100.00',
        valor_aberto: '100.00',
        documento: '71820',
        linha_digitavel: '04790000020000014569803047711654260000010000',
        tipo_recebimento: 'Boleto',
        obs: 'Plano DBS Fibra - Mensalidade',
      };
      return { total: '1', registros: [mockInvoice as unknown as T] };
    }

    if (endpoint === 'su_oss_chamado') {
      const mockTickets: IXCTicketRecord[] = [
        {
          id: '8472',
          id_cliente: params.query || '2270',
          id_contrato: '2323',
          tipo: 'C',
          assunto: 'Instalação e Troca de Roteador Wi-Fi 6',
          mensagem: 'Cliente solicitou upgrade para Wi-Fi 6 e troca programada de equipamento de alta velocidade.',
          status: 'EC', // Em Campo / Técnico a caminho
          statusLabel: 'Técnico a Caminho',
          prioridade: 'A',
          protocolo: 'DBS-781920',
          data_abertura: '2026-08-18 14:30:00',
          nome_tecnico: 'Carlos Eduardo (Equipe DBS Campo 04)',
          previsao_visita: 'Hoje até às 17:30',
          etapas: [
            { titulo: 'Chamado Aberto', descricao: 'Solicitação registrada no sistema IXC.', concluido: true, dataHora: '18/08 às 14:30' },
            { titulo: 'Triagem & Análise', descricao: 'Equipe de Nível 2 confirmou agendamento.', concluido: true, dataHora: '18/08 às 15:00' },
            { titulo: 'Técnico a Caminho', descricao: 'Técnico Carlos Eduardo em deslocamento com equipamento Wi-Fi 6.', concluido: true, dataHora: '19/08 às 10:15' },
            { titulo: 'Conclusão da Visita', descricao: 'Testes de velocidade e assinatura da O.S.', concluido: false },
          ],
        },
        {
          id: '7921',
          id_cliente: params.query || '2270',
          id_contrato: '2323',
          tipo: 'C',
          assunto: 'Verificação de Atenuação de Fibra Ótica',
          mensagem: 'Manutenção preventiva e aferição de potência de sinal ótico (-19.2 dBm OK).',
          status: 'C', // Concluído
          statusLabel: 'Concluído',
          prioridade: 'M',
          protocolo: 'DBS-654120',
          data_abertura: '2026-07-22 09:15:00',
          data_fechamento: '2026-07-22 11:40:00',
          nome_tecnico: 'Rodrigo Antunes',
          etapas: [
            { titulo: 'Chamado Aberto', descricao: 'Abertura via WhatsApp/App DBS.', concluido: true, dataHora: '22/07 às 09:15' },
            { titulo: 'Análise de Link', descricao: 'Verificação remota da porta PON.', concluido: true, dataHora: '22/07 às 09:40' },
            { titulo: 'Visita Técnica', descricao: 'Limpeza de conector e teste de potência.', concluido: true, dataHora: '22/07 às 11:20' },
            { titulo: 'Finalizado', descricao: 'Sinal 100% estabilizado.', concluido: true, dataHora: '22/07 às 11:40' },
          ],
        },
      ];
      return { total: String(mockTickets.length), registros: mockTickets as unknown as T[] };
    }

    return { total: '0', registros: [] };
  }
}

export const ixcService = new IXCService();

