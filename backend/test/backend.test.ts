import { describe, it, expect } from 'vitest';
import { aiService } from '../src/modules/ai/ai.service.js';
import { fastRouterService } from '../src/modules/ai/fast-router.service.js';
import { commercialService } from '../src/modules/commercial/commercial.service.js';
import { supportService } from '../src/modules/support/support.service.js';
import { financialService } from '../src/modules/financial/financial.service.js';
import { ixcService } from '../src/modules/ixc/ixc.service.js';
import { userService } from '../src/modules/auth/user.service.js';

describe('1. Fast Router & Tier 0 Deterministic Classification', () => {
  it('deve classificar mensagens de boleto/fatura via FastRouter em milissegundos sem gastar tokens de IA', async () => {
    const start = performance.now();
    const res1 = await aiService.classifyMessage('Preciso do boleto');
    const elapsed = performance.now() - start;

    expect(res1.department).toBe('FINANCEIRO');
    expect(res1.aiProvider).toBe('fast-route');
    expect(res1.confidence).toBe(1.0);
    expect(elapsed).toBeLessThan(50); // Execução ultrarrápida

    const res2 = await aiService.classifyMessage('segunda via da fatura');
    expect(res2.department).toBe('FINANCEIRO');
    expect(res2.aiProvider).toBe('fast-route');

    const res3 = await aiService.classifyMessage('chave pix para pagar a conta');
    expect(res3.department).toBe('FINANCEIRO');
    expect(res3.aiProvider).toBe('fast-route');
  });

  it('deve classificar problemas de conexão e lentidão diretamente como SUPORTE via FastRouter', async () => {
    const res1 = await aiService.classifyMessage('Minha internet está lenta 🛠️');
    expect(res1.department).toBe('SUPORTE');
    expect(res1.aiProvider).toBe('fast-route');
    expect(res1.suggestedAction).toBe('START_DIAGNOSTIC');

    const res2 = await aiService.classifyMessage('sem internet e com luz vermelha no modem');
    expect(res2.department).toBe('SUPORTE');
    expect(res2.aiProvider).toBe('fast-route');
  });

  it('deve classificar consultas de planos e Wi-Fi 6 como COMERCIAL via FastRouter', async () => {
    const res1 = await aiService.classifyMessage('Quero ver os planos de internet');
    expect(res1.department).toBe('COMERCIAL');
    expect(res1.aiProvider).toBe('fast-route');
    expect(res1.suggestedAction).toBe('SHOW_PLANS');

    const res2 = await aiService.classifyMessage('Quero conhecer os planos Wi-Fi 6 📶');
    expect(res2.department).toBe('COMERCIAL');
    expect(res2.aiProvider).toBe('fast-route');
    expect(res2.extractedData?.wantsWifi6).toBe(true);
  });

  it('deve gerar proposta de contratação para plano específico selecionado', async () => {
    const res = await aiService.classifyMessage('Gostei do plano Ideal DBS 500MB (500 Mega). Como faço para contratar?');
    expect(res.department).toBe('COMERCIAL');
    expect(res.aiProvider).toBe('fast-route');
    expect(res.intent).toBe('PROPOSTA_CONTRATACAO_PLANO');
    expect(res.friendlyMessage).toContain('Ideal DBS 500MB');
    expect(res.friendlyMessage).toContain('119,90');
    expect(res.friendlyMessage).toContain('GRATUITA');
  });

  it('deve confirmar o pedido de contratação e gerar protocolo comercial', async () => {
    const res = await aiService.classifyMessage('Confirmar contratação');
    expect(res.department).toBe('COMERCIAL');
    expect(res.aiProvider).toBe('fast-route');
    expect(res.intent).toBe('CONFIRMAR_CONTRATACAO');
    expect(res.friendlyMessage).toContain('DBS-PED-');
  });

  it('deve contornar objeções de vendas de forma determinística', async () => {
    const resPensar = await aiService.classifyMessage('Vou pensar um pouco');
    expect(resPensar.department).toBe('COMERCIAL');
    expect(resPensar.aiProvider).toBe('fast-route');
    expect(resPensar.extractedData?.objectionType).toBe('pensar');

    const resCaro = await aiService.classifyMessage('Achei muito caro');
    expect(resCaro.department).toBe('COMERCIAL');
    expect(resCaro.aiProvider).toBe('fast-route');
    expect(resCaro.extractedData?.objectionType).toBe('caro');
  });

  it('deve identificar saudações básicas como GERAL de forma instantânea', async () => {
    const res = await aiService.classifyMessage('olá');
    expect(res.department).toBe('GERAL');
    expect(res.aiProvider).toBe('fast-route');
  });
});

