import { ixcService } from '../ixc/ixc.service.js';
import { IXCTicketRecord } from '../ixc/ixc.types.js';
import { supportRepository } from './support.repository.js';

export type DiagnosticStep = 'IDLE' | 'STEP_1_DEVICES' | 'STEP_2_CABLES' | 'STEP_3_RESTART' | 'ESCALATED' | 'RESOLVED';

export interface DiagnosticState {
  clientId: string;
  step: DiagnosticStep;
  multipleDevices?: boolean;
  cablesChecked?: boolean;
  restarted?: boolean;
  protocolo?: string;
  ticketId?: string;
  updatedAt?: number;
}

export class SupportService {
  private readonly diagnosticLocks = new Map<string, Promise<void>>();

  private async withDiagnosticLock<T>(clientId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.diagnosticLocks.get(clientId) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    this.diagnosticLocks.set(clientId, current);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.diagnosticLocks.get(clientId) === current) {
        this.diagnosticLocks.delete(clientId);
      }
    }
  }

  private escalatedResult(protocolo?: string) {
    return {
      step: 'ESCALATED' as const,
      message: protocolo
        ? `🎫 **Ordem de Serviço já está aberta.**\n\nO diagnóstico deste cliente já foi escalado para o suporte técnico.\n\n📋 **Protocolo de Atendimento:** \`${protocolo}\``
        : '🎫 **Ordem de Serviço em processamento.**\n\nO diagnóstico já foi escalado e o protocolo será disponibilizado assim que o ERP confirmar o chamado.',
      options: ['Acompanhar chamado', 'Falar com atendente', 'Voltar ao menu'],
      ...(protocolo ? { protocolo } : {}),
    };
  }

  private async saveState(clientId: string, state: DiagnosticState): Promise<void> {
    state.updatedAt = Date.now();
    state.clientId = clientId;
    await supportRepository.saveDiagnosticState(state);
  }

  /**
   * Inicia o fluxo de diagnóstico guiado de suporte
   */
  async startDiagnostic(clientId: string): Promise<{ message: string; step: DiagnosticStep; options: string[] }> {
    const state: DiagnosticState = {
      clientId,
      step: 'STEP_1_DEVICES',
      updatedAt: Date.now(),
    };
    await this.saveState(clientId, state);

    return {
      step: 'STEP_1_DEVICES',
      message: '🛠️ **Diagnóstico Inteligente de Conexão - DBS Telecom**\n\n📌 **Etapa 1 de 3: Identificação de Dispositivos**\nPara entendermos a origem da instabilidade, me conte: o problema de lentidão ou queda está acontecendo em **todos os aparelhos** da sua casa (celulares, TVs, computadores) ou apenas em um dispositivo específico?',
      options: ['Acontece em todos os aparelhos', 'Apenas em um aparelho'],
    };
  }

  /**
   * Avança a máquina de estados do diagnóstico persistida em SQLite
   */
  async processDiagnosticStep(clientId: string, userResponse: string): Promise<{
    message: string;
    step: DiagnosticStep;
    options: string[];
    actionRequired?: string;
    protocolo?: string;
  }> {
    return this.withDiagnosticLock(clientId, () => this.processDiagnosticStepUnlocked(clientId, userResponse));
  }

  private async processDiagnosticStepUnlocked(clientId: string, userResponse: string): Promise<{
    message: string;
    step: DiagnosticStep;
    options: string[];
    actionRequired?: string;
    protocolo?: string;
  }> {
    let state = await supportRepository.getDiagnosticState(clientId);
    if (!state) {
      return await this.startDiagnostic(clientId);
    }

    // Repeating the final diagnostic action is idempotent: return the existing
    // protocol instead of reopening a second IXC ticket.
    if (state.step === 'ESCALATED') {
      return this.escalatedResult(state.protocolo);
    }

    const lower = userResponse.toLowerCase();

    // ETAPA 1 -> ETAPA 2
    if (state.step === 'STEP_1_DEVICES') {
      const isMultiple = lower.includes('todos') || lower.includes('sim') || lower.includes('vários') || lower.includes('varios');
      state.multipleDevices = isMultiple;
      state.step = 'STEP_2_CABLES';
      await this.saveState(clientId, state);

      return {
        step: 'STEP_2_CABLES',
        message: '🔍 **Etapa 2 de 3: Verificação de Cabos e Luzes do Roteador**\n\nVamos checar os equipamentos instalados na sua casa:\n\n1. Olhe para as luzes (LEDs) do seu roteador/ONU: as luzes **PON/Internet** e **WLAN** estão acesas em **verde fixo**?\n2. O cabo fino de fibra ótica (amarelo ou azul) está bem encaixado na parte de trás, sem dobras ou vincos?',
        options: ['Sim, luzes verdes e cabos firmes', 'Tem luz vermelha/piscando ou cabo solto'],
      };
    }

    // ETAPA 2 -> ETAPA 3
    if (state.step === 'STEP_2_CABLES') {
      state.cablesChecked = true;
      state.step = 'STEP_3_RESTART';
      await this.saveState(clientId, state);

      return {
        step: 'STEP_3_RESTART',
        message: '🔌 **Etapa 3 de 3: Reinicialização Assistida de Equipamentos**\n\nVamos fazer uma limpeza de conexão e renovação de IP do roteador:\n\n1. **Desconecte o cabo de energia (fonte) do roteador da tomada** e aguarde **30 segundos**.\n2. Conecte de volta na tomada e aguarde cerca de **2 minutos** até que todas as luzes verdes fiquem acesas.\n\nApós aguardar, faça um teste de navegação. A internet voltou a funcionar normalmente?',
        options: ['Sim! Conexão normalizou ✅', 'Não, ainda continua com lentidão/sem internet ❌'],
      };
    }

    // ETAPA 3 -> RESOLUÇÃO OU ESCALONAMENTO
    if (state.step === 'STEP_3_RESTART') {
      const isResolved = lower.includes('sim') || lower.includes('normalizou') || lower.includes('voltou') || lower.includes('ótimo') || lower.includes('otimo') || lower.includes('✅');

      if (isResolved) {
        state.step = 'RESOLVED';
        await supportRepository.deleteDiagnosticState(clientId);
        return {
          step: 'RESOLVED',
          message: '🎉 **Conexão 100% Restabelecida!**\n\nQue ótima notícia! Fico muito contente que deu tudo certo e sua internet já está operando normalmente.\n\nSe precisar de qualquer outra ajuda, estamos sempre por aqui para te atender. Tenha uma ótima navegação!',
          options: ['Voltar ao início', 'Ver faturas', 'Planos disponíveis'],
        };
      } else {
        // Escalonar e abrir chamado no IXC. A transição condicional é a
        // segunda barreira para deployments com mais de uma instância.
        const claimed = await supportRepository.claimDiagnosticEscalation(clientId);
        if (!claimed) {
          const current = await supportRepository.getDiagnosticState(clientId);
          return current?.step === 'ESCALATED'
            ? this.escalatedResult(current.protocolo)
            : this.startDiagnostic(clientId);
        }

        state.step = 'ESCALATED';
        let ticketRes: Awaited<ReturnType<typeof ixcService.createTicket>>;
        try {
          ticketRes = await ixcService.createTicket({
            id_cliente: clientId,
            tipo: 'C',
            assunto: 'Reclamação de Lentidão/Instabilidade - App Mobile',
            mensagem: `Cliente realizou o diagnóstico automatizado no aplicativo mobile (verificação de múltiplos aparelhos, cabos e reboot de 30s), mas a lentidão/queda persiste.`,
          });
        } catch (error) {
          // Do not leave a failed external side effect in a terminal state; a
          // later attempt may retry the escalation exactly once.
          state.step = 'STEP_3_RESTART';
          await this.saveState(clientId, state);
          throw error;
        }

        state.protocolo = ticketRes.protocolo;
        state.ticketId = ticketRes.id;
        await this.saveState(clientId, state);

        const nowFormatted = new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        // Resolve o contrato real do cliente; nunca envia um id inventado ao ERP.
        let contractId = '';
        try {
          const contracts = await ixcService.getClientContracts(clientId);
          contractId = contracts[0]?.id || '';
        } catch {
          contractId = '';
        }

        // Registra o chamado no SQLite com timeline persistida
        const newTicket: IXCTicketRecord = {
          id: ticketRes.id || `TKT-${Date.now().toString().slice(-6)}`,
          id_cliente: clientId,
          id_contrato: contractId,
          tipo: 'C',
          assunto: 'Instabilidade / Lentidão Reportada via App',
          mensagem: 'Cliente realizou diagnóstico guiado de 3 etapas no app. Equipamentos verificados e reiniciados.',
          status: 'AN',
          statusLabel: 'Em Análise pelo Suporte',
          prioridade: 'A',
          protocolo: ticketRes.protocolo,
          data_abertura: new Date().toISOString(),
          nome_tecnico: 'Triagem Automática Nível 2 DBS',
          previsao_visita: 'Hoje nas próximas 2 a 4 horas',
          etapas: [
            { titulo: 'Chamado Aberto', descricao: 'Diagnóstico guiado concluído no app.', concluido: true, dataHora: nowFormatted },
            { titulo: 'Análise de Link Ótico', descricao: 'Equipe de plantão verificando atenuação e porta OLT.', concluido: true, dataHora: nowFormatted },
            { titulo: 'Técnico em Deslocamento', descricao: 'Agendamento de equipe externa se necessário.', concluido: false },
            { titulo: 'Conclusão da O.S.', descricao: 'Link 100% normalizado e liberado.', concluido: false },
          ],
        };

        await supportRepository.saveUserTicket(newTicket);

        return this.escalatedResult(ticketRes.protocolo);
      }
    }

    // Default se estado desconhecido
    return await this.startDiagnostic(clientId);
  }

  /**
   * Retorna a lista de chamados (O.S.) do cliente com histórico completo
   */
  async getClientTickets(clientId: string): Promise<IXCTicketRecord[]> {
    const fromIXC = await ixcService.getClientTickets(clientId);
    const sessionTickets = await supportRepository.getUserTickets(clientId);

    // Mescla sem duplicidade de ID ou Protocolo
    const ticketMap = new Map<string, IXCTicketRecord>();

    for (const t of sessionTickets) {
      if (t.protocolo) ticketMap.set(t.protocolo, t);
      else if (t.id) ticketMap.set(t.id, t);
    }

    for (const t of fromIXC) {
      const key = t.protocolo || t.id || Math.random().toString();
      if (!ticketMap.has(key)) {
        // Enriquece o statusLabel se não vier preenchido
        const statusLabel =
          t.statusLabel ||
          (t.status === 'C' || t.status === 'F'
            ? 'Concluído'
            : t.status === 'EC'
            ? 'Técnico a Caminho'
            : t.status === 'AN'
            ? 'Em Análise'
            : 'Aberto');

        ticketMap.set(key, { ...t, statusLabel });
      }
    }

    // Sem chamados reais (IXC vazio + nada registrado localmente) a resposta
    // honesta é uma lista vazia; nunca apresentar O.S. inventadas como reais.
    return Array.from(ticketMap.values());
  }

  /**
   * Chamados paginados do cliente (fatiado após a mescla IXC + locais,
   * mantendo o total fiel ao volume completo mesclado).
   */
  async getClientTicketsPaginated(
    clientId: string,
    page = 1,
    limit = 20
  ): Promise<{ tickets: IXCTicketRecord[]; total: number; page: number; limit: number }> {
    const all = await this.getClientTickets(clientId);
    const start = (page - 1) * limit;
    return { tickets: all.slice(start, start + limit), total: all.length, page, limit };
  }

  /**
   * Obtém o estado de diagnóstico atual do SQLite
   */
  async getState(clientId: string): Promise<DiagnosticState | undefined> {
    return await supportRepository.getDiagnosticState(clientId);
  }

  /**
   * Reseta o diagnóstico
   */
  async reset(clientId: string): Promise<void> {
    await supportRepository.deleteDiagnosticState(clientId);
  }
}

export const supportService = new SupportService();
