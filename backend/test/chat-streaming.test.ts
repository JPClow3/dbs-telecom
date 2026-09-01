import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { jwtService } from '../src/modules/auth/jwt.service.js';
import { aiService } from '../src/modules/ai/ai.service.js';
import { ixcService } from '../src/modules/ixc/ixc.service.js';
import { ChatService, chatService, chatIdempotency } from '../src/modules/chat/chat.service.js';
import { chatRepository } from '../src/modules/chat/chat.repository.js';

const app = createApp();

function clientToken(clientId: string, name = 'Cliente Streaming'): string {
  return jwtService.generateToken({ clientId, cpfCnpj: '', name, role: 'client' });
}

interface SseEvent {
  event: string;
  data: any;
}

/** Parser SSE compatível com o consumidor do app mobile (mobile/src/services/api/chat.ts). */
function parseSseEvents(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      let event = 'message';
      let dataStr = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) {
          event = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          dataStr += line.slice(6);
        }
      }
      try {
        return { event, data: dataStr ? JSON.parse(dataStr) : null };
      } catch {
        return { event, data: null };
      }
    });
}

describe('⚡ Streaming honesto do chat: protocolo SSE, idempotência e abuso de custo', () => {
  const token = clientToken('2270');

  // Referências originais para restaurar após cada teste (estilo do repositório:
  // sem vi.mock; substituição direta de métodos nos singletons exportados).
  const realClassify = aiService.classifyMessage.bind(aiService);
  const realCreateTicket = (ixcService as any).createTicket.bind(ixcService);

  beforeEach(async () => {
    await chatRepository.clearAll();
    chatIdempotency.reset();
  });

  afterEach(() => {
    (aiService as any).classifyMessage = realClassify;
    (ixcService as any).createTicket = realCreateTicket;
  });

  it('deve entregar start → stage → chunk → done(status ok) sem delays artificiais e com chunks === texto final', async () => {
    const startedAt = Date.now();
    const res = await request(app)
      .post('/api/chat/message/stream')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Quero falar com um atendente humano', sessionId: 'stream-ok-1', clientId: '2270' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);

    const events = parseSseEvents(res.text);
    const names = events.map((e) => e.event);

    expect(names[0]).toBe('start');
    expect(names).toContain('stage');
    expect(names).toContain('chunk');
    expect(names[names.length - 1]).toBe('done');

    const done = events.find((e) => e.event === 'done');
    expect(done?.data?.status ?? 'ok').toBe('ok');
    expect(done?.data?.message?.sender).toBe('BOT');
    expect(done?.data?.message?.cards?.type).toBe('QUEUE');

    const chunkText = events
      .filter((e) => e.event === 'chunk')
      .map((e) => e.data.chunk)
      .join('');
    expect(chunkText).toBe(done.data.message.text);

    // Sem replay teatral: uma resposta curta não pode levar segundos só de delays.
    expect(Date.now() - startedAt).toBeLessThan(10000);
  });

  it('SEMPRE encerra o stream com done{status:"error", errorCode:"stream_interrompida"} quando o provedor explode', async () => {
    (aiService as any).classifyMessage = async () => {
      throw new Error('provedor de IA indisponível (simulado)');
    };

    const res = await request(app)
      .post('/api/chat/message/stream')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'olá', sessionId: 'stream-fail-1', clientId: '2270' });

    expect(res.status).toBe(200);
    const events = parseSseEvents(res.text);
    const last = events[events.length - 1];

    // Garantia de protocolo: evento TERMINAL done com status de erro — nunca
    // fica sem evento final (bolha vazia eterna) nem usa apenas 'event: error'.
    expect(last.event).toBe('done');
    expect(last.data.status).toBe('error');
    expect(last.data.errorCode).toBe('stream_interrompida');
    expect(typeof last.data.error).toBe('string');
    expect(res.text).not.toContain('event: error');
  });

  it('não deve criar segundo chamado quando o cliente reenvia o mesmo messageId após falha de stream (fallback síncrono)', async () => {
    let ticketCalls = 0;
    (ixcService as any).createTicket = async (...args: unknown[]) => {
      ticketCalls += 1;
      return realCreateTicket(...args);
    };

    const sid = 'stream-idem-ticket-1';
    const messageId = 'msg-cliente-uuid-0001';

    // Diagnóstico guiado até o escalonamento (abre chamado no IXC).
    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'minha internet está lenta', sessionId: sid, clientId: '2270', messageId: `${messageId}-t1` });
    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Acontece em todos os aparelhos', sessionId: sid, clientId: '2270', messageId: `${messageId}-t2` });
    await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'Tem luz vermelha/piscando ou cabo solto', sessionId: sid, clientId: '2270', messageId: `${messageId}-t3` });

    // Etapa final VIA STREAM com messageId do cliente → abre o chamado.
    const streamRes = await request(app)
      .post('/api/chat/message/stream')
      .set('Authorization', `Bearer ${token}`)
      .send({
        message: 'Não, ainda continua com lentidão/sem internet',
        sessionId: sid,
        clientId: '2270',
        messageId,
      });
    expect(ticketCalls).toBe(1);

    const streamDone = parseSseEvents(streamRes.text).find((e) => e.event === 'done');
    const firstAnswer = streamDone?.data?.message;
    expect(firstAnswer?.cards?.ticketProtocol).toBeTruthy();

    // Cliente perdeu o fim do stream e reenvia PELA ROTA SÍNCRONA (fallback
    // atual do app mobile) com o MESMO messageId → deve receber o MESMO
    // resultado sem executar o pipeline de novo (sem 2º chamado).
    const retryRes = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send({
        message: 'Não, ainda continua com lentidão/sem internet',
        sessionId: sid,
        clientId: '2270',
        messageId,
      });

    expect(retryRes.status).toBe(200);
    expect(ticketCalls).toBe(1); // ← a garantia central anti-duplicidade
    expect(retryRes.body.id).toBe(firstAnswer.id);
    expect(retryRes.body.cards?.ticketProtocol).toBe(firstAnswer.cards?.ticketProtocol);

    const history = await chatService.getSessionHistory(sid);
    const persistedProtocolAnswers = history.filter(
      (m) => m.sender === 'BOT' && m.cards?.ticketProtocol
    );
    expect(persistedProtocolAnswers.length).toBe(1);
  });

  it('deve aceitar clientMessageId do app tanto no stream quanto no fallback síncrono', async () => {
    const sid = 'stream-client-message-id-alias';
    const clientMessageId = 'mobile-client-message-id-1';
    const payload = {
      message: 'Quero contratar um plano de internet',
      sessionId: sid,
      clientId: '2270',
      clientMessageId,
    };

    const streamRes = await request(app)
      .post('/api/chat/message/stream')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    const streamDone = parseSseEvents(streamRes.text).find((event) => event.event === 'done');

    const retryRes = await request(app)
      .post('/api/chat/message')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(streamRes.status).toBe(200);
    expect(retryRes.status).toBe(200);
    expect(retryRes.body.id).toBe(streamDone?.data?.message?.id);
  });

  it('requisições concorrentes com o mesmo messageId compartilham a mesma execução (single-flight)', async () => {
    let ticketCalls = 0;
    (ixcService as any).createTicket = async (...args: unknown[]) => {
      ticketCalls += 1;
      return realCreateTicket(...args);
    };

    const sid = 'stream-idem-concurrent-1';
    const messageId = 'msg-cliente-uuid-concurrent';

    const payload = {
      message: 'Confirmar contratação do plano DBS 500MB',
      sessionId: sid,
      clientId: '2270',
      messageId,
    };

    const [resA, resB] = await Promise.all([
      request(app).post('/api/chat/message/stream').set('Authorization', `Bearer ${token}`).send(payload),
      request(app).post('/api/chat/message/stream').set('Authorization', `Bearer ${token}`).send(payload),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const doneA = parseSseEvents(resA.text).find((e) => e.event === 'done');
    const doneB = parseSseEvents(resB.text).find((e) => e.event === 'done');
    expect(doneA?.data?.message?.id).toBeTruthy();
    expect(doneB?.data?.message?.id).toBe(doneA?.data?.message?.id);
  });

  it('mantém idempotência quando o retry chega em outra instância do serviço', async () => {
    let classifyCalls = 0;
    let releaseClassification!: () => void;
    let enteredClassification!: () => void;
    const classificationEntered = new Promise<void>((resolve) => { enteredClassification = resolve; });
    const classificationReleased = new Promise<void>((resolve) => { releaseClassification = resolve; });
    (aiService as any).classifyMessage = async () => {
      classifyCalls += 1;
      enteredClassification();
      await classificationReleased;
      return {
        department: 'GERAL',
        confidence: 0.99,
        intent: 'SAUDACAO',
        friendlyMessage: 'Olá! Como posso ajudar?',
        suggestedAction: 'NONE',
        aiProvider: 'heuristic',
      };
    };

    const sid = 'stream-idem-cross-instance-1';
    const messageId = 'cross-instance-message-1';
    const firstService = new ChatService();
    const secondService = new ChatService();
    const firstPromise = firstService.processMessage(sid, 'Olá', '2270', { clientMessageId: messageId });
    await classificationEntered;

    // Separate workers do not share the in-process guard.
    chatIdempotency.reset();
    const secondPromise = secondService.processMessage(sid, 'Olá', '2270', { clientMessageId: messageId });
    releaseClassification();

    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(classifyCalls).toBe(1);
    expect(second.id).toBe(first.id);
    expect((await chatService.getSessionHistory(sid)).filter((message) => message.sender === 'USER')).toHaveLength(1);
  });

  it('/ai/classify rejeita mensagem acima de 2000 caracteres com 413 em português (anti-abuso de custo)', async () => {
    const oversized = await request(app)
      .post('/api/ai/classify')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: '2270', message: 'a'.repeat(2001) });

    expect(oversized.status).toBe(413);
    expect(oversized.body.code).toBe('CLASSIFY_VALIDATION_FAILED');
    expect(oversized.body.error).toContain('2000');

    // Mensagens legítimas continuam funcionando (fast router, zero tokens).
    const valid = await request(app)
      .post('/api/ai/classify')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: '2270', message: 'boleto' });
    expect(valid.status).toBe(200);
    expect(valid.body.department).toBe('FINANCEIRO');

    // Campo ausente/vazio também é barrado antes de qualquer LLM.
    const empty = await request(app)
      .post('/api/ai/classify')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: '2270', message: '' });
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('CLASSIFY_VALIDATION_FAILED');
  });

  it('/chat/audio rejeita MIME fora da allowlist com 415 tipo_nao_suportado e aplica teto de ~10MB', async () => {
    const disallowed = await request(app)
      .post('/api/chat/audio')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId: '2270',
        sessionId: 'audio-mime-1',
        audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        mimeType: 'video/mp4',
      });
    expect(disallowed.status).toBe(415);
    expect(disallowed.body.code).toBe('tipo_nao_suportado');

    // Alias oficial do iOS (.m4a) passa pela validação de MIME.
    const m4a = await request(app)
      .post('/api/chat/audio')
      .set('Authorization', `Bearer ${token}`)
      .send({
        clientId: '2270',
        sessionId: 'audio-mime-2',
        audioBase64: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=',
        mimeType: 'audio/m4a;codecs=mp4a.40.2',
      });
    expect(m4a.status).not.toBe(415);

    // Payload acima de ~10MB de áudio real é rejeitado com 413.
    const hugeBase64 = 'A'.repeat(Math.floor((10 * 1024 * 1024 * 4) / 3) + 1);
    const tooBig = await request(app)
      .post('/api/chat/audio')
      .set('Authorization', `Bearer ${token}`)
      .send({ clientId: '2270', sessionId: 'audio-mime-3', audioBase64: hugeBase64, mimeType: 'audio/wav' });
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.code).toBe('AUDIO_TOO_LARGE');
  });

  it('processStreamMessage mantém contrato do serviço: chunks concatenam o texto e suporta onStage', async () => {
    const chunks: string[] = [];
    const stages: string[] = [];
    const botMessage = await chatService.processStreamMessage(
      'service-stream-contract-1',
      'Preciso do meu boleto',
      '2270',
      (chunk) => chunks.push(chunk),
      { clientMessageId: 'svc-uuid-1', onStage: (stage) => stages.push(stage) }
    );

    expect(botMessage.sender).toBe('BOT');
    expect(chunks.join('')).toBe(botMessage.text);
    expect(stages).toContain('recebido');
    expect(stages).toContain('classificando');
    expect(stages).toContain('compondo_resposta');

    // Retry com o mesmo messageId devolve a MESMA mensagem (idempotência).
    const chunksRetry: string[] = [];
    const retry = await chatService.processStreamMessage(
      'service-stream-contract-1',
      'Preciso do meu boleto',
      '2270',
      (chunk) => chunksRetry.push(chunk),
      { clientMessageId: 'svc-uuid-1' }
    );
    expect(retry.id).toBe(botMessage.id);
    expect(chunksRetry.join('')).toBe(botMessage.text);
  });
});
