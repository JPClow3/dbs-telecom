import { DepartmentType } from '../ai/ai.service.js';

export type QueueStatus = 'IDLE' | 'QUEUED' | 'ASSIGNED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED';

export interface QueueEntry {
  queueId: string;
  sessionId: string;
  clientId: string;
  clientName: string;
  department: DepartmentType;
  reason?: string;
  status: QueueStatus;
  position: number;
  estimatedWaitMinutes: number;
  joinedAt: string;
  assignedAt?: string;
  completedAt?: string;
  assignedAgent?: {
    name: string;
    avatar?: string;
    role: string;
    department: DepartmentType;
  };
}

export interface QueueStatusResponse {
  inQueue: boolean;
  entry?: QueueEntry;
  totalInQueue: number;
  estimatedWaitMinutes: number;
}

const AGENTS_BY_DEPARTMENT: Record<DepartmentType, Array<{ name: string; role: string }>> = {
  SUPORTE: [
    { name: 'Mariana Souza', role: 'Especialista em Redes & Suporte N2' },
    { name: 'Lucas Pinheiro', role: 'Técnico de Conexão Fibra DBS' },
    { name: 'Rodrigo Antunes', role: 'Analista de Infraestrutura FTTH' },
  ],
  COMERCIAL: [
    { name: 'Camila Fernandes', role: 'Consultora de Planos & Wi-Fi 6' },
    { name: 'Bruno Guimarães', role: 'Gerente de Vendas DBS Telecom' },
  ],
  FINANCEIRO: [
    { name: 'Juliana Castro', role: 'Analista de Faturamento & Cobrança' },
    { name: 'Renato Silva', role: 'Especialista em Contas a Receber' },
  ],
  GERAL: [
    { name: 'Amanda Ribeiro', role: 'Atendente de Relacionamento DBS' },
    { name: 'Gabriel Santana', role: 'Supervisor de Atendimento ao Cliente' },
  ],
};

export class QueueService {
  private queue: Map<string, QueueEntry> = new Map();

  /**
   * Entra na fila virtual de atendimento humano
   */
  joinQueue(params: {
    sessionId: string;
    clientId: string;
    clientName?: string;
    department: DepartmentType;
    reason?: string;
  }): QueueEntry {
    const existing = this.getQueueEntry(params.clientId);
    if (existing && (existing.status === 'QUEUED' || existing.status === 'ASSIGNED' || existing.status === 'IN_SERVICE')) {
      this.recalculatePositions();
      return existing;
    }

    const queueId = `QUEUE-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();

    // Calcula a posição inicial baseada nos itens da fila do departamento
    const activeInDepartment = Array.from(this.queue.values()).filter(
      (item) => item.department === params.department && item.status === 'QUEUED'
    );
    const position = activeInDepartment.length + 1;
    // Tempo médio de ~2.5 min por pessoa à frente, mínimo de 2 min
    const estimatedWaitMinutes = Math.max(2, position * 2);

    const newEntry: QueueEntry = {
      queueId,
      sessionId: params.sessionId,
      clientId: params.clientId,
      clientName: params.clientName || 'Cliente',
      department: params.department,
      reason: params.reason || 'Solicitação expressa de atendimento humano',
      status: 'QUEUED',
      position,
      estimatedWaitMinutes,
      joinedAt: now,
    };

    this.queue.set(params.clientId, newEntry);
    this.recalculatePositions();

    return this.queue.get(params.clientId)!;
  }

  /**
   * Obtém o status da fila para um cliente específico
   */
  getQueueStatus(clientId: string): QueueStatusResponse {
    this.recalculatePositions();
    const entry = this.getQueueEntry(clientId);

    if (!entry || entry.status === 'COMPLETED' || entry.status === 'CANCELLED') {
      return {
        inQueue: false,
        totalInQueue: this.countActiveQueue(),
        estimatedWaitMinutes: 0,
      };
    }

    return {
      inQueue: true,
      entry,
      totalInQueue: this.countActiveQueue(entry.department),
      estimatedWaitMinutes: entry.estimatedWaitMinutes,
    };
  }

  /**
   * Cancela ou sai da fila de atendimento
   */
  leaveQueue(clientId: string): { success: boolean; message: string } {
    const entry = this.getQueueEntry(clientId);
    if (!entry) {
      return { success: false, message: 'Cliente não estava na fila de espera.' };
    }

    entry.status = 'CANCELLED';
    entry.completedAt = new Date().toISOString();
    this.recalculatePositions();

    return { success: true, message: 'Você saiu da fila de atendimento humano com sucesso.' };
  }

  /**
   * Simula ou processa o avanço da fila (para testes / transbordo ao vivo)
   */
  advanceQueue(clientId: string): QueueEntry | null {
    const entry = this.getQueueEntry(clientId);
    if (!entry) return null;

    if (entry.status === 'QUEUED') {
      if (entry.position > 1) {
        entry.position -= 1;
        entry.estimatedWaitMinutes = Math.max(1, entry.position * 2);
      } else {
        // Aloca um atendente disponível
        const deptAgents = AGENTS_BY_DEPARTMENT[entry.department] || AGENTS_BY_DEPARTMENT.GERAL;
        const randomAgent = deptAgents[Math.floor(Math.random() * deptAgents.length)];

        entry.status = 'ASSIGNED';
        entry.position = 0;
        entry.estimatedWaitMinutes = 0;
        entry.assignedAt = new Date().toISOString();
        entry.assignedAgent = {
          name: randomAgent.name,
          role: randomAgent.role,
          department: entry.department,
        };
      }
    } else if (entry.status === 'ASSIGNED') {
      entry.status = 'IN_SERVICE';
    } else if (entry.status === 'IN_SERVICE') {
      entry.status = 'COMPLETED';
      entry.completedAt = new Date().toISOString();
    }

    return entry;
  }

  /**
   * Recalcula dinamicamente as posições e tempos estimados da fila
   */
  private recalculatePositions(): void {
    const departments: DepartmentType[] = ['SUPORTE', 'COMERCIAL', 'FINANCEIRO', 'GERAL'];

    for (const dept of departments) {
      const active = Array.from(this.queue.values())
        .filter((e) => e.department === dept && e.status === 'QUEUED')
        .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());

      active.forEach((entry, index) => {
        entry.position = index + 1;
        entry.estimatedWaitMinutes = Math.max(1, (index + 1) * 2);
      });
    }
  }

  private countActiveQueue(department?: DepartmentType): number {
    return Array.from(this.queue.values()).filter(
      (e) => e.status === 'QUEUED' && (!department || e.department === department)
    ).length;
  }

  private getQueueEntry(clientIdOrSessionId: string): QueueEntry | undefined {
    for (const entry of this.queue.values()) {
      if (entry.clientId === clientIdOrSessionId || entry.sessionId === clientIdOrSessionId) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Estatísticas gerais da fila para monitoramento
   */
  getStats() {
    const entries = Array.from(this.queue.values());
    return {
      totalActive: entries.filter((e) => e.status === 'QUEUED').length,
      totalInService: entries.filter((e) => e.status === 'IN_SERVICE' || e.status === 'ASSIGNED').length,
      totalCompleted: entries.filter((e) => e.status === 'COMPLETED').length,
      averageWaitMinutes: 2.5,
    };
  }
}

export const queueService = new QueueService();
