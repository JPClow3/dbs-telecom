import { describe, it, expect, beforeEach } from 'vitest';
import { queueService } from '../src/modules/queue/queue.service.js';
import { csatService } from '../src/modules/csat/csat.service.js';
import { fastRouterService } from '../src/modules/ai/fast-router.service.js';
import { chatService } from '../src/modules/chat/chat.service.js';
import { app } from '../src/app.js';

describe('🚀 Novas Features DBS Telecom: Streaming SSE, Áudio, CSAT & Fila Virtual', () => {
  const testClientId = '2270';

  // --- 1. FILA VIRTUAL & TRANSBORDO HUMANO ---
  describe('👤 Máquina de Estados da Fila Virtual (QueueService)', () => {
    it('deve adicionar cliente à fila com posição e tempo estimado calculados', () => {
      const entry = queueService.joinQueue({
        sessionId: 'sess-test-1',
        clientId: 'test-client-1',
        clientName: 'Carlos Eduardo',
        department: 'SUPORTE',
        reason: 'Problema complexo de atenuação de fibra',
      });

      expect(entry).toBeDefined();
      expect(entry.status).toBe('QUEUED');
      expect(entry.position).toBeGreaterThanOrEqual(1);
      expect(entry.estimatedWaitMinutes).toBeGreaterThanOrEqual(2);
      expect(entry.department).toBe('SUPORTE');
    });

    it('deve consultar o status em tempo real da fila', () => {
      const status = queueService.getQueueStatus('test-client-1');
      expect(status.inQueue).toBe(true);
      expect(status.entry?.clientId).toBe('test-client-1');
      expect(status.totalInQueue).toBeGreaterThanOrEqual(1);
    });

    it('deve avançar a fila e alocar um especialista quando a posição for alcançada', () => {
      // Avança até ser atribuído
      let entry = queueService.advanceQueue('test-client-1');
      if (entry?.status === 'QUEUED') {
        entry = queueService.advanceQueue('test-client-1');
      }

      expect(entry?.status).toBe('ASSIGNED');
      expect(entry?.assignedAgent).toBeDefined();
      expect(entry?.assignedAgent?.name).toBeTruthy();
    });

    it('deve permitir cancelar ou sair da fila', () => {
      const leaveResult = queueService.leaveQueue('test-client-1');
      expect(leaveResult.success).toBe(true);

      const status = queueService.getQueueStatus('test-client-1');
      expect(status.inQueue).toBe(false);
    });

    it('deve detectar deterministamente a intenção de transbordo no Fast Router', () => {
      const phrases = [
        'quero falar com um atendente humano',
        'falar com atendente',
        'transferir para atendente',
        'preciso de uma pessoa real',
        'atendente por favor',
      ];

      for (const phrase of phrases) {
        const match = fastRouterService.matchFastIntent(phrase, 'Emanuel');
        expect(match).not.toBeNull();
        expect(match?.intent).toBe('TRANSBORDO_HUMANO');
      }
    });
  });

  // --- 2. PESQUISA DE SATISFAÇÃO (CSAT / NPS) ---
  describe('⭐ Pesquisa de Satisfação CSAT & NPS (CSATService)', () => {
    it('deve registrar avaliação com notas, tags e comentários', () => {
      const feedback = csatService.submitFeedback({
        clientId: testClientId,
        clientName: 'Emanuel da Silva',
        rating: 5,
        comment: 'Atendimento muito ágil e eficiente!',
        tags: ['⚡ Rápido e Prático', '🛠️ Resolveu Meu Problema'],
        department: 'SUPORTE',
        context: 'DIAGNOSTIC',
        targetProtocol: 'DBS-998877',
      });

      expect(feedback).toBeDefined();
      expect(feedback.id).toContain('csat-');
      expect(feedback.rating).toBe(5);
      expect(feedback.tags).toContain('⚡ Rápido e Prático');
      expect(feedback.targetProtocol).toBe('DBS-998877');
    });

    it('deve consolidar métricas de CSAT, NPS e distribuição de estrelas', () => {
      const stats = csatService.getStats();

      expect(stats.totalResponses).toBeGreaterThanOrEqual(1);
      expect(stats.averageRating).toBeGreaterThanOrEqual(1);
      expect(stats.averageRating).toBeLessThanOrEqual(5);
      expect(stats.npsScore).toBeGreaterThanOrEqual(-100);
      expect(stats.npsScore).toBeLessThanOrEqual(100);
      expect(stats.ratingDistribution[5]).toBeGreaterThanOrEqual(1);
    });

    it('deve consultar histórico de avaliações do cliente', () => {
      const feedbacks = csatService.getFeedbackByClientId(testClientId);
      expect(feedbacks.length).toBeGreaterThanOrEqual(1);
      expect(feedbacks[0].clientId).toBe(testClientId);
    });
  });

  // --- 3. STREAMING DE RESPOSTAS (SSE) ---
  describe('⚡ Streaming de Respostas SSE (ChatService)', () => {
    it('deve processar mensagem em chunks de streaming chamando o callback onChunk', async () => {
      const chunks: string[] = [];
      const botMessage = await chatService.processStreamMessage(
        'session-stream-test',
        'Olá, preciso de ajuda',
        testClientId,
        (chunk) => {
          chunks.push(chunk);
        }
      );

      expect(botMessage).toBeDefined();
      expect(botMessage.sender).toBe('BOT');
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBe(botMessage.text);
    });
  });

  // --- 4. ATENDIMENTO POR ÁUDIO / VOZ MULTIMODAL ---
  describe('🎙️ Atendimento por Áudio / Mensagens de Voz (ChatService)', () => {
    it('deve processar mensagem de áudio, gerar transcrição e responder adequadamente', async () => {
      const dummyAudioBase64 = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
      const result = await chatService.processAudioMessage(
        'session-audio-test',
        dummyAudioBase64,
        'audio/wav',
        testClientId
      );

      expect(result).toBeDefined();
      expect(result.transcript).toBeTruthy();
      expect(result.userMessage.cards?.type).toBe('AUDIO');
      expect(result.userMessage.cards?.audio?.transcript).toBe(result.transcript);
      expect(result.botMessage.sender).toBe('BOT');
    });
  });

  // --- 5. INJEÇÃO DE CARDS CONTEXTUAIS (CSAT, FILA, FATURAS) ---
  describe('🃏 Injeção Automática de Cards Interativos', () => {
    it('deve gerar card de Fila Virtual quando o cliente solicitar falar com atendente', async () => {
      const response = await chatService.processMessage(
        'session-queue-test',
        'Gostaria de falar com um atendente humano',
        testClientId
      );

      expect(response.cards?.type).toBe('QUEUE');
      expect(response.cards?.queue).toBeDefined();
      expect(response.cards?.queue?.status).toBe('QUEUED');
    });

    it('deve gerar card CSAT ao confirmar contratação comercial', async () => {
      const response = await chatService.processMessage(
        'session-hire-test',
        'Confirmar contratação do plano DBS 500MB',
        testClientId
      );

      expect(response.cards?.type).toBe('CSAT');
      expect(response.cards?.csat).toBeDefined();
      expect(response.cards?.csat?.context).toBe('HIRING');
    });
  });
});
