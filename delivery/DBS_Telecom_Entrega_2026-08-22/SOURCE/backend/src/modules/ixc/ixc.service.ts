import { CONFIG } from '../../config/env.js';
import { ixcCache } from './ixc.cache.js';
import {
  IXCClientRecord,
  IXCContractRecord,
  IXCInvoiceRecord,
  IXCQueryParams,
  IXCResponse,
  IXCTicketRecord,
  IXCRadacctRecord,
} from './ixc.types.js';

export class IXCUnavailableError extends Error {
  readonly code = 'IXC_UNAVAILABLE';

  constructor(message: string) {
    super(message);
    this.name = 'IXCUnavailableError';
  }
}

export class IXCService {
  private baseUrl: string;
  // Cache do header Basic: Buffer.from + base64 roda uma vez por processo,
  // não a cada requisição (CONFIG é resolvido no import, token é imutável).
  private authHeaderCache: string | null = null;

  constructor() {
    this.baseUrl = CONFIG.ixc.baseUrl.replace(/\/+$/, '');
  }

  private get authHeader(): string {
    this.authHeaderCache ||= 'Basic ' + Buffer.from(CONFIG.ixc.token).toString('base64');
    return this.authHeaderCache;
  }

  private unavailable(endpoint: string, cause?: unknown): IXCUnavailableError {
    const detail = cause instanceof Error ? cause.message : 'provider unavailable';
    return new IXCUnavailableError(`IXC indisponível para ${endpoint}: ${detail}`);
  }

