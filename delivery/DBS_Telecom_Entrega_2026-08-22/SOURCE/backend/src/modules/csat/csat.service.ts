import { DepartmentType } from '../ai/ai.service.js';
import { csatRepository } from './csat.repository.js';

export interface CSATFeedback {
  id: string;
  clientId: string;
  clientName?: string;
  sessionId?: string;
  rating: number; // 1 a 5 estrelas
  comment?: string;
  tags?: string[];
  department?: DepartmentType;
  context: 'DIAGNOSTIC' | 'HIRING' | 'FINANCIAL' | 'GENERAL';
  targetProtocol?: string;
  createdAt: string;
}

export interface CSATStats {
  totalResponses: number;
  averageRating: number;
  npsScore: number; // % Promotores (4-5) - % Detratores (1-2)
  ratingDistribution: Record<number, number>;
  promotersCount: number;
  passivesCount: number;
  detractorsCount: number;
  commonTags: Array<{ tag: string; count: number }>;
}

export class CSATService {
  /**
   * Registra uma avaliação de satisfação do cliente no SQLite
   */
  async submitFeedback(params: {
    clientId: string;
    clientName?: string;
    sessionId?: string;
    rating: number;
    comment?: string;
    tags?: string[];
    department?: DepartmentType;
    context?: 'DIAGNOSTIC' | 'HIRING' | 'FINANCIAL' | 'GENERAL';
    targetProtocol?: string;
  }): Promise<CSATFeedback> {
    // Defesa em profundidade: rejeita notas inválidas de chamadas não-HTTP
    // (o clamp antigo convertia NaN em NaN e valores fora da faixa em 1 ou 5).
    if (!Number.isInteger(params.rating) || params.rating < 1 || params.rating > 5) {
      throw new Error('rating deve ser um inteiro entre 1 e 5.');
    }
    const rating = params.rating;
    const feedback: CSATFeedback = {
      id: `csat-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      clientId: params.clientId,
      clientName: params.clientName,
      sessionId: params.sessionId,
      rating,
      comment: params.comment?.trim(),
      tags: params.tags || [],
      department: params.department || 'GERAL',
      context: params.context || 'GENERAL',
      targetProtocol: params.targetProtocol,
      createdAt: new Date().toISOString(),
    };

    await csatRepository.addFeedback(feedback);
    return feedback;
  }

  /**
   * Obtém os feedbacks registrados de um cliente via SQLite
   */
  async getFeedbackByClientId(clientId: string): Promise<CSATFeedback[]> {
    return await csatRepository.getByClientId(clientId);
  }

  /**
   * Histórico de feedbacks paginado de um cliente (fatiado após a consulta,
   * mantendo o repositório sem limite e o total fiel ao volume completo).
   */
  async getFeedbackByClientIdPaginated(
    clientId: string,
    page = 1,
    limit = 20
  ): Promise<{ feedbacks: CSATFeedback[]; total: number; page: number; limit: number }> {
    const all = await csatRepository.getByClientId(clientId);
    const start = (page - 1) * limit;
    return { feedbacks: all.slice(start, start + limit), total: all.length, page, limit };
  }

  /**
   * Consolida métricas CSAT e NPS (Net Promoter Score) via SQLite
   */
  async getStats(): Promise<CSATStats> {
    return await csatRepository.getStats();
  }
}

export const csatService = new CSATService();
