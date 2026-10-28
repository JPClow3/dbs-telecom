import { CONFIG } from '../../config/env.js';
import { aiGuardrails, AIOutputData, AIToolAction } from './ai.guardrails.js';
import { AI_PROVIDER_DEADLINE_MS, geminiProvider } from './gemini.provider.js';
import { ixcContextBuilder, IXCContextBundle } from './ixc-context.builder.js';
import { fastRouterService } from './fast-router.service.js';

export type DepartmentType = 'COMERCIAL' | 'SUPORTE' | 'FINANCEIRO' | 'GERAL';

export interface AIClassificationResult {
  department: DepartmentType;
  confidence: number;
  intent: string;
  friendlyMessage?: string;
  extractedData?: {
    devicesCount?: number | null;
    wantsWifi6?: boolean | null;
    objectionType?: 'pensar' | 'caro' | 'depois' | 'indicacao' | null;
    invoiceRequested?: boolean | null;
    slownessReported?: boolean | null;
  } | null;
  suggestedAction?: 'START_DIAGNOSTIC' | 'GET_INVOICE' | 'SHOW_PLANS' | 'HANDLE_OBJECTION' | 'NONE' | null;
  toolAction?: AIToolAction;
  aiProvider?: 'gemini' | 'openai' | 'heuristic' | 'mock' | 'fast-route';
  aiModel?: string;
  guardrailApplied?: boolean;
  guardrailReason?: string;
}