  /**
   * Executa requisição POST para o WebService v1 do IXC Soft
   */
  async query<T>(endpoint: string, params: IXCQueryParams): Promise<IXCResponse<T>> {
    const url = `${this.baseUrl}/${endpoint}`;

    if (CONFIG.demoMode && !CONFIG.ixc.token) {
      return this.getMockFallback<T>(endpoint, params);
    }

    if (!CONFIG.demoMode && !CONFIG.ixc.token) {
      throw this.unavailable(endpoint, 'IXC_TOKEN não configurado');
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
          'ixcsoft': 'listar',
        },
        // IXC WebService is an external ERP and can take a few seconds from
        // an edge Worker. A 1.2s timeout caused false "server unavailable"
        // errors even when the same authenticated request succeeds.
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`HTTP Error IXC ${response.status}: ${response.statusText}`);
      }

      const data: any = await response.json();
      const validEmptyResult = data && typeof data === 'object' &&
        data.registros === undefined && ('page' in data || 'total' in data);
      if (!data || (!Array.isArray(data.registros) && !validEmptyResult)) {
        throw new Error('Resposta IXC fora do formato esperado.');
      }
      return {
        page: data.page || '1',
        total: data.total || (data.registros ? data.registros.length : 0),
        registros: Array.isArray(data.registros) ? data.registros : [],
      };
    } catch (error: any) {
      console.warn(`[IXCService] Erro ao consultar ${endpoint}:`, error.message);
      // Offline fixtures are opt-in test/demo behavior only. Production and
      // normal development must surface provider failure to the caller.
      if (CONFIG.demoMode) return this.getMockFallback<T>(endpoint, params);
      throw this.unavailable(endpoint, error);
    }
  }

  /**
   * Busca cliente por CPF ou CNPJ (sanitizado) com cache em memória
   */
  async findClientByCpfCnpj(cpfCnpj: string): Promise<IXCClientRecord | null> {
    const cleanDoc = cpfCnpj.replace(/\D/g, '');
    const cacheKey = `client:doc:${cleanDoc}`;

    const cached = ixcCache.get<IXCClientRecord>(cacheKey);
    if (cached) {
      return cached;
    }

    if (CONFIG.demoMode && (cleanDoc === '15429370789' || cleanDoc === '2270')) {
      const mock = this.getMockFallback<IXCClientRecord>('cliente', { query: '154.293.707-89', qtype: 'cnpj_cpf' }).registros[0];
      if (mock) {
        ixcCache.set(cacheKey, mock, 300);
        ixcCache.set(`client:id:${mock.id}`, mock, 300);
        return mock;
      }
    }

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
      if (resById) {
        ixcCache.set(cacheKey, resById, 60);
        return resById;
      }
    }

    const client = res.registros.length > 0 ? res.registros[0] : null;
    if (client) {
      ixcCache.set(cacheKey, client, 60);
      if (client.id) {
        ixcCache.set(`client:id:${client.id}`, client, 60);
      }
    }

    return client;
  }

  /**
   * Busca cliente por ID com cache em memória
   */
  async findClientById(clientId: string): Promise<IXCClientRecord | null> {
    const cacheKey = `client:id:${clientId}`;
    const cached = ixcCache.get<IXCClientRecord>(cacheKey);
    if (cached) {
      return cached;
    }

    if (CONFIG.demoMode && clientId === '2270') {
      const mock = this.getMockFallback<IXCClientRecord>('cliente', { query: '2270', qtype: 'id' }).registros[0];
      if (mock) {
        ixcCache.set(cacheKey, mock, 300);
        return mock;
      }
    }

    const res = await this.query<IXCClientRecord>('cliente', {
      qtype: 'cliente.id',
      query: clientId,
      oper: '=',
      page: '1',
      rp: '1',
    });

    const client = res.registros.length > 0 ? res.registros[0] : null;
    if (client) {
      ixcCache.set(cacheKey, client, 60);
      if (client.cnpj_cpf) {
        const clean = client.cnpj_cpf.replace(/\D/g, '');
        if (clean) ixcCache.set(`client:doc:${clean}`, client, 60);
      }
    }

    return client;
  }

  /**
   * Busca contratos ativos do cliente com cache em memória
   */
  async getClientContracts(clientId: string): Promise<IXCContractRecord[]> {
    const cacheKey = `contracts:${clientId}`;
    const cached = ixcCache.get<IXCContractRecord[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const res = await this.query<IXCContractRecord>('cliente_contrato', {
      qtype: 'cliente_contrato.id_cliente',
      query: clientId,
      oper: '=',
      page: '1',
      rp: '5',
      sortname: 'cliente_contrato.id',
      sortorder: 'desc',
    });

    const contracts = res.registros;
    ixcCache.set(cacheKey, contracts, 60);
    return contracts;
  }

  /**
   * Busca faturas (contas a receber) em aberto do cliente com cache em memória
   */
  async getClientInvoices(clientId: string): Promise<IXCInvoiceRecord[]> {
    const cacheKey = `invoices:${clientId}`;
    const cached = ixcCache.get<IXCInvoiceRecord[]>(cacheKey);
    if (cached) {
      return cached;
    }

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
    const filtered = res.registros.filter((inv) => inv.status === 'A' || inv.status === undefined);
    ixcCache.set(cacheKey, filtered, 60);
    return filtered;
  }

  /**
   * Registra ordem de serviço / chamado técnico no IXC
   */
  async createTicket(ticket: IXCTicketRecord): Promise<{
    success: boolean;
    protocolo: string;
    id?: string;
    simulated?: boolean;
    message?: string;
  }> {
    const url = `${this.baseUrl}/su_oss_chamado`;
    const protocolo = 'DBS-' + Math.floor(100000 + Math.random() * 900000);

    if (CONFIG.demoMode && !CONFIG.ixc.token) {
      ixcCache.invalidateClient(ticket.id_cliente);
      return {
        success: true,
        protocolo,
        id: 'TKT-DEMO-' + Date.now().toString().slice(-6),
        simulated: true,
        message: 'Chamado simulado no adaptador de demonstração; não foi enviado ao IXC.',
      };
    }

    if (!CONFIG.demoMode && !CONFIG.ixc.token) {
      throw this.unavailable('su_oss_chamado', 'IXC_TOKEN não configurado');
    }

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
        const providerId = data.id ?? data.registro?.id ?? data.protocolo;
        if (!providerId && data.success !== true) {
          throw this.unavailable('su_oss_chamado', 'resposta sem confirmação do ERP');
        }
        ixcCache.invalidateClient(ticket.id_cliente);
        return {
          success: true,
          protocolo,
          id: providerId ? String(providerId) : undefined,
        };
      }
    } catch (e) {
      console.warn('[IXCService] Erro ao criar chamado no IXC:', e);
    }

    ixcCache.invalidateClient(ticket.id_cliente);
    if (CONFIG.demoMode) {
      return {
        success: true,
        protocolo,
        id: 'TKT-DEMO-' + Date.now().toString().slice(-6),
        simulated: true,
        message: 'Chamado simulado no adaptador de demonstração; não foi enviado ao IXC.',
      };
    }
    throw this.unavailable('su_oss_chamado');
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
    protocolo?: string;
    unblockUntil?: string;
    unblockHours?: number;
    contractId?: string;
    simulated?: boolean;
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

    if (CONFIG.demoMode && !CONFIG.ixc.token) {
      ixcCache.invalidateClient(clientId);
      return {
        success: true,
        message: 'SIMULAÇÃO: o IXC não foi alterado. Em produção, a liberação só será confirmada após resposta do ERP.',
        protocolo,
        unblockUntil: unblockUntilFormatted,
        unblockHours,
        contractId,
        simulated: true,
      };
    }

    if (!CONFIG.demoMode && !CONFIG.ixc.token) {
      throw this.unavailable('liberacao_temporaria', 'IXC_TOKEN não configurado');
    }

    // Resolve o contrato real do cliente no ERP. Nunca enviar um id_contrato
    // inventado: liberar o contrato errado afeta a conexão de outro cliente.
    let resolvedContractId = contractId;
    if (!resolvedContractId) {
      const contracts = await this.getClientContracts(clientId);
      resolvedContractId = contracts[0]?.id || '';
    }
    if (!resolvedContractId) {
      throw this.unavailable('liberacao_temporaria', 'nenhum contrato ativo encontrado para o cliente');
    }

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
          id_contrato: resolvedContractId,
          dias: '3',
          protocolo,
        }),
      });

      if (response.ok) {
        const data: any = await response.json().catch(() => ({}));
        if (data?.success === false || (data && data.status === 'error')) {
          throw this.unavailable('liberacao_temporaria', 'ERP recusou a liberação');
        }
        if (!data || Object.keys(data).length === 0) {
          throw this.unavailable('liberacao_temporaria', 'resposta sem confirmação do ERP');
        }
        ixcCache.invalidateClient(clientId);
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

    ixcCache.invalidateClient(clientId);
    if (CONFIG.demoMode) {
      return {
        success: true,
        message: `SIMULAÇÃO: o IXC não foi alterado. Em produção, a liberação só será confirmada após resposta do ERP.`,
        protocolo,
        unblockUntil: unblockUntilFormatted,
        unblockHours,
        contractId,
        simulated: true,
      };
    }
    throw this.unavailable('liberacao_temporaria');
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
