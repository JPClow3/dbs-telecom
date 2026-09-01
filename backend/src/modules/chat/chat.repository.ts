import { getDatabase } from '../../database/db.js';
import { ChatMessage, ChatSession } from './chat.service.js';
import { DepartmentType } from '../ai/ai.service.js';
import crypto from 'node:crypto';

export type ChatIdempotencyClaim =
  | { claimed: true; ownerToken: string }
  | { claimed: false; pending: true }
  | { claimed: false; pending: false; response: ChatMessage };

export interface ChatIdempotencyRow {
  [key: string]: unknown;
  idempotency_key: string;
  session_id: string;
  client_id: string | null;
  client_message_id: string;
  owner_token: string;
  status: 'PENDING' | 'COMPLETED';
  response_json: string | null;
  created_at: string;
  updated_at: string;
}

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
    // Busca as mensagens mais recentes (DESC) e reordena em memória para
    // manter a ordem cronológica; sem isso, sessões longas devolviam apenas
    // as primeiras mensagens e perdiam o contexto recente.
    const rows = await getDatabase().prepare(`
      SELECT id, sender, text, timestamp, department, quick_options, ai_provider, ai_model, guardrail_applied, cards
      FROM chat_messages WHERE session_id = ? ORDER BY timestamp DESC LIMIT ?
    `).all<any>(sessionId, limit);
    return rows.reverse().map((row) => ({
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

  /**
   * Claims a client message durably. The partial state is leased so a crashed
   * worker cannot leave a message permanently blocked, while a fresh worker
   * still waits for an active worker before attempting any side effect.
   */
  async claimChatIdempotency(
    key: string,
    sessionId: string,
    clientId: string | undefined,
    clientMessageId: string,
    staleBefore: string,
  ): Promise<ChatIdempotencyClaim> {
    const db = getDatabase();
    const now = new Date().toISOString();
    const ownerToken = crypto.randomUUID();
    const inserted = await db.prepare(`
      INSERT INTO chat_idempotency
        (idempotency_key, session_id, client_id, client_message_id, owner_token, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?)
      ON CONFLICT(idempotency_key) DO NOTHING
    `).run(key, sessionId, clientId || null, clientMessageId, ownerToken, now, now);

    if (inserted.changes === 1) {
      return { claimed: true, ownerToken };
    }

    const row = await db.prepare(`
      SELECT idempotency_key, session_id, client_id, client_message_id, owner_token,
             status, response_json, created_at, updated_at
      FROM chat_idempotency WHERE idempotency_key = ?
    `).get<ChatIdempotencyRow>(key);

    if (!row) {
      // A failed worker may have released the row between INSERT and SELECT;
      // retrying the claim is safe and avoids treating that race as success.
      return this.claimChatIdempotency(key, sessionId, clientId, clientMessageId, staleBefore);
    }

    if (row.status === 'COMPLETED' && row.response_json) {
      return { claimed: false, pending: false, response: JSON.parse(row.response_json) as ChatMessage };
    }

    if (row.status === 'PENDING' && row.updated_at < staleBefore) {
      const takeover = await db.prepare(`
        UPDATE chat_idempotency
        SET owner_token = ?, updated_at = ?
        WHERE idempotency_key = ? AND status = 'PENDING' AND updated_at < ?
      `).run(ownerToken, now, key, staleBefore);
      if (takeover.changes === 1) {
        return { claimed: true, ownerToken };
      }
    }

    return { claimed: false, pending: true };
  }

  async getChatIdempotency(key: string): Promise<ChatIdempotencyRow | undefined> {
    return getDatabase().prepare(`
      SELECT idempotency_key, session_id, client_id, client_message_id, owner_token,
             status, response_json, created_at, updated_at
      FROM chat_idempotency WHERE idempotency_key = ?
    `).get<ChatIdempotencyRow>(key);
  }

  async completeChatIdempotency(key: string, ownerToken: string, response: ChatMessage): Promise<boolean> {
    const result = await getDatabase().prepare(`
      UPDATE chat_idempotency
      SET status = 'COMPLETED', response_json = ?, updated_at = ?
      WHERE idempotency_key = ? AND owner_token = ? AND status = 'PENDING'
    `).run(JSON.stringify(response), new Date().toISOString(), key, ownerToken);
    return result.changes === 1;
  }

  async releaseChatIdempotency(key: string, ownerToken: string): Promise<void> {
    await getDatabase().prepare(`
      DELETE FROM chat_idempotency
      WHERE idempotency_key = ? AND owner_token = ? AND status = 'PENDING'
    `).run(key, ownerToken);
  }

  async clearAll(): Promise<void> {
    await getDatabase().transaction([
      { text: 'DELETE FROM chat_messages' },
      { text: 'DELETE FROM chat_sessions' },
      { text: 'DELETE FROM chat_idempotency' },
    ]);
  }
}

function parseJson<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined;
  try { return JSON.parse(value) as T; } catch { return undefined; }
}

export const chatRepository = new ChatRepository();