export class AIService {
  /**
   * Classifica e gera resposta para a mensagem do cliente com Guardrails, Fast Router e IXC
   */
  async classifyMessage(
    message: string,
    context?: { clientId?: string; customerName?: string; previousDepartment?: DepartmentType; history?: Array<{ sender: string; text: string }> }
  ): Promise<AIClassificationResult> {
    const text = message.trim();
    const clientId = context?.clientId;

    // --- 1. LIMITE DE ENTRADA (controle de custo/DoS, sempre ligado) ---
    const lengthResult = aiGuardrails.validateInputLength(text);
    if (!lengthResult.passed && lengthResult.safeResponse) {
      return {
        ...lengthResult.safeResponse,
        aiProvider: 'heuristic',
        guardrailApplied: true,
        guardrailReason: lengthResult.reason,
      };
    }

    // --- 2. GUARDRAILS DE CONTEÚDO (opcionais por configuração) ---
    if (CONFIG.ai.guardrailsEnabled) {
      const guardrailResult = aiGuardrails.validateInput(text, context?.customerName);
      if (!guardrailResult.passed && guardrailResult.safeResponse) {
        return {
          ...guardrailResult.safeResponse,
          aiProvider: 'heuristic',
          guardrailApplied: true,
          guardrailReason: guardrailResult.reason,
        };
      }
    }

    // --- 2. FAST INTENT ROUTER DETERMINÍSTICO (TIER 0 - Zero Latência e Zero Consumo de Tokens) ---
    const firstName = context?.customerName ? context.customerName.split(' ')[0] : 'Cliente';
    const fastMatch = fastRouterService.matchFastIntent(text, firstName);

    if (fastMatch && fastMatch.isDeterministic) {
      let friendlyMsg = fastMatch.friendlyMessage;

      // Se for Financeiro e tivermos o clientId, contextualiza imediatamente com as faturas reais do IXC
      if (fastMatch.department === 'FINANCEIRO' && clientId) {
        try {
          const contextBundle: IXCContextBundle = await ixcContextBuilder.buildContext(clientId);
          if (contextBundle.financial.hasOpenInvoices && contextBundle.financial.invoices.length > 0) {
            const inv = contextBundle.financial.invoices[0];
            friendlyMsg = `Localizei sua fatura no valor de **${inv.valor}** com vencimento em **${inv.vencimento}**, ${firstName}.\n\nVocê pode copiar a linha digitável ou chave PIX abaixo para efetuar o pagamento:`;
          } else if (contextBundle.financial.status === 'AVAILABLE') {
            friendlyMsg = `Consultei nosso sistema no IXC e você não possui faturas em aberto no momento, ${firstName}! Sua conta está 100% em dia com a DBS Telecom. 🌟`;
          } else {
            friendlyMsg = `Não consegui confirmar suas faturas no IXC neste momento, ${firstName}. Tente novamente em instantes.`;
          }
        } catch (e) {
          console.warn('[AIService] Falha ao contextualizar fatura no FastRouter:', e);
        }
      }

      return {
        department: fastMatch.department,
        confidence: fastMatch.confidence,
        intent: fastMatch.intent,
        friendlyMessage: friendlyMsg,
        extractedData: fastMatch.extractedData,
        suggestedAction: fastMatch.suggestedAction,
        aiProvider: 'fast-route',
        aiModel: 'dbs-fast-router-v1',
        guardrailApplied: false,
      };
    }

    // --- 3. CONSTRUÇÃO DO CONTEXTO DA BASE IXC PARA MENSAGENS NÃO DETERMINÍSTICAS ---
    const contextBundle: IXCContextBundle = await ixcContextBuilder.buildContext(clientId);

    // --- 4. GOOGLE GEMINI LLM (TIER 1 - IA Studio para Casos Complexos / Conversacionais) ---
    const providerDeadlineAt = Date.now() + AI_PROVIDER_DEADLINE_MS;
    if ((CONFIG.ai.provider === 'gemini' || CONFIG.ai.provider === 'hybrid') && geminiProvider.isConfigured()) {
      try {
        const geminiResult = await geminiProvider.generateResponse({
          message: text,
          clientId,
          contextBundle,
          conversationHistory: context?.history,
        }, providerDeadlineAt);

        if (geminiResult) {
          // Validação de Saída e Anti-Alucinação com Zod e Dados IXC
          const validation = aiGuardrails.validateOutput(geminiResult, contextBundle);
          return {
            ...validation.data,
            aiProvider: 'gemini',
            aiModel: CONFIG.ai.geminiModel,
            guardrailApplied: validation.sanitized,
          };
        }
      } catch (err: any) {
        console.warn('[AIService] Falha na chamada ao Gemini, recorrendo ao fallback:', err?.message || err);
      }
    }

    // --- 5. OPENAI FALLBACK (Caso configurado) ---
    if ((CONFIG.ai.provider === 'openai' || CONFIG.ai.provider === 'hybrid') && CONFIG.ai.openaiApiKey) {
      try {
        const openaiResult = await this.classifyWithOpenAI(text, contextBundle, providerDeadlineAt);
        if (openaiResult) {
          const validation = aiGuardrails.validateOutput(openaiResult, contextBundle);
          return {
            ...validation.data,
            aiProvider: 'openai',
            aiModel: 'gpt-4o-mini',
            guardrailApplied: validation.sanitized,
          };
        }
      } catch (e) {
        console.warn('[AIService] Erro no LLM OpenAI, utilizando motor heurístico:', e);
      }
    }

    // --- 6. MOTOR HEURÍSTICO DETERMINÍSTICO (Resiliência 100% Offline / Fallback) ---
    const heuristicResult = this.classifyHeuristic(text.toLowerCase(), contextBundle);
    return {
      ...heuristicResult,
      aiProvider: 'heuristic',
      aiModel: 'dbs-rules-v2',
      guardrailApplied: false,
    };
  }

