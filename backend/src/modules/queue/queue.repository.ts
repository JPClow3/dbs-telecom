import { getDatabase } from '../../database/db.js';
import { QueueEntry, QueueStatus } from './queue.service.js';
import { DepartmentType } from '../ai/ai.service.js';

const entrySelect = `
  SELECT queue_id, session_id, client_id, client_name, department, reason, status, position,
         estimated_wait_minutes, joined_at, assigned_at, completed_at, assigned_agent
  FROM queue_entries`;

export class QueueRepository {
  async upsert(entry: QueueEntry): Promise<void> {
    await getDatabase().prepare(`
      INSERT INTO queue_entries (queue_id, session_id, client_id, client_name, department, reason, status, position, estimated_wait_minutes, joined_at, assigned_at, completed_at, assigned_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(queue_id) DO UPDATE SET
        session_id = excluded.session_id, client_id = excluded.client_id, client_name = excluded.client_name,
        department = excluded.department, reason = excluded.reason, status = excluded.status, position = excluded.position,
        estimated_wait_minutes = excluded.estimated_wait_minutes, joined_at = excluded.joined_at,
        assigned_at = excluded.assigned_at, completed_at = excluded.completed_at, assigned_agent = excluded.assigned_agent
    `).run(entry.queueId, entry.sessionId, entry.clientId, entry.clientName, entry.department, entry.reason || null,
      entry.status, entry.position, entry.estimatedWaitMinutes, entry.joinedAt, entry.assignedAt || null,
      entry.completedAt || null, entry.assignedAgent ? JSON.stringify(entry.assignedAgent) : null);
  }

  async getByClientOrSession(identifier: string): Promise<QueueEntry | undefined> {
    const row = await getDatabase().prepare(`${entrySelect} WHERE client_id = ? OR session_id = ? ORDER BY joined_at DESC LIMIT 1`).get<any>(identifier, identifier);
    return row ? this.mapRow(row) : undefined;
  }

  async getActiveEntries(): Promise<QueueEntry[]> {
    const rows = await getDatabase().prepare(`${entrySelect} WHERE status IN ('QUEUED', 'ASSIGNED', 'IN_SERVICE') ORDER BY joined_at ASC`).all<any>();
    return rows.map((row) => this.mapRow(row));
  }

  async getQueuedByDepartment(department: DepartmentType): Promise<QueueEntry[]> {
    const rows = await getDatabase().prepare(`${entrySelect} WHERE department = ? AND status = 'QUEUED' ORDER BY joined_at ASC`).all<any>(department);
    return rows.map((row) => this.mapRow(row));
  }

  async updateBatchPositions(entries: Array<{ queueId: string; position: number; estimatedWaitMinutes: number }>): Promise<void> {
    await getDatabase().transaction(entries.map((entry) => ({
      text: 'UPDATE queue_entries SET position = ?, estimated_wait_minutes = ? WHERE queue_id = ?',
      parameters: [entry.position, entry.estimatedWaitMinutes, entry.queueId],
    })));
  }

  async getAll(): Promise<QueueEntry[]> {
    const rows = await getDatabase().prepare(`${entrySelect} ORDER BY joined_at DESC`).all<any>();
    return rows.map((row) => this.mapRow(row));
  }

  async getStats(): Promise<{ totalActive: number; totalInService: number; totalCompleted: number; averageWaitMinutes: number }> {
    const stats = await getDatabase().prepare(`
      SELECT COUNT(CASE WHEN status = 'QUEUED' THEN 1 END) AS "totalActive",
             COUNT(CASE WHEN status IN ('ASSIGNED', 'IN_SERVICE') THEN 1 END) AS "totalInService",
             COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) AS "totalCompleted"
      FROM queue_entries
    `).get<any>();
    return { totalActive: Number(stats?.totalActive || 0), totalInService: Number(stats?.totalInService || 0), totalCompleted: Number(stats?.totalCompleted || 0), averageWaitMinutes: 2.5 };
  }

  async clearAll(): Promise<void> {
    await getDatabase().prepare('DELETE FROM queue_entries').run();
  }

  private mapRow(row: any): QueueEntry {
    let assignedAgent: QueueEntry['assignedAgent'];
    try { assignedAgent = row.assigned_agent ? JSON.parse(row.assigned_agent) : undefined; } catch { assignedAgent = undefined; }
    return { queueId: row.queue_id, sessionId: row.session_id, clientId: row.client_id, clientName: row.client_name,
      department: row.department as DepartmentType, reason: row.reason || undefined, status: row.status as QueueStatus,
      position: Number(row.position), estimatedWaitMinutes: Number(row.estimated_wait_minutes), joinedAt: row.joined_at,
      assignedAt: row.assigned_at || undefined, completedAt: row.completed_at || undefined, assignedAgent };
  }
}

export const queueRepository = new QueueRepository();
