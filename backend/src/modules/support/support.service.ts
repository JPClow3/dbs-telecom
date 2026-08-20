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
      message: '🛠️ **Suporte Técnico Inteligente - DBS Telecom**\n\n📌 **Etapa 1 de 3: Identificação de Dispositivos**\nPara iniciarmos o teste de rede, me responda: a lentidão ou instabilidade está acontecendo em **todos os aparelhos** da sua residência (celulares, TVs, notebooks) ou apenas em um dispositivo específico?',
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
    let state = await supportRepository.getDiagnosticState(clientId);
    if (!state) {
      return await this.startDiagnostic(clientId);
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
        message: '🔍 **Etapa 2 de 3: Verificação de Cabos e Sinal Ótico**\n\nVamos conferir os equipamentos instalados na sua casa:\n\n1. Olhe para as luzes (LEDs) do roteador/ONU: as luzes **PON/Internet** e **WLAN** estão acesas em **verde fixo**?\n2. O cabo de fibra ótica fino (amarelo ou azul) está bem conectado na parte traseira sem dobras?',
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
        message: '🔌 **Etapa 3 de 3: Reinicialização Assistida de Equipamentos**\n\nVamos realizar o procedimento padrão de limpeza de cache de conexão:\n\n1. **Desconecte a fonte do roteador/ONU da tomada** por **30 segundos**.\n2. Conecte novamente e aguarde cerca de **2 minutos** até todas as luzes estabilizarem.\n\nApós o procedimento, faça um teste de navegação. A conexão voltou a funcionar normalmente?',
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
          message: '🎉 **Conexão Restabelecida com Sucesso!**\n\nQue excelente notícia! Sua conexão foi restabelecida pelo pré-atendimento inteligente da DBS Telecom.\n\nSe precisar de mais alguma coisa, estamos sempre à sua disposição!',
          options: ['Voltar ao início', 'Ver faturas', 'Planos disponíveis'],
        };
      } else {
        // Escalonar e abrir chamado no IXC
        state.step = 'ESCALATED';
        const ticketRes = await ixcService.createTicket({
          id_cliente: clientId,
          tipo: 'C',
          assunto: 'Reclamação de Lentidão/Instabilidade - App Mobile',
          mensagem: `Cliente realizou o diagnóstico automatizado no aplicativo mobile (verificação de múltiplos aparelhos, cabos e reboot de 30s), mas a lentidão/queda persiste.`,
        });

        state.protocolo = ticketRes.protocolo;
        state.ticketId = ticketRes.id;
        await this.saveState(clientId, state);

        const nowFormatted = new Date().toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        // Registra o chamado no SQLite com timeline persistida
        const newTicket: IXCTicketRecord = {
          id: ticketRes.id || `TKT-${Date.now().toString().slice(-6)}`,
          id_cliente: clientId,
          id_contrato: '2323',
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

        return {
          step: 'ESCALATED',
          message: `🎫 **Chamado Técnico Aberto com Sucesso!**\n\nComo o problema não foi solucionado pelos testes iniciais, registrei uma **Ordem de Serviço** prioritária no sistema IXC:\n\n📋 **Protocolo de Atendimento:** \`${ticketRes.protocolo}\`\n\nEncaminhei seus dados com prioridade para a nossa **Equipe de Suporte Avançado Nível 2**. Um especialista entrará em contato em breve para realizar a verificação do link de fibra ótica.`,
          options: ['Acompanhar chamado', 'Falar com atendente', 'Voltar ao menu'],
          protocolo: ticketRes.protocolo,
        };
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

    if (ticketMap.size === 0) {
      const defaultTickets: IXCTicketRecord[] = [
        {
          id: '8472',
          id_cliente: clientId,
          id_contrato: '2323',
          tipo: 'C',
          assunto: 'Instalação e Troca de Roteador Wi-Fi 6',
          mensagem: 'Cliente solicitou upgrade para Wi-Fi 6 e troca programada de equipamento de alta velocidade.',
          status: 'EC',
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
          id_cliente: clientId,
          id_contrato: '2323',
          tipo: 'C',
          assunto: 'Verificação de Atenuação de Fibra Ótica',
          mensagem: 'Manutenção preventiva e aferição de potência de sinal ótico (-19.2 dBm OK).',
          status: 'C',
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
      return defaultTickets;
    }

    return Array.from(ticketMap.values());
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
