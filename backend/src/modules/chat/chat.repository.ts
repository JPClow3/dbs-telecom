import { getDatabase } from '../../database/db.js';
import { ChatMessage, ChatSession } from './chat.service.js';
import { DepartmentType } from '../ai/ai.service.js';

export class ChatRepository {
  async getOrCreateSession(sessionId: string, clientId?: string, clientName?: string): Promise<ChatSession> {
    const db = getDatabase();
    const row = await db.prepare(`
      SELECT session_id, client_id, client_name, current_department, created_at, updated_at
      FROM chat_sessions WHERE session_id = ?
    `).get<any>(sessionId);

    if (row) {
      const newClientId = row.client_id || clientId;
      const newClientName = row.client_name || clientName;
      if ((clientId && !row.client_id) || (clientName && !row.client_name)) {
        await db.prepare(`UPDATE chat_sessions SET client_id = ?, client_name = ?, updated_at = ? WHERE session_id = ?`)
          .run(newClientId || null, newClientName || null, new Date().toISOString(), sessionId);
      }
      return {
        sessionId: row.session_id, clientId: newClientId || undefined, clientName: newClientName || undefined,
        currentDepartment: row.current_department as DepartmentType,
        history: await this.getSessionHistory(sessionId, 50), createdAt: row.created_at,
      };
    }

    const now = new Date().toISOString();
    await db.prepare(`
      INSERT INTO chat_sessions (session_id, client_id, client_name, current_department, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, clientId || null, clientName || (clientId ? 'Cliente' : null), 'GERAL', now, now);
    return { sessionId, clientId, clientName: clientName || (clientId ? 'Cliente' : undefined), currentDepartment: 'GERAL', history: [], createdAt: now };
  }

  async getSessionOwner(sessionId: string): Promise<string | null | undefined> {
    const row = await getDatabase().prepare(`SELECT client_id FROM chat_sessions WHERE session_id = ?`).get<any>(sessionId);
    return row ? row.client_id : undefined;
  }

  async updateSession(session: ChatSession): Promise<void> {
    await getDatabase().prepare(`
      UPDATE chat_sessions SET client_id = ?, client_name = ?, current_department = ?, updated_at = ? WHERE session_id = ?
    `).run(session.clientId || null, session.clientName || null, session.currentDepartment, new Date().toISOString(), session.sessionId);
  }

  async addMessage(sessionId: string, msg: ChatMessage): Promise<void> {
    const now = new Date().toISOString();
    const db = getDatabase();
    await db.prepare(`
      INSERT INTO chat_messages (id, session_id, sender, text, timestamp, department, quick_options, ai_provider, ai_model, guardrail_applied, cards)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id, sender = excluded.sender, text = excluded.text, timestamp = excluded.timestamp,
        department = excluded.department, quick_options = excluded.quick_options, ai_provider = excluded.ai_provider,
        ai_model = excluded.ai_model, guardrail_applied = excluded.guardrail_applied, cards = excluded.cards
    `).run(msg.id, sessionId, msg.sender, msg.text, msg.timestamp || now, msg.department || null,
      msg.quickOptions ? JSON.stringify(msg.quickOptions) : null, msg.aiProvider || null, msg.aiModel || null,
      msg.guardrailApplied ? 1 : 0, msg.cards ? JSON.stringify(msg.cards) : null);
    await db.prepare(`UPDATE chat_sessions SET updated_at = ? WHERE session_id = ?`).run(now, sessionId);
  }

  async getSessionHistory(sessionId: string, limit = 50): Promise<ChatMessage[]> {
    const rows = await getDatabase().prepare(`
      SELECT id, sender, text, timestamp, department, quick_options, ai_provider, ai_model, guardrail_applied, cards
      FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC LIMIT ?
    `).all<any>(sessionId, limit);
    return rows.map((row) => ({
      id: row.id, sender: row.sender, text: row.text, timestamp: row.timestamp,
      department: (row.department as DepartmentType) || undefined,
      quickOptions: parseJson<string[]>(row.quick_options), aiProvider: row.ai_provider || undefined,
      aiModel: row.ai_model || undefined, guardrailApplied: Number(row.guardrail_applied) === 1,
      cards: parseJson<ChatMessage['cards']>(row.cards),
    }));
  }

  async listSessionsByClient(clientId: string): Promise<ChatSession[]> {
    const rows = await getDatabase().prepare(`
      SELECT session_id, client_id, client_name, current_department, created_at FROM chat_sessions
      WHERE client_id = ? ORDER BY updated_at DESC
    `).all<any>(clientId);
    return Promise.all(rows.map(async (row) => ({
      sessionId: row.session_id, clientId: row.client_id || undefined, clientName: row.client_name || undefined,
      currentDepartment: row.current_department as DepartmentType,
      history: await this.getSessionHistory(row.session_id, 20), createdAt: row.created_at,
    })));
  }

  async deleteSession(sessionId: string): Promise<void> {
    await getDatabase().prepare('DELETE FROM chat_sessions WHERE session_id = ?').run(sessionId);
  }

  async clearAll(): Promise<void> {
    await getDatabase().transaction([{ text: 'DELETE FROM chat_messages' }, { text: 'DELETE FROM chat_sessions' }]);
  }
}

function parseJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value) as T; } catch { return undefined; }
}

export const chatRepository = new ChatRepository();
