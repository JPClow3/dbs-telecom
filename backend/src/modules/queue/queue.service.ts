import { EventEmitter } from 'events';
import { DepartmentType } from '../ai/ai.service.js';
import { queueRepository } from './queue.repository.js';

/** Reexportado para consumidores do módulo de fila (ex.: queue.routes.ts). */
export type { DepartmentType };

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

/** Lista canônica de departamentos válidos na fila virtual. */
const VALID_DEPARTMENTS: ReadonlySet<string> = new Set<string>(['SUPORTE', 'COMERCIAL', 'FINANCEIRO', 'GERAL']);

/**
 * Valida o departamento informado. A fila virtual nunca aceita valores
 * arbitrários: um departamento desconhecido não tem atendentes mapeados
 * (AGENTS_BY_DEPARTMENT), não entra no recálculo de posições
 * (recalculatePositions itera a lista canônica) e deixaria o cliente preso
 * eternamente na posição #1. Chamadas internas (chat.conversation) sempre
 * derivam o departamento da sessão classificada pela IA, então continuam
 * funcionando sem alteração.
 */
export function isKnownDepartment(department: string): department is DepartmentType {
  return VALID_DEPARTMENTS.has(String(department || '').trim().toUpperCase());
}

export class QueueService {
  public readonly queueEvents = new EventEmitter();

  /** Serializa operações por cliente, evitando entradas duplicadas na fila. */
  private readonly clientLocks = new Map<string, Promise<unknown>>();

  constructor() {
    this.queueEvents.setMaxListeners(500);
  }

  /**
   * Executa o handler em uma cadeia serializada por clientId. Em um único
   * processo Node isso reduz contenção; a restrição UNIQUE parcial no banco é
   * a autoridade que também cobre múltiplas instâncias.
   */
  private withClientLock<T>(clientId: string, handler: () => Promise<T>): Promise<T> {
    const previous = this.clientLocks.get(clientId) || Promise.resolve();
    const next = previous.then(handler, handler);
    const tail = next.then(
      () => undefined,
      () => undefined,
    );
    this.clientLocks.set(clientId, tail);
    void tail.then(() => {
      if (this.clientLocks.get(clientId) === tail) {
        this.clientLocks.delete(clientId);
      }
    });
    return next;
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
    return this.withClientLock(params.clientId, () => this.joinQueueInternal(params));
  }

  private async joinQueueInternal(params: {
    sessionId: string;
    clientId: string;
    clientName?: string;
    department: DepartmentType;
    reason?: string;
  }): Promise<QueueEntry> {
    const existing = await queueRepository.getActiveByClient(params.clientId);
    if (existing) {
      await this.recalculatePositions();
      const updated = await queueRepository.getActiveByClient(params.clientId) || existing;
      this.notifyUpdate(updated);
      return updated;
    }

    const queueId = `QUEUE-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const now = new Date().toISOString();

    // Calcula a posição inicial baseada nos itens da fila do departamento.
    // A lista ranqueada (ROW_NUMBER sobre joined_at) é a fonte autoritativa:
    // timestamps idênticos não geram mais posições duplicadas.
    const activeInDepartment = await queueRepository.getQueuedByDepartmentRanked(params.department);
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

    try {
      // Plain INSERT lets the partial unique index reject a concurrent
      // admission instead of silently overwriting queue history.
      await queueRepository.insert(newEntry);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.recalculatePositions();
      const concurrentEntry = await queueRepository.getActiveByClient(params.clientId);
      if (!concurrentEntry) throw error;
      this.notifyUpdate(concurrentEntry);
      return concurrentEntry;
    }
    await this.recalculatePositions();

    const saved = await queueRepository.getActiveByClient(params.clientId) || newEntry;
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
   * Cancela ou sai da fila de atendimento. Cancela todas as entradas ativas
   * do cliente para não deixar registros fantasma inflando as posições.
   */
  async leaveQueue(clientId: string): Promise<{ success: boolean; message: string }> {
    return this.withClientLock(clientId, () => this.leaveQueueInternal(clientId));
  }

  private async leaveQueueInternal(clientId: string): Promise<{ success: boolean; message: string }> {
    let cancelledAny = false;

    // Cancela repetidamente até não restar nenhuma entrada ativa (proteção
    // contra duplicidades criadas antes da trava existir).
    for (let guard = 0; guard < 10; guard++) {
      const entry = await queueRepository.getByClientOrSession(clientId);
      if (!entry || entry.status === 'COMPLETED' || entry.status === 'CANCELLED') {
        break;
      }

      entry.status = 'CANCELLED';
      entry.completedAt = new Date().toISOString();
      await queueRepository.upsert(entry);
      cancelledAny = true;
      this.notifyUpdate(entry);
    }

    if (!cancelledAny) {
      return { success: false, message: 'Cliente não estava na fila de espera.' };
    }

    await this.recalculatePositions();
    return { success: true, message: 'Você saiu da fila de atendimento humano com sucesso.' };
  }

  /**
   * Simula ou processa o avanço da fila (para testes / transbordo ao vivo)
   */
  async advanceQueue(clientId: string): Promise<QueueEntry | null> {
    return this.withClientLock(clientId, () => this.advanceQueueInternal(clientId));
  }

  private async advanceQueueInternal(clientId: string): Promise<QueueEntry | null> {
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
      // A ordenação autoritativa vem de ROW_NUMBER() sobre joined_at com
      // queue_id como desempate; o valor persistido em `position` não é
      // confiável para entradas QUEUED sob escritas concorrentes.
      const active = await queueRepository.getQueuedByDepartmentRanked(dept);
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

function isUniqueViolation(error: unknown): boolean {
  const value = error as { code?: unknown; message?: unknown } | null;
  const code = String(value?.code || '');
  const message = String(value?.message || error || '');
  return code === '23505' || /unique constraint|duplicate key|already exists/i.test(message);
}

export const queueService = new QueueService();
