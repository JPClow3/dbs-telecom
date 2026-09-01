import { z } from 'zod';
import { CONFIG } from '../../config/env.js';
import { DepartmentType } from './ai.service.js';
import { IXCContextBundle } from './ixc-context.builder.js';

export type AIToolAction =
  | { type: 'CREATE_TICKET'; subject: string; message: string }
  | { type: 'UNBLOCK_PROMISE'; contractId?: string };

const AIToolActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CREATE_TICKET'),
    subject: z.string().trim().min(1).max(200),
    message: z.string().trim().min(1).max(2000),
  }),
  z.object({
    type: z.literal('UNBLOCK_PROMISE'),
    contractId: z.string().trim().max(100).optional(),
  }),
]);

export const AIOutputSchema = z.object({
  department: z.enum(['COMERCIAL', 'SUPORTE', 'FINANCEIRO', 'GERAL']),
  confidence: z.number().min(0).max(1),
  intent: z.string(),
  friendlyMessage: z.string(),
  extractedData: z
    .object({
      devicesCount: z.number().nullable().optional(),
      wantsWifi6: z.boolean().nullable().optional(),
      objectionType: z.enum(['pensar', 'caro', 'depois', 'indicacao']).nullable().optional(),
      invoiceRequested: z.boolean().nullable().optional(),
      slownessReported: z.boolean().nullable().optional(),
    })
    .nullable()
    .optional(),
  suggestedAction: z
    .enum(['START_DIAGNOSTIC', 'GET_INVOICE', 'SHOW_PLANS', 'HANDLE_OBJECTION', 'NONE'])
    .nullable()
    .optional(),
  toolAction: AIToolActionSchema.optional(),
});

export type AIOutputData = z.infer<typeof AIOutputSchema>;

export interface GuardrailCheckResult {
  passed: boolean;
  violationType?: 'PROMPT_INJECTION' | 'OUT_OF_SCOPE' | 'INPUT_TOO_LONG' | 'PII_LEAK' | 'MALFORMED_OUTPUT';
  safeResponse?: AIOutputData;
  reason?: string;
}

export class AIGuardrails {
  private static readonly MAX_INPUT_LENGTH = 1500;

  // Padrões de Jailbreak, Prompt Injection e Extração de Prompts
  private static readonly INJECTION_PATTERNS = [
    // Ignore / Bypass em EN e PT
    /ignore (all )?(previous |prior |above )?(instructions|directions|rules|prompts)/i,
    /desconsidere (todas as )?(instruções|regras|diretrizes) (anteriores)?/i,
    /esqueça (todas as )?(suas regras|instruções|diretrizes)/i,
    // Multilingual (Espanhol / Francês)
    /ignora (todas )?(las )?(instrucciones|reglas) (anteriores)?/i,
    /olvida (todas )?(las )?(instrucciones|reglas)/i,
    /ignorez (toutes )?(les )?(instructions|règles)/i,
    // Roleplay / Framing / Dev Mode
    /você agora é (um|uma|o|a)?\s*(ia sem regras|hacker|bot livre|bot sem limites|dan|desenvolvedor|assistente sem restrições|unrestricted)/i,
    /you are now (a|an)\s*(unrestricted|jailbroken|different|developer|dan)/i,
    /act as (a|an)? (unrestricted|jailbroken|different|developer)/i,
    /unrestricted ai/i,
    /dan mode/i,
    /developer mode/i,
    /modo desenvolvedor/i,
    /jailbreak/i,
    /finja que (você )?(não é|não trabalha|é um)/i,
    /vamos (jogar|brincar|fingir|fazer de conta) que/i,
    /em um (cenário|mundo|universo) hipotético/i,
    /in a hypothetical (world|scenario)/i,
    /pretend (you are|to be)/i,
    // Extração de Prompts / Segredos do Sistema
    /(revele|mostre|qual é|qual o|quais são) (o\s+)?(seu\s+)?(system prompt|prompt de sistema|instruções|segredos)/i,
    /show (me )?(your )?(system prompt|instructions|initial prompt)/i,
    /repeat (the text|words|instructions) (above|from the start)/i,
    /what are your (system instructions|initial rules)/i,
    /desconsidere que você é da dbs/i,
    /bypass (security|filters|guardrails)/i,
    /\b(you have been hacked|i hacked you|bypass security|system override)\b/i,
  ];