describe('2. Commercial & Sales Script Engine', () => {
  it('deve recomendar Wi-Fi 6 para residências com mais de 8 aparelhos', () => {
    const rec = commercialService.recommendPlan(10);
    expect(rec.recommended.type).toBe('WIFI6');
    expect(rec.recommended.id).toBe('wifi6-800');
  });

  it('deve recomendar Ideal 500MB para até 4 aparelhos com bom custo-benefício', () => {
    const rec = commercialService.recommendPlan(3);
    expect(rec.recommended.id).toBe('dbs-500');
    expect(rec.recommended.priceOnTime).toBe(119.90);
  });

  it('deve fornecer argumentos de contorno de objeção oficiais', () => {
    const text = commercialService.getObjectionHandling('pensar');
    expect(text).toContain('instalação 100% gratuita');
  });
});

describe('3. Support Diagnostic State Machine', () => {
  it('deve guiar o cliente pelas 3 etapas de diagnóstico de lentidão', async () => {
    const clientId = 'test-client-99';

    // Etapa 1: Início (Múltiplos aparelhos)
    const step1 = await supportService.startDiagnostic(clientId);
    expect(step1.step).toBe('STEP_1_DEVICES');

    // Etapa 2: Verificação de cabos/LEDs
    const step2 = await supportService.processDiagnosticStep(clientId, 'Acontece em todos os aparelhos');
    expect(step2.step).toBe('STEP_2_CABLES');

    // Etapa 3: Reinicialização do equipamento
    const step3 = await supportService.processDiagnosticStep(clientId, 'Sim, luzes verdes e cabos firmes');
    expect(step3.step).toBe('STEP_3_RESTART');

    // Resolução: Se não resolver, deve escalonar e gerar protocolo
    const step4 = await supportService.processDiagnosticStep(clientId, 'Ainda continua com lentidão');
    expect(step4.step).toBe('ESCALATED');
    expect(step4.protocolo).toBeDefined();
    expect(step4.protocolo).toContain('DBS-');
  });
});

describe('4. IXC Service & Financial Invoices', () => {
  it('deve formatar linha digitável e gerar payload PIX válido', async () => {
    const invoices = await financialService.getInvoicesByClientId('2270');
    expect(Array.isArray(invoices)).toBe(true);

    if (invoices.length > 0) {
      const inv = invoices[0];
      expect(inv.valorFormatado).toContain('R$');
      expect(inv.linhaDigitavel).toBeDefined();
      expect(inv.pixCopiaECola).toContain('br.gov.bcb.pix');
    }
  });

  it('deve consultar cliente no IXC com sucesso', async () => {
    const client = await ixcService.findClientById('2270');
    expect(client).toBeDefined();
    if (client) {
      expect(client.id).toBe('2270');
    }
  });
});

describe('5. User Authentication & Account Sync (Password = CPF)', () => {
  it('deve autenticar cliente com CPF e Senha = CPF', async () => {
    const auth = await userService.authenticateUser('154.293.707-89', '15429370789');
    expect(auth.success).toBe(true);
    expect(auth.client).toBeDefined();
  });

  it('deve rejeitar autenticação caso a senha não corresponda ao CPF do cliente', async () => {
    const auth = await userService.authenticateUser('154.293.707-89', 'senha_errada_999');
    expect(auth.success).toBe(false);
    expect(auth.message).toContain('Senha incorreta');
  });

  it('deve rejeitar autenticação com senha vazia ou apenas letras caso CPF seja vazio', async () => {
    const auth = await userService.authenticateUser('154.293.707-89', '   ');
    expect(auth.success).toBe(false);
  });

  it('deve sincronizar e criar usuários para todos os clientes da base IXC', async () => {
    const sync = await userService.syncUsersFromIXC(10);
    expect(sync.totalProcessed).toBeGreaterThanOrEqual(1);
    expect(sync.users.length).toBeGreaterThanOrEqual(1);

    const firstUser = sync.users[0];
    expect(firstUser.login).toBeDefined();
    expect(firstUser.defaultPasswordCpf).toBeDefined();
  });
});

