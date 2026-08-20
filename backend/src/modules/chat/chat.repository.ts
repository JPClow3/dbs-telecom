import { getDatabase } from '../../database/db.js';
import { ChatMessage, ChatSession } from './chat.service.js';
import { DepartmentType } from '../ai/ai.service.js';

export class ChatRepository {
  /**
   * Obtém uma sessão do banco SQLite ou cria uma nova persistida
   */
  getOrCreateSession(sessionId: string, clientId?: string, clientName?: string): ChatSession {
    const db = getDatabase();

    const row = db.prepare(`
      SELECT session_id, client_id, client_name, current_department, created_at, updated_at
      FROM chat_sessions
      WHERE session_id = ?
    `).get(sessionId) as {
      session_id: string;
      client_id: string | null;
      client_name: string | null;
      current_department: string;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (row) {
      // Se tiver novos dados de cliente, atualiza
      let shouldUpdate = false;
      let newClientId = row.client_id || clientId;
      let newClientName = row.client_name || clientName;

      if (clientId && !row.client_id) {
        newClientId = clientId;
        shouldUpdate = true;
      }
      if (clientName && !row.client_name) {
        newClientName = clientName;
        shouldUpdate = true;
      }

      if (shouldUpdate) {
        db.prepare(`
          UPDATE chat_sessions
          SET client_id = ?, client_name = ?, updated_at = ?
          WHERE session_id = ?
        `).run(newClientId, newClientName, new Date().toISOString(), sessionId);
      }

      const history = this.getSessionHistory(sessionId, 50);

      return {
        sessionId: row.session_id,
        clientId: (newClientId || undefined) as string | undefined,
        clientName: (newClientName || undefined) as string | undefined,
        currentDepartment: row.current_department as DepartmentType,
        history,
        createdAt: row.created_at,
      };
    }

    // Cria nova sessão persistida no SQLite
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO chat_sessions (session_id, client_id, client_name, current_department, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, clientId || null, clientName || (clientId ? 'Cliente' : null), 'GERAL', now, now);

    return {
      sessionId,
      clientId,
      clientName: clientName || (clientId ? 'Cliente' : undefined),
      currentDepartment: 'GERAL',
      history: [],
      createdAt: now,
    };
  }

  /**
   * Atualiza os dados de uma sessão existente (ex: departamento)
   */
  updateSession(session: ChatSession): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE chat_sessions
      SET client_id = ?, client_name = ?, current_department = ?, updated_at = ?
      WHERE session_id = ?
    `).run(
      session.clientId || null,
      session.clientName || null,
      session.currentDepartment,
      now,
      session.sessionId
    );
  }

  /**
   * Salva uma mensagem no histórico persistido da sessão
   */
  addMessage(sessionId: string, msg: ChatMessage): void {
    const db = getDatabase();
    const now = new Date().toISOString();

    const insertMsg = db.prepare(`
      INSERT OR REPLACE INTO chat_messages (
        id, session_id, sender, text, timestamp, department,
        quick_options, ai_provider, ai_model, guardrail_applied, cards
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertMsg.run(
      msg.id,
      sessionId,
      msg.sender,
      msg.text,
      msg.timestamp || now,
      msg.department || null,
      msg.quickOptions ? JSON.stringify(msg.quickOptions) : null,
      msg.aiProvider || null,
      msg.aiModel || null,
      msg.guardrailApplied ? 1 : 0,
      msg.cards ? JSON.stringify(msg.cards) : null
    );

    // Atualiza o timestamp de atividade da sessão
    db.prepare(`
      UPDATE chat_sessions SET updated_at = ? WHERE session_id = ?
    `).run(now, sessionId);
  }

  /**
   * Recupera o histórico de mensagens persistidas de uma sessão
   */
  getSessionHistory(sessionId: string, limit: number = 50): ChatMessage[] {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT id, sender, text, timestamp, department, quick_options, ai_provider, ai_model, guardrail_applied, cards
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `).all(sessionId, limit) as Array<{
      id: string;
      sender: 'USER' | 'BOT' | 'SYSTEM';
      text: string;
      timestamp: string;
      department: string | null;
      quick_options: string | null;
      ai_provider: string | null;
      ai_model: string | null;
      guardrail_applied: number;
      cards: string | null;
    }>;

    return rows.map((r) => {
      let quickOptions: string[] | undefined;
      let cards: ChatMessage['cards'];

      if (r.quick_options) {
        try {
          quickOptions = JSON.parse(r.quick_options);
        } catch {}
      }

      if (r.cards) {
        try {
          cards = JSON.parse(r.cards);
        } catch {}
      }

      return {
        id: r.id,
        sender: r.sender,
        text: r.text,
        timestamp: r.timestamp,
        department: (r.department as DepartmentType) || undefined,
        quickOptions,
        aiProvider: r.ai_provider || undefined,
        aiModel: r.ai_model || undefined,
        guardrailApplied: r.guardrail_applied === 1,
        cards,
      };
    });
  }

  /**
   * Lista todas as sessões de um determinado cliente
   */
  listSessionsByClient(clientId: string): ChatSession[] {
    const db = getDatabase();

    const rows = db.prepare(`
      SELECT session_id, client_id, client_name, current_department, created_at, updated_at
      FROM chat_sessions
      WHERE client_id = ?
      ORDER BY updated_at DESC
    `).all(clientId) as Array<{
      session_id: string;
      client_id: string | null;
      client_name: string | null;
      current_department: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((r) => ({
      sessionId: r.session_id,
      clientId: (r.client_id || undefined) as string | undefined,
      clientName: (r.client_name || undefined) as string | undefined,
      currentDepartment: r.current_department as DepartmentType,
      history: this.getSessionHistory(r.session_id, 20),
      createdAt: r.created_at,
    }));
  }

  /**
   * Remove uma sessão e todas as suas mensagens do banco
   */
  deleteSession(sessionId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM chat_sessions WHERE session_id = ?').run(sessionId);
  }

  /**
   * Limpa todo o histórico (útil para testes)
   */
  clearAll(): void {
    const db = getDatabase();
    db.prepare('DELETE FROM chat_messages').run();
    db.prepare('DELETE FROM chat_sessions').run();
  }
}

export const chatRepository = new ChatRepository();
