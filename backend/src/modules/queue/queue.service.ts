import { EventEmitter } from 'events';
import { DepartmentType } from '../ai/ai.service.js';
import { queueRepository } from './queue.repository.js';

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
  public readonly queueEvents = new EventEmitter();

  constructor() {
    this.queueEvents.setMaxListeners(500);
  }

  /**
   * Entra na fila virtual de atendimento humano persistida em SQLite
   */
  async joinQueue(params: {
    sessionId: string;
    clientId: string;
    clientName?: string;
    department: DepartmentType;
    reason?: string;
  }): Promise<QueueEntry> {
    const existing = await queueRepository.getByClientOrSession(params.clientId);
    if (existing && (existing.status === 'QUEUED' || existing.status === 'ASSIGNED' || existing.status === 'IN_SERVICE')) {
      await this.recalculatePositions();
      const updated = await queueRepository.getByClientOrSession(params.clientId) || existing;
      this.notifyUpdate(updated);
      return updated;
    }

    const queueId = `QUEUE-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();

    // Calcula a posição inicial baseada nos itens da fila do departamento
    const activeInDepartment = await queueRepository.getQueuedByDepartment(params.department);
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

    await queueRepository.upsert(newEntry);
    await this.recalculatePositions();

    const saved = await queueRepository.getByClientOrSession(params.clientId) || newEntry;
    this.notifyUpdate(saved);
    return saved;
  }

  /**
   * Obtém o status da fila para um cliente específico persistido em SQLite
   */
  async getQueueStatus(clientId: string): Promise<QueueStatusResponse> {
    await this.recalculatePositions();
    const entry = await queueRepository.getByClientOrSession(clientId);

    if (!entry || entry.status === 'COMPLETED' || entry.status === 'CANCELLED') {
      return {
        inQueue: false,
        totalInQueue: await this.countActiveQueue(),
        estimatedWaitMinutes: 0,
      };
    }

    return {
      inQueue: true,
      entry,
      totalInQueue: await this.countActiveQueue(entry.department),
      estimatedWaitMinutes: entry.estimatedWaitMinutes,
    };
  }

  /**
   * Cancela ou sai da fila de atendimento
   */
  async leaveQueue(clientId: string): Promise<{ success: boolean; message: string }> {
    const entry = await queueRepository.getByClientOrSession(clientId);
    if (!entry) {
      return { success: false, message: 'Cliente não estava na fila de espera.' };
    }

    entry.status = 'CANCELLED';
    entry.completedAt = new Date().toISOString();
    await queueRepository.upsert(entry);
    await this.recalculatePositions();

    this.notifyUpdate(entry);

    return { success: true, message: 'Você saiu da fila de atendimento humano com sucesso.' };
  }

  /**
   * Simula ou processa o avanço da fila (para testes / transbordo ao vivo)
   */
  async advanceQueue(clientId: string): Promise<QueueEntry | null> {
    const entry = await queueRepository.getByClientOrSession(clientId);
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

    await queueRepository.upsert(entry);
    this.notifyUpdate(entry);
    return entry;
  }

  /**
   * Emite notificações em tempo real para os clientes conectados
   */
  private notifyUpdate(entry: QueueEntry): void {
    this.queueEvents.emit('update', entry);
    this.queueEvents.emit(`update:${entry.clientId}`, entry);
    this.queueEvents.emit('queue_changed');
  }

  /**
   * Recalcula dinamicamente as posições e tempos estimados da fila e atualiza o banco
   */
  private async recalculatePositions(): Promise<void> {
    const departments: DepartmentType[] = ['SUPORTE', 'COMERCIAL', 'FINANCEIRO', 'GERAL'];

    for (const dept of departments) {
      const active = await queueRepository.getQueuedByDepartment(dept);
      const updates: Array<{ queueId: string; position: number; estimatedWaitMinutes: number }> = [];

      active.forEach((entry, index) => {
        const newPos = index + 1;
        const newWait = Math.max(1, (index + 1) * 2);
        if (entry.position !== newPos || entry.estimatedWaitMinutes !== newWait) {
          updates.push({
            queueId: entry.queueId,
            position: newPos,
            estimatedWaitMinutes: newWait,
          });
        }
      });

      if (updates.length > 0) {
        await queueRepository.updateBatchPositions(updates);
      }
    }
  }

  private async countActiveQueue(department?: DepartmentType): Promise<number> {
    if (department) {
      return (await queueRepository.getQueuedByDepartment(department)).length;
    }
    const all = await queueRepository.getActiveEntries();
    return all.filter((e) => e.status === 'QUEUED').length;
  }

  /**
   * Estatísticas gerais da fila para monitoramento
   */
  async getStats() {
    return await queueRepository.getStats();
  }
}

export const queueService = new QueueService();