  /**
   * Motor de Regras e NLP Determinístico de Alta Precisão (Fallback)
   */
  private classifyHeuristic(text: string, contextBundle?: IXCContextBundle): AIClassificationResult {
    const firstName = contextBundle?.client?.firstName || 'Cliente';

    // --- A. FINANCEIRO ---
    const financialKeywords = [
      'boleto', 'fatura', 'segunda via', '2 via', '2a via', 'segunda-via',
      'código de barras', 'codigo de barras', 'linha digitável', 'linha digitavel',
      'pix', 'pagar', 'pagamento', 'vencimento', 'venceu', 'débito', 'debito',
      'conta', 'valor da fatura', 'extrato', 'comprovante'
    ];
    if (financialKeywords.some((kw) => text.includes(kw))) {
      let friendlyMessage = `Localizei as informações da sua conta no IXC, ${firstName}.`;
      if (contextBundle?.financial.hasOpenInvoices && contextBundle.financial.invoices.length > 0) {
        const inv = contextBundle.financial.invoices[0];
        friendlyMessage = `Localizei sua fatura no valor de **${inv.valor}** com vencimento em **${inv.vencimento}**.\n\nVocê pode copiar a linha digitável ou chave PIX abaixo para efetuar o pagamento:`;
      } else if (contextBundle && contextBundle.financial.status === 'AVAILABLE' && !contextBundle.financial.hasOpenInvoices) {
        friendlyMessage = `Consultei o sistema no IXC e você não possui faturas em aberto no momento! Sua conta está 100% em dia com a DBS Telecom. 🌟`;
      }

      return {
        department: 'FINANCEIRO',
        confidence: 0.98,
        intent: 'CONSULTA_FATURA_BOLETO',
        friendlyMessage,
        extractedData: { invoiceRequested: true },
        suggestedAction: 'GET_INVOICE',
      };
    }

    // --- B. SUPORTE TÉCNICO ---
    const supportKeywords = [
      'lenta', 'lento', 'lentidão', 'lentidao', 'caiu', 'queda', 'sem internet',
      'não funciona', 'nao funciona', 'travando', 'sem sinal', 'luz vermelha',
      'los', 'pon', 'roteador', 'reiniciar', 'reiniciei', 'problema na internet',
      'conexão ruim', 'conexao ruim', 'sem conexão', 'sem conexao', 'suporte',
      'assistência', 'assistencia', 'visita técnica', 'visita tecnica', 'chamado'
    ];
    if (supportKeywords.some((kw) => text.includes(kw))) {
      return {
        department: 'SUPORTE',
        confidence: 0.97,
        intent: 'PROBLEMA_CONEXAO_LENTIDAO',
        friendlyMessage: `Olá, ${firstName}! Entendi que você está enfrentando problemas com sua conexão. Vou te encaminhar para o nosso setor de **Suporte** e realizar algumas verificações rápidas.`,
        extractedData: { slownessReported: true },
        suggestedAction: 'START_DIAGNOSTIC',
      };
    }

    // --- C. COMERCIAL & SCRIPT DE VENDAS ---
    // Objeção: Vou pensar
    if (text.includes('pensar') || text.includes('vou ver')) {
      return {
        department: 'COMERCIAL',
        confidence: 0.95,
        intent: 'OBJECAO_VOU_PENSAR',
        friendlyMessage: `Entendo perfeitamente, ${firstName}! Só lembrando que fechando agora com a DBS TELECOM, sua instalação é 100% gratuita no plano fidelidade e já garantimos o valor promocional na agenda desta semana.`,
        extractedData: { objectionType: 'pensar' },
        suggestedAction: 'HANDLE_OBJECTION',
      };
    }
    // Objeção: Está caro
    if (text.includes('caro') || text.includes('desconto') || text.includes('muito alto')) {
      return {
        department: 'COMERCIAL',
        confidence: 0.95,
        intent: 'OBJECAO_ESTA_CARO',
        friendlyMessage: `Compreendo sua preocupação com o orçamento! Temos opções com ótimo custo-benefício como o plano Seja DBS 400MB por R$ 109,90 e descontos de pontualidade no dia 10!`,
        extractedData: { objectionType: 'caro' },
        suggestedAction: 'HANDLE_OBJECTION',
      };
    }
    // Objeção: Vou fechar depois
    if (text.includes('depois') || text.includes('outro dia') || text.includes('mais tarde')) {
      return {
        department: 'COMERCIAL',
        confidence: 0.95,
        intent: 'OBJECAO_FECHAR_DEPOIS',
        friendlyMessage: `Perfeito, ${firstName}! Mas vale ressaltar que a agenda de instalação com taxa zero é limitada. Se confirmarmos agora, agendamos sua instalação para amanhã e você só começa a pagar no próximo mês!`,
        extractedData: { objectionType: 'depois' },
        suggestedAction: 'HANDLE_OBJECTION',
      };
    }
    // Indicação
    if (text.includes('indicação') || text.includes('indicacao') || text.includes('indicar')) {
      return {
        department: 'COMERCIAL',
        confidence: 0.95,
        intent: 'INCENTIVO_INDICACAO',
        friendlyMessage: `E tem uma vantagem exclusiva: indicando um amigo ou vizinho que feche com a DBS TELECOM, você ganha 50% de desconto na sua próxima mensalidade!`,
        extractedData: { objectionType: 'indicacao' },
        suggestedAction: 'HANDLE_OBJECTION',
      };
    }

    // Extração de quantidade de aparelhos
    const deviceMatch = text.match(/(\d+)\s*(aparelhos|dispositivos|celulares|tvs|pessoas)/);
    const devicesCount = deviceMatch ? parseInt(deviceMatch[1], 10) : undefined;
    const wantsWifi6 = text.includes('wifi 6') || text.includes('wifi6') || text.includes('wi-fi 6');

    const commercialKeywords = [
      'plano', 'planos', 'contratar', 'assinar', 'contratação', 'contratacao',
      'preço', 'preco', 'quanto custa', 'velocidade', 'mega', 'giga', 'gb', 'mb',
      'wifi 6', 'wifi-6', 'wi-fi', 'upgrade', 'mudar plano', 'aumentar velocidade',
      'promoção', 'promocao', 'vendedor', 'comercial', 'comprar'
    ];

    if (commercialKeywords.some((kw) => text.includes(kw)) || devicesCount !== undefined) {
      let friendlyMessage = `Vou encaminhar você para o nosso setor **Comercial** da DBS Telecom para apresentar nossas melhores opções de ultravelocidade!`;
      if (devicesCount && devicesCount > 8) {
        friendlyMessage = `Para uma casa com ${devicesCount} aparelhos, recomendo fortemente nossos planos com **Wi-Fi 6 (802.11ax)**. Eles garantem ultra estabilidade sem interferências!`;
      } else if (devicesCount && devicesCount <= 4) {
        friendlyMessage = `Para até ${devicesCount} aparelhos, o plano **Ideal DBS 500MB** (R$ 119,90 com pontualidade) é perfeito e econômico!`;
      }

      return {
        department: 'COMERCIAL',
        confidence: 0.96,
        intent: 'CONSULTA_CONTRATACAO_PLANOS',
        friendlyMessage,
        extractedData: { devicesCount, wantsWifi6 },
        suggestedAction: 'SHOW_PLANS',
      };
    }

    // --- D. GERAL / SAUDAÇÃO ---
    return {
      department: 'GERAL',
      confidence: 0.85,
      intent: 'SAUDACAO_GERAL',
      friendlyMessage: `Olá, ${firstName}! Sou o assistente virtual da **DBS TELECOM**. Como posso te ajudar hoje?`,
      suggestedAction: 'NONE',
    };
  }

  /**
   * Chamada de fallback à API da OpenAI (caso configurada)
   */
  private async classifyWithOpenAI(
    message: string,
    contextBundle?: IXCContextBundle,
    deadlineAt = Date.now() + AI_PROVIDER_DEADLINE_MS
  ): Promise<AIOutputData | null> {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) return null;

    const formattedContext = contextBundle ? ixcContextBuilder.formatContextForPrompt(contextBundle) : '';
    const systemPrompt = `Você é o assistente virtual inteligente da DBS TELECOM. Analise a mensagem e retorne um JSON estrito no formato do schema.
Contexto IXC:
${formattedContext}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${CONFIG.ai.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(Math.min(4500, remainingMs)),
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message },
        ],
        response_format: { type: 'json_object' },
        temperature: CONFIG.ai.temperature,
      }),
    });

    if (res.ok) {
      const data: any = await res.json();
      return JSON.parse(data.choices[0].message.content);
    }

    return null;
  }
}

export const aiService = new AIService();
