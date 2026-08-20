import { getDatabase } from '../../database/db.js';
import { CSATFeedback, CSATStats } from './csat.service.js';
import { DepartmentType } from '../ai/ai.service.js';

export class CSATRepository {
  async addFeedback(feedback: CSATFeedback): Promise<void> {
    await getDatabase().prepare(`
      INSERT INTO csat_feedbacks (id, client_id, client_name, session_id, rating, comment, tags, department, context, target_protocol, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(feedback.id, feedback.clientId, feedback.clientName || null, feedback.sessionId || null,
      feedback.rating, feedback.comment || null, feedback.tags ? JSON.stringify(feedback.tags) : null,
      feedback.department || 'GERAL', feedback.context || 'GENERAL', feedback.targetProtocol || null, feedback.createdAt);
  }

  async getByClientId(clientId: string): Promise<CSATFeedback[]> {
    const rows = await getDatabase().prepare(`
      SELECT id, client_id, client_name, session_id, rating, comment, tags, department, context, target_protocol, created_at
      FROM csat_feedbacks WHERE client_id = ? ORDER BY created_at DESC
    `).all<any>(clientId);
    return rows.map((row) => this.mapRow(row));
  }

  async getAll(limit = 500): Promise<CSATFeedback[]> {
    const rows = await getDatabase().prepare(`
      SELECT id, client_id, client_name, session_id, rating, comment, tags, department, context, target_protocol, created_at
      FROM csat_feedbacks ORDER BY created_at DESC LIMIT ?
    `).all<any>(limit);
    return rows.map((row) => this.mapRow(row));
  }

  async getStats(): Promise<CSATStats> {
    await this.seedInitialIfEmpty();
    const feedbacks = await this.getAll(1000);
    if (feedbacks.length === 0) {
      return { totalResponses: 0, averageRating: 5, npsScore: 100, ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, promotersCount: 0, passivesCount: 0, detractorsCount: 0, commonTags: [] };
    }

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    const tagCount = new Map<string, number>();
    for (const feedback of feedbacks) {
      distribution[feedback.rating] = (distribution[feedback.rating] || 0) + 1;
      sum += feedback.rating;
      if (feedback.rating >= 4) promoters += 1;
      else if (feedback.rating === 3) passives += 1;
      else detractors += 1;
      feedback.tags?.forEach((tag) => tagCount.set(tag, (tagCount.get(tag) || 0) + 1));
    }
    return {
      totalResponses: feedbacks.length,
      averageRating: parseFloat((sum / feedbacks.length).toFixed(2)),
      npsScore: Math.round(((promoters - detractors) / feedbacks.length) * 100),
      ratingDistribution: distribution,
      promotersCount: promoters,
      passivesCount: passives,
      detractorsCount: detractors,
      commonTags: [...tagCount.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    };
  }

  async seedInitialIfEmpty(): Promise<void> {
    const row = await getDatabase().prepare('SELECT COUNT(*) AS count FROM csat_feedbacks').get<any>();
    if (Number(row?.count || 0) > 0) return;
    const now = Date.now();
    await Promise.all([
      { id: 'csat-init-1', clientId: '2270', clientName: 'Emanuel da Silva', rating: 5, comment: 'Atendimento muito rápido! Consegui a 2ª via da fatura em segundos.', tags: ['⚡ Rápido e Prático', '💳 Segunda Via Instantânea'], department: 'FINANCEIRO', context: 'FINANCIAL', createdAt: new Date(now - 86400000).toISOString() },
      { id: 'csat-init-2', clientId: '2270', clientName: 'Emanuel da Silva', rating: 5, comment: 'O diagnóstico guiado resolveu o problema da minha internet sem precisar de técnico!', tags: ['🛠️ Resolveu Meu Problema', '💡 Muito Claro'], department: 'SUPORTE', context: 'DIAGNOSTIC', targetProtocol: 'DBS-781920', createdAt: new Date(now - 43200000).toISOString() },
      { id: 'csat-init-3', clientId: '2271', clientName: 'Ana Clara Souza', rating: 4, comment: 'Contratação do plano Wi-Fi 6 foi super transparente.', tags: ['🚀 Excelente Oferta', '📶 Wi-Fi 6'], department: 'COMERCIAL', context: 'HIRING', createdAt: new Date(now - 21600000).toISOString() },
    ].map((feedback) => this.addFeedback(feedback as CSATFeedback)));
  }

  async clearAll(): Promise<void> {
    await getDatabase().prepare('DELETE FROM csat_feedbacks').run();
  }

  private mapRow(row: any): CSATFeedback {
    let tags: string[] | undefined;
    try { tags = row.tags ? JSON.parse(row.tags) : undefined; } catch { tags = undefined; }
    return { id: row.id, clientId: row.client_id, clientName: row.client_name || undefined, sessionId: row.session_id || undefined,
      rating: Number(row.rating), comment: row.comment || undefined, tags, department: (row.department as DepartmentType) || 'GERAL',
      context: row.context as CSATFeedback['context'], targetProtocol: row.target_protocol || undefined, createdAt: row.created_at };
  }
}

export const csatRepository = new CSATRepository();
