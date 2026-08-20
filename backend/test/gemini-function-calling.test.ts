import { describe, it, expect } from 'vitest';
import {
  GEMINI_TOOLS,
  handleFunctionCall,
  GeminiFunctionCall,
} from '../src/modules/ai/gemini.provider.js';
import { IXCContextBundle } from '../src/modules/ai/ixc-context.builder.js';

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
      expect(result.suggestedAction).toBe('START_DIAGNOSTIC');
      expect(result.friendlyMessage).toContain('Queda de sinal na fibra');
    });

    it('deve processar unblockPromise para liberação de conexão em 72h', () => {
      const functionCall: GeminiFunctionCall = {
        name: 'unblockPromise',
        args: { clientId: '2270', contractId: '101' },
      };

      const result = handleFunctionCall(functionCall, mockContextBundle);
      expect(result.department).toBe('FINANCEIRO');
      expect(result.intent).toBe('DESBLOQUEIO_CONFIANCA_FUNCTION');
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
  });
});