  // Padrões de assuntos fora de escopo (Out of Scope / Anti-Abuse)
  private static readonly OUT_OF_SCOPE_PATTERNS = [
    /\b(receita de (bolo|pão|comida|cozinha|torta|sobremesa)|como fazer bolo|culinária|como cozinhar)\b/i,
    /\b(política|eleição|candidato a presidente|partido político|governo federal|deputado|senador)\b/i,
    /\b(escreva um código (em|de)? (python|javascript|c\+\+|java|html|php|sql|bash|rust)|crie um script de programação|programação em python|código javascript|criar malware)\b/i,
    /\b(quem descobriu o brasil|história da roma antiga|revolução francesa|quantos planetas existem|física quântica|teoria da relatividade)\b/i,
    /\b(qual o sentido da vida|conte uma piada de humor negro|piadas pesadas)\b/i,
    /\b(criptomoeda|comprar bitcoin|investir na bolsa|day trade|ações da petrobras)\b/i,
    /\b(escreva (um|uma) (redação|poema|poesia|conto|história|artigo sobre))\b/i,
    /\b(traduza (este|esse|o seguinte) texto para|como se diz .* em (inglês|espanhol|francês|alemão))\b/i,
    /\b(como curar|remédio para|sintomas de gravidez|diagnóstico médico)\b/i,
  ];

