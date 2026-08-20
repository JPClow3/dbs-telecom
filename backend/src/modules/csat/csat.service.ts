import { DepartmentType } from '../ai/ai.service.js';

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
  private feedbacks: CSATFeedback[] = [];

  constructor() {
    // Carrega alguns feedbacks iniciais representativos para dashboards/estatísticas
    this.feedbacks = [
      {
        id: 'csat-init-1',
        clientId: '2270',
        clientName: 'Emanuel da Silva',
        rating: 5,
        comment: 'Atendimento muito rápido! Consegui a 2ª via da fatura em segundos.',
        tags: ['⚡ Rápido e Prático', '💳 Segunda Via Instantânea'],
        department: 'FINANCEIRO',
        context: 'FINANCIAL',
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
      {
        id: 'csat-init-2',
        clientId: '2270',
        clientName: 'Emanuel da Silva',
        rating: 5,
        comment: 'O diagnóstico guiado resolveu o problema da minha internet sem precisar de técnico!',
        tags: ['🛠️ Resolveu Meu Problema', '💡 Muito Claro'],
        department: 'SUPORTE',
        context: 'DIAGNOSTIC',
        targetProtocol: 'DBS-781920',
        createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      },
      {
        id: 'csat-init-3',
        clientId: '2271',
        clientName: 'Ana Clara Souza',
        rating: 4,
        comment: 'Contratação do plano Wi-Fi 6 foi super transparente.',
        tags: ['🚀 Excelente Oferta', '📶 Wi-Fi 6'],
        department: 'COMERCIAL',
        context: 'HIRING',
        createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
      },
    ];
  }

  /**
   * Registra uma avaliação de satisfação do cliente
   */
  submitFeedback(params: {
    clientId: string;
    clientName?: string;
    sessionId?: string;
    rating: number;
    comment?: string;
    tags?: string[];
    department?: DepartmentType;
    context?: 'DIAGNOSTIC' | 'HIRING' | 'FINANCIAL' | 'GENERAL';
    targetProtocol?: string;
  }): CSATFeedback {
    const rating = Math.min(5, Math.max(1, Math.round(params.rating)));
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

    this.feedbacks.unshift(feedback);
    if (this.feedbacks.length > 500) {
      this.feedbacks.pop();
    }

    return feedback;
  }

  /**
   * Obtém os feedbacks registrados de um cliente
   */
  getFeedbackByClientId(clientId: string): CSATFeedback[] {
    return this.feedbacks.filter((f) => f.clientId === clientId);
  }

  /**
   * Consolida métricas CSAT e NPS (Net Promoter Score)
   */
  getStats(): CSATStats {
    const total = this.feedbacks.length;
    if (total === 0) {
      return {
        totalResponses: 0,
        averageRating: 5.0,
        npsScore: 100,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        promotersCount: 0,
        passivesCount: 0,
        detractorsCount: 0,
        commonTags: [],
      };
    }

    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    let promoters = 0;
    let passives = 0;
    let detractors = 0;
    const tagCountMap: Map<string, number> = new Map();

    for (const f of this.feedbacks) {
      distribution[f.rating] = (distribution[f.rating] || 0) + 1;
      sum += f.rating;

      if (f.rating >= 4) {
        promoters += 1;
      } else if (f.rating === 3) {
        passives += 1;
      } else {
        detractors += 1;
      }

      if (f.tags) {
        for (const tag of f.tags) {
          tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
        }
      }
    }

    const averageRating = parseFloat((sum / total).toFixed(2));
    const npsScore = Math.round(((promoters - detractors) / total) * 100);

    const commonTags = Array.from(tagCountMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      totalResponses: total,
      averageRating,
      npsScore,
      ratingDistribution: distribution,
      promotersCount: promoters,
      passivesCount: passives,
      detractorsCount: detractors,
      commonTags,
    };
  }
}

export const csatService = new CSATService();