describe('6. Desbloqueio em Confiança (Promessa de Pagamento)', () => {
  it('deve identificar claramente o desbloqueio simulado sem afirmar alteração no IXC', async () => {
    const res = await financialService.unblockPromise('2270', '2323');
    expect(res.success).toBe(true);
    expect(res.unblockHours).toBe(72);
    expect(res.protocolo).toContain('DBS-DESB-');
    expect(res.unblockUntil).toBeDefined();
    expect(res.simulated).toBe(true);
    expect(res.message).toContain('IXC não foi alterado');
  });

  it('deve reconhecer pedido de desbloqueio em confiança no FastRouter e Chat', async () => {
    const match = fastRouterService.matchFastIntent('Preciso de desbloqueio em confiança');
    expect(match).not.toBeNull();
    expect(match?.department).toBe('FINANCEIRO');
    expect(match?.intent).toBe('DESBLOQUEIO_CONFIANCA');
  });
});

describe('7. Visualização e Download do PDF do Boleto', () => {
  it('deve gerar um arquivo PDF válido (PDF-1.4) com cabeçalhos corretos', async () => {
    const pdfDoc = await financialService.getInvoicePdf('145690', '2270');
    expect(pdfDoc.contentType).toBe('application/pdf');
    expect(pdfDoc.filename).toBe('Boleto-DBS-Fatura-145690.pdf');
    expect(Buffer.isBuffer(pdfDoc.buffer)).toBe(true);
    expect(pdfDoc.buffer.length).toBeGreaterThan(500);

    const pdfContent = pdfDoc.buffer.toString('utf-8');
    expect(pdfContent.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfContent).toContain('DBS TELECOMUNICACOES');
    expect(pdfContent).toContain('%%EOF');
  });
});

describe('8. Central de Acompanhamento de Chamados (O.S.)', () => {
  it('deve retornar lista de chamados e Ordens de Serviço com status e etapas', async () => {
    const tickets = await supportService.getClientTickets('2270');
    expect(Array.isArray(tickets)).toBe(true);
    expect(tickets.length).toBeGreaterThanOrEqual(1);

    const ticket = tickets[0];
    expect(ticket.protocolo).toBeDefined();
    expect(ticket.assunto).toBeDefined();
    expect(ticket.statusLabel).toBeDefined();
    expect(Array.isArray(ticket.etapas)).toBe(true);
  });

  it('deve reconhecer intenção de acompanhamento de chamados no FastRouter', () => {
    const match = fastRouterService.matchFastIntent('Quero acompanhar meu chamado técnico');
    expect(match).not.toBeNull();
    expect(match?.department).toBe('SUPORTE');
    expect(match?.intent).toBe('ACOMPANHAMENTO_CHAMADOS');
  });
});

describe('9. Extrato de Consumo de Franquia / Tráfego de Dados', () => {
  it('deve calcular o resumo e o gráfico diário de consumo de tráfego (Download/Upload)', async () => {
    const { trafficService } = await import('../src/modules/traffic/traffic.service.js');
    const consumption = await trafficService.getClientTrafficConsumption('2270', 14);

    expect(consumption.clientId).toBe('2270');
    expect(consumption.totalDownloadGB).toBeGreaterThan(0);
    expect(consumption.totalUploadGB).toBeGreaterThan(0);
    expect(consumption.totalConsumedGB).toBeGreaterThan(0);
    expect(consumption.dailyAverageGB).toBeGreaterThan(0);
    expect(consumption.planFranchise).toContain('Ilimitado');
    expect(consumption.dailyUsage.length).toBe(14);

    const firstDay = consumption.dailyUsage[0];
    expect(firstDay.date).toBeDefined();
    expect(firstDay.dayLabel).toBeDefined();
    expect(firstDay.downloadGB).toBeGreaterThanOrEqual(0);
    expect(firstDay.uploadGB).toBeGreaterThanOrEqual(0);
    expect(firstDay.totalGB).toBeGreaterThanOrEqual(0);
  });
});
