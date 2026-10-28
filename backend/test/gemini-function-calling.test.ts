import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  AI_PROVIDER_DEADLINE_MS,
  GEMINI_TOOLS,
  handleFunctionCall,
  GeminiFunctionCall,
  geminiProvider,
} from '../src/modules/ai/gemini.provider.js';
import { CONFIG } from '../src/config/env.js';
import { IXCContextBundle } from '../src/modules/ai/ixc-context.builder.js';
import { aiService } from '../src/modules/ai/ai.service.js';
import { ixcService } from '../src/modules/ixc/ixc.service.js';
import { financialService } from '../src/modules/financial/financial.service.js';
import { chatService, chatIdempotency } from '../src/modules/chat/chat.service.js';

describe('🤖 Suite de Gemini Function Calling (Structured Tool Calling)', () => {
  const mockContextBundle: IXCContextBundle = {
    client: {
      id: '2270',
      nome: 'Emanuel da Silva',
      firstName: 'Emanuel',
      cpfCnpj: '154.293.707-89',
      telefone: '(49) 98877-6655',
      endereco: 'Av. Brasil, 500',
    },
    contracts: [
      {
        id: '101',
        plano: 'DBS Fibra 500 Mega',
        status: 'A',
        statusDesc: 'Ativo',
        endereco: 'Av. Brasil, 500',
      },
    ],
    financial: {
      status: 'AVAILABLE',
      hasOpenInvoices: true,
      openInvoicesCount: 1,
      totalDue: 'R$ 119,90',
      invoices: [
        {
          id: '5001',
          valor: 'R$ 119,90',
          vencimento: '10/09/2026',
          status: 'A',
          statusDesc: 'Aberta',
          linhaDigitavel: '34191.79001 01043.510047 91020.150008 5 91230000011990',
          pixCopiaECola: '00020126580014br.gov.bcb.pix...',
        },
      ],
    },
    support: {
      openTicketsCount: 0,
      recentTickets: [],
    },
    traffic: {
      status: 'Conectado',
      online: true,
      formattedPeriod: 'Últimos 30 dias',
    },
    raw: {
      client: {} as any,
      contracts: [],
      invoices: [],
      tickets: [],
    },
  };

  afterEach(() => {
    chatIdempotency.reset();
  });

  describe('🛠️ 1. Catálogo de Declaração de Ferramentas (GEMINI_TOOLS)', () => {
    it('deve conter as 5 ferramentas nativas declaradas com schema válido', () => {
      expect(GEMINI_TOOLS).toHaveLength(1);
      const decls = GEMINI_TOOLS[0].functionDeclarations;
      expect(decls).toBeDefined();
      expect(decls.length).toBeGreaterThanOrEqual(5);

      const toolNames = decls.map((t) => t.name);
      expect(toolNames).toContain('getInvoices');
      expect(toolNames).toContain('createTicket');
      expect(toolNames).toContain('unblockPromise');
      expect(toolNames).toContain('startDiagnostic');
      expect(toolNames).toContain('showPlans');
    });

    it('cada ferramenta deve possuir parâmetros com tipagem rigorosa', () => {
      const decls = GEMINI_TOOLS[0].functionDeclarations;

      const getInvoices = decls.find((t) => t.name === 'getInvoices');
      expect(getInvoices?.parameters.required).toContain('clientId');

      const createTicket = decls.find((t) => t.name === 'createTicket');
      expect(createTicket?.parameters.required).toContain('clientId');
      expect(createTicket?.parameters.required).toContain('subject');
      expect(createTicket?.parameters.required).toContain('message');

      const unblockPromise = decls.find((t) => t.name === 'unblockPromise');
      expect(unblockPromise?.parameters.required).toContain('clientId');
    });
  });

  describe('🎯 2. Execução e Mapeamento Determinístico de Function Calls', () => {
    it('limita retries Gemini a um deadline cumulativo compartilhado', async () => {
      const previousKey = CONFIG.ai.geminiApiKey;
      CONFIG.ai.geminiApiKey = 'fake-gemini-key';
      const originalFetch = globalThis.fetch;
      const originalNow = Date.now;
      let clock = originalNow();
      const timeouts: number[] = [];
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        timeouts.push(ms);
        return new AbortController().signal;
      });
      vi.spyOn(Date, 'now').mockImplementation(() => clock);
      globalThis.fetch = vi.fn(async () => {
        clock += 3000;
        throw new Error('provider indisponível');
      }) as typeof fetch;

      try {
        const result = await geminiProvider.generateResponse({ message: 'mensagem complexa' });
        expect(result).toBeNull();
        expect(globalThis.fetch).toHaveBeenCalledTimes(4);
        expect(timeouts).toEqual([4500, 4500, 4500, AI_PROVIDER_DEADLINE_MS - 9000]);
        expect(timeouts.reduce((sum, timeout) => sum + timeout, 0)).toBeGreaterThanOrEqual(AI_PROVIDER_DEADLINE_MS);
      } finally {
        timeoutSpy.mockRestore();
        vi.restoreAllMocks();
        Date.now = originalNow;
        globalThis.fetch = originalFetch;
        CONFIG.ai.geminiApiKey = previousKey;
      }
    });

    it('aplica abort timeout também ao fallback OpenAI', async () => {
      const previousProvider = CONFIG.ai.provider;
      const previousKey = CONFIG.ai.openaiApiKey;
      CONFIG.ai.provider = 'openai';
      CONFIG.ai.openaiApiKey = 'fake-openai-key';
      const originalFetch = globalThis.fetch;
      let observedTimeout = 0;
      const timeoutSpy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
        observedTimeout = ms;
        return new AbortController().signal;
      });
      globalThis.fetch = vi.fn(async () => {
        throw new Error('provider indisponível');
      }) as typeof fetch;

      try {
        const result = await aiService.classifyMessage('explique uma situação não determinística', { clientId: '2270' });
        expect(result.aiProvider).toBe('heuristic');
        expect(observedTimeout).toBeGreaterThan(0);
        expect(observedTimeout).toBeLessThanOrEqual(4500);
      } finally {
        timeoutSpy.mockRestore();
        globalThis.fetch = originalFetch;
        CONFIG.ai.provider = previousProvider;
        CONFIG.ai.openaiApiKey = previousKey;
      }
    });

    it('deve processar getInvoices com faturas reais do cliente', () => {
      const functionCall: GeminiFunctionCall = {
        name: 'getInvoices',
        args: { clientId: '2270' },
      };

      const result = handleFunctionCall(functionCall, mockContextBundle);
      expect(result.department).toBe('FINANCEIRO');
      expect(result.suggestedAction).toBe('GET_INVOICE');
      expect(result.extractedData?.invoiceRequested).toBe(true);
      expect(result.friendlyMessage).toContain('R$ 119,90');
      expect(result.friendlyMessage).toContain('Emanuel');
    });

    it('deve processar createTicket para suporte técnico', () => {
      const functionCall: GeminiFunctionCall = {
        name: 'createTicket',
        args: {
          clientId: '2270',
          subject: 'Queda de sinal na fibra',
          message: 'Cliente relata luz vermelha no modem',
        },
      };

      const result = handleFunctionCall(functionCall, mockContextBundle);
      expect(result.department).toBe('SUPORTE');
      expect(result.intent).toBe('ABERTURA_CHAMADO');
      expect(result.toolAction).toEqual({
        type: 'CREATE_TICKET',
        subject: 'Queda de sinal na fibra',
        message: 'Cliente relata luz vermelha no modem',
      });
      expect(result.friendlyMessage).toContain('Queda de sinal na fibra');
    });

    it('deve processar unblockPromise para liberação de conexão em 72h', () => {
      const functionCall: GeminiFunctionCall = {
        name: 'unblockPromise',
        args: { clientId: '2270', contractId: '101' },
      };

      const result = handleFunctionCall(functionCall, mockContextBundle);
      expect(result.department).toBe('FINANCEIRO');
      expect(result.intent).toBe('DESBLOQUEIO_CONFIANCA');
      expect(result.toolAction).toEqual({
        type: 'UNBLOCK_PROMISE',
        contractId: '101',
      });
      expect(result.friendlyMessage).toContain('Desbloqueio em Confiança');
    });

    it('deve processar startDiagnostic para teste de conexão', () => {
      const functionCall: GeminiFunctionCall = {
        name: 'startDiagnostic',
        args: { clientId: '2270' },
      };

      const result = handleFunctionCall(functionCall, mockContextBundle);
      expect(result.department).toBe('SUPORTE');
      expect(result.suggestedAction).toBe('START_DIAGNOSTIC');
      expect(result.extractedData?.slownessReported).toBe(true);
    });

    it('deve processar showPlans com destaque para Wi-Fi 6 quando solicitado', () => {
      const functionCall: GeminiFunctionCall = {
        name: 'showPlans',
        args: { category: 'WIFI6' },
      };

      const result = handleFunctionCall(functionCall, mockContextBundle);
      expect(result.department).toBe('COMERCIAL');
      expect(result.suggestedAction).toBe('SHOW_PLANS');
      expect(result.extractedData?.wantsWifi6).toBe(true);
      expect(result.friendlyMessage).toContain('Wi-Fi 6');
    });

    it('deve executar o chamado criado por uma tool call usando o cliente autenticado', async () => {
      const originalClassify = aiService.classifyMessage;
      const originalCreateTicket = (ixcService as any).createTicket;
      let receivedTicket: any;

      (aiService as any).classifyMessage = async () => ({
        department: 'SUPORTE',
        confidence: 0.99,
        intent: 'ABERTURA_CHAMADO',
        friendlyMessage: 'Vou abrir seu chamado.',
        toolAction: {
          type: 'CREATE_TICKET',
          subject: 'Sem conexão',
          message: 'A luz LOS está vermelha.',
        },
        aiProvider: 'gemini',
      });
      (ixcService as any).createTicket = async (ticket: any) => {
        receivedTicket = ticket;
        return { success: true, protocolo: 'IXC-TOOL-1', id: '123' };
      };

      try {
        const result = await chatService.processMessage(
          'gemini-tool-ticket-session',
          'Abra um chamado',
          'authenticated-client-1',
          { clientMessageId: 'gemini-tool-ticket-1' },
        );

        expect(receivedTicket).toMatchObject({
          id_cliente: 'authenticated-client-1',
          assunto: 'Sem conexão',
          mensagem: 'A luz LOS está vermelha.',
        });
        expect(result.cards?.type).toBe('TICKET');
        expect(result.cards?.ticketProtocol).toBe('IXC-TOOL-1');
      } finally {
        (aiService as any).classifyMessage = originalClassify;
        (ixcService as any).createTicket = originalCreateTicket;
      }
    });

    it('deve executar o desbloqueio da tool call com o contrato solicitado', async () => {
      const originalClassify = aiService.classifyMessage;
      const originalUnblock = (financialService as any).unblockPromise;
      let receivedClientId: string | undefined;
      let receivedContractId: string | undefined;

      (aiService as any).classifyMessage = async () => ({
        department: 'FINANCEIRO',
        confidence: 0.99,
        intent: 'DESBLOQUEIO_CONFIANCA',
        friendlyMessage: 'Vou solicitar sua liberação.',
        toolAction: { type: 'UNBLOCK_PROMISE', contractId: 'contract-101' },
        aiProvider: 'gemini',
      });
      (financialService as any).unblockPromise = async (clientId: string, contractId?: string) => {
        receivedClientId = clientId;
        receivedContractId = contractId;
        return {
          success: true,
          message: 'Liberação confirmada.',
          protocolo: 'IXC-DESB-1',
          unblockUntil: '01/01/2027',
        };
      };

      try {
        const result = await chatService.processMessage(
          'gemini-tool-unblock-session',
          'Desbloqueie minha conexão',
          'authenticated-client-2',
          { clientMessageId: 'gemini-tool-unblock-1' },
        );

        expect(receivedClientId).toBe('authenticated-client-2');
        expect(receivedContractId).toBe('contract-101');
        expect(result.cards?.ticketProtocol).toBe('IXC-DESB-1');
      } finally {
        (aiService as any).classifyMessage = originalClassify;
        (financialService as any).unblockPromise = originalUnblock;
      }
    });
  });
});
