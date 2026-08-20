import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/database/db.js';
import { queueService } from '../src/modules/queue/queue.service.js';
import { queueRepository } from '../src/modules/queue/queue.repository.js';
import { csatService } from '../src/modules/csat/csat.service.js';
import { csatRepository } from '../src/modules/csat/csat.repository.js';
import { supportService } from '../src/modules/support/support.service.js';
import { supportRepository } from '../src/modules/support/support.repository.js';

describe('💾 Suite de Persistência PostgreSQL: Fila Virtual, CSAT e Suporte', () => {
  beforeEach(async () => {
    await queueRepository.clearAll();
    await csatRepository.clearAll();
    await supportRepository.clearAll();
  });

  describe('👤 1. Fila Virtual de Atendimento (queue_entries)', () => {
    it('deve persistir a entrada na fila no PostgreSQL e consultar com sucesso', async () => {
      const entry = await queueService.joinQueue({
        sessionId: 'session-persist-01',
        clientId: '2270',
        clientName: 'Emanuel da Silva',
        department: 'COMERCIAL',
        reason: 'Quero assinar Wi-Fi 6',
      });

      expect(entry.queueId).toBeDefined();
      expect(entry.status).toBe('QUEUED');
      expect(entry.position).toBe(1);

      // Consulta direta via repositório no banco
      const fromDb = await queueRepository.getByClientOrSession('2270');
      expect(fromDb).toBeDefined();
      expect(fromDb?.queueId).toBe(entry.queueId);
      expect(fromDb?.clientName).toBe('Emanuel da Silva');
      expect(fromDb?.department).toBe('COMERCIAL');
    });

    it('deve avançar o status da fila e persistir as transições até COMPLETED', async () => {
      await queueService.joinQueue({
        sessionId: 'session-persist-02',
        clientId: '2271',
        clientName: 'Cliente Teste 2',
        department: 'SUPORTE',
      });

      // Avança para ASSIGNED
      const assigned = await queueService.advanceQueue('2271');
      expect(assigned?.status).toBe('ASSIGNED');
      expect(assigned?.assignedAgent).toBeDefined();

      let inDb = await queueRepository.getByClientOrSession('2271');
      expect(inDb?.status).toBe('ASSIGNED');
      expect(inDb?.assignedAgent?.name).toBeDefined();

      // Avança para IN_SERVICE
      const inService = await queueService.advanceQueue('2271');
      expect(inService?.status).toBe('IN_SERVICE');

      // Avança para COMPLETED
      const completed = await queueService.advanceQueue('2271');
      expect(completed?.status).toBe('COMPLETED');
      expect(completed?.completedAt).toBeDefined();

      inDb = await queueRepository.getByClientOrSession('2271');
      expect(inDb?.status).toBe('COMPLETED');
    });

    it('deve permitir que o cliente saia da fila com status CANCELLED persistido', async () => {
      await queueService.joinQueue({
        sessionId: 'session-persist-03',
        clientId: '2272',
        clientName: 'Cliente Cancelamento',
        department: 'FINANCEIRO',
      });

      const leaveRes = await queueService.leaveQueue('2272');
      expect(leaveRes.success).toBe(true);

      const inDb = await queueRepository.getByClientOrSession('2272');
      expect(inDb?.status).toBe('CANCELLED');
    });
  });

  describe('⭐ 2. Avaliações CSAT / NPS (csat_feedbacks)', () => {
    it('deve persistir avaliação CSAT no PostgreSQL e calcular estatísticas agregadas', async () => {
      const feedback = await csatService.submitFeedback({
        clientId: '2270',
        clientName: 'Emanuel da Silva',
        rating: 5,
        comment: 'Excelente atendimento!',
        tags: ['⚡ Rápido', '📶 Wi-Fi 6'],
        department: 'COMERCIAL',
        context: 'HIRING',
      });

      expect(feedback.id).toBeDefined();
      expect(feedback.rating).toBe(5);

      const clientFeedbacks = await csatService.getFeedbackByClientId('2270');
      expect(clientFeedbacks.length).toBeGreaterThanOrEqual(1);
      expect(clientFeedbacks[0].comment).toBe('Excelente atendimento!');
      expect(clientFeedbacks[0].tags).toContain('📶 Wi-Fi 6');

      const stats = await csatService.getStats();
      expect(stats.totalResponses).toBeGreaterThanOrEqual(1);
      expect(stats.averageRating).toBeGreaterThanOrEqual(4);
      expect(stats.npsScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('🛠️ 3. Diagnóstico Guiado de Suporte (support_diagnostics & user_tickets)', () => {
    it('deve salvar e avançar as etapas do diagnóstico persistidas no SQLite', async () => {
      // Inicia diagnóstico
      const step1 = await supportService.startDiagnostic('2270');
      expect(step1.step).toBe('STEP_1_DEVICES');

      let savedState = await supportService.getState('2270');
      expect(savedState).toBeDefined();
      expect(savedState?.step).toBe('STEP_1_DEVICES');

      // Avança para etapa 2
      const step2 = await supportService.processDiagnosticStep('2270', 'Em todos os aparelhos');
      expect(step2.step).toBe('STEP_2_CABLES');

      savedState = await supportService.getState('2270');
      expect(savedState?.step).toBe('STEP_2_CABLES');
      expect(savedState?.multipleDevices).toBe(true);

      // Avança para etapa 3
      const step3 = await supportService.processDiagnosticStep('2270', 'Luzes normais');
      expect(step3.step).toBe('STEP_3_RESTART');

      savedState = await supportService.getState('2270');
      expect(savedState?.step).toBe('STEP_3_RESTART');
      expect(savedState?.cablesChecked).toBe(true);

      // Finaliza com sucesso (RESOLVED)
      const resolved = await supportService.processDiagnosticStep('2270', 'Sim, normalizou!');
      expect(resolved.step).toBe('RESOLVED');

      savedState = await supportService.getState('2270');
      expect(savedState).toBeUndefined(); // Limpa estado resolvido
    });

    it('deve persistir chamado técnico local em caso de escalonamento', async () => {
      await supportService.startDiagnostic('2270');
      await supportService.processDiagnosticStep('2270', 'todos aparelhos');
      await supportService.processDiagnosticStep('2270', 'cabos ok');
      const escalated = await supportService.processDiagnosticStep('2270', 'Não, ainda continua com lentidão');

      expect(escalated.step).toBe('ESCALATED');
      expect(escalated.protocolo).toBeDefined();

      const tickets = await supportService.getClientTickets('2270');
      expect(tickets.length).toBeGreaterThanOrEqual(1);
      const matched = tickets.find((t) => t.protocolo === escalated.protocolo);
      expect(matched).toBeDefined();
      expect(matched?.statusLabel).toBeDefined();
    });
  });
});