  /**
   * Normaliza o texto removendo caracteres invisíveis e homóglifos antes da validação
   */
  private static normalizeInput(text: string): string {
    return text
      .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** The length ceiling is a cost/DoS control and is never configurable off. */
  validateInputLength(input: string): GuardrailCheckResult {
    const normalized = AIGuardrails.normalizeInput(input);
    if (normalized.length <= AIGuardrails.MAX_INPUT_LENGTH) return { passed: true };
    return {
      passed: false,
      violationType: 'INPUT_TOO_LONG',
      safeResponse: {
        department: 'GERAL',
        confidence: 1.0,
        intent: 'GUARDRAIL_INPUT_LIMIT',
        friendlyMessage: 'Sua mensagem é um pouco longa. Por favor, envie uma mensagem mais direta para que eu possa te ajudar melhor.',
        suggestedAction: 'NONE',
      },
      reason: 'Input excedeu o limite máximo permitido de caracteres.',
    };
  }

  /**
   * Valida a entrada do usuário contra injeções, limites de tamanho e escopo
   */
  validateInput(input: string, customerName?: string): GuardrailCheckResult {
    const normalized = AIGuardrails.normalizeInput(input);

    // 1. Limite de tamanho (Prevenção de DoS / Context Overflow)
    const lengthResult = this.validateInputLength(input);
    if (!lengthResult.passed) return lengthResult;

    // 2. Detecção de Prompt Injection / Jailbreak
    for (const pattern of AIGuardrails.INJECTION_PATTERNS) {
      if (pattern.test(normalized)) {
        return {
          passed: false,
          violationType: 'PROMPT_INJECTION',
          safeResponse: {
            department: 'GERAL',
            confidence: 1.0,
            intent: 'GUARDRAIL_INJECTION_BLOCKED',
            friendlyMessage: `Olá${customerName ? `, ${customerName}` : ''}! Sou o assistente oficial da **DBS TELECOM**. Estou aqui exclusivamente para te atender com informações sobre nossos planos de internet, 2ª via de faturas e suporte técnico. Como posso te ajudar com a sua conexão?`,
            suggestedAction: 'NONE',
          },
          reason: `Tentativa de injeção de prompt detectada pelo padrão: ${pattern.toString()}`,
        };
      }
    }

    // 3. Detecção de Out of Scope (Fora de Escopo)
    for (const pattern of AIGuardrails.OUT_OF_SCOPE_PATTERNS) {
      if (pattern.test(normalized)) {
        return {
          passed: false,
          violationType: 'OUT_OF_SCOPE',
          safeResponse: {
            department: 'GERAL',
            confidence: 0.95,
            intent: 'OUT_OF_SCOPE',
            friendlyMessage: 'Meu foco aqui na DBS Telecom é te ajudar com serviços de internet fibra ótica, 2ª via de faturas, suporte técnico e contratação de planos. Como posso te auxiliar com sua conexão hoje?',
            suggestedAction: 'NONE',
          },
          reason: `Pergunta fora do domínio de Telecom: ${pattern.toString()}`,
        };
      }
    }

    return { passed: true };
  }

  /**
   * Valida a saída gerada pela IA contra schema Zod, vazamento de segredos e regras anti-alucinação
   */
  validateOutput(rawOutput: unknown, contextBundle?: IXCContextBundle): { valid: boolean; data: AIOutputData; sanitized: boolean } {
    const parseResult = AIOutputSchema.safeParse(rawOutput);

    if (!parseResult.success) {
      console.warn('[AIGuardrails] Erro de validação Zod no output da IA:', parseResult.error.format());
      return {
        valid: false,
        sanitized: true,
        data: {
          department: 'GERAL',
          confidence: 0.8,
          intent: 'FALLBACK_OUTPUT_SCHEMA_ERROR',
          friendlyMessage: 'Olá! Sou o assistente virtual da DBS Telecom. Como posso te ajudar hoje?',
          suggestedAction: 'NONE',
        },
      };
    }

    let data = parseResult.data;
    let sanitized = false;

    // Se o modelo marcou a intenção como OUT_OF_SCOPE
    if (data.intent === 'OUT_OF_SCOPE') {
      data.department = 'GERAL';
      data.friendlyMessage = 'Meu foco de atendimento é exclusivamente sobre nossos serviços de internet, planos, faturas e suporte técnico da DBS Telecom. Como posso te ajudar com a sua conexão hoje?';
      data.suggestedAction = 'NONE';
      sanitized = true;
    }

    // Anti-Hallucination Guardrail: Se a IA categorizou como FINANCEIRO
    if (data.department === 'FINANCEIRO' && contextBundle) {
      if (contextBundle.financial.status === 'AVAILABLE' && !contextBundle.financial.hasOpenInvoices) {
        // Se a base do IXC não tem faturas abertas, força a mensagem a refletir adimplência
        if (
          data.friendlyMessage.toLowerCase().includes('código de barras') ||
          data.friendlyMessage.toLowerCase().includes('vencimento em') ||
          data.friendlyMessage.toLowerCase().includes('fatura')
        ) {
          data.friendlyMessage = 'Consultei nosso sistema no IXC e você não possui faturas em aberto no momento! Sua conta está 100% em dia com a DBS Telecom. 🌟';
          sanitized = true;
        }
      }
    }

    // LGPD & Secret Sanitization: Varre segredos dinâmicos configurados no ambiente
    const sensitiveTokens = [
      CONFIG.ixc.token,
      CONFIG.ai.geminiApiKey,
      CONFIG.ai.openaiApiKey,
    ].filter((t): t is string => Boolean(t && t.trim().length > 6));

    for (const secret of sensitiveTokens) {
      if (data.friendlyMessage.includes(secret)) {
        data.friendlyMessage = data.friendlyMessage.split(secret).join('[DADO_CONFIDENCIAL_REMOVIDO]');
        sanitized = true;
      }
    }

    // Varredura por padrões genéricos de API keys (Google AI / OpenAI / Bearer)
    const apiKeyPatterns = [
      /AIzaSy[A-Za-z0-9_-]{33}/g,
      /sk-[A-Za-z0-9_-]{32,}/g,
      /\b[0-9a-f]{64}\b/gi,
    ];

    for (const pattern of apiKeyPatterns) {
      if (pattern.test(data.friendlyMessage)) {
        data.friendlyMessage = data.friendlyMessage.replace(pattern, '[TOKEN_PROTEGIDO]');
        sanitized = true;
      }
    }

    return { valid: true, data, sanitized };
  }
}

export const aiGuardrails = new AIGuardrails();
