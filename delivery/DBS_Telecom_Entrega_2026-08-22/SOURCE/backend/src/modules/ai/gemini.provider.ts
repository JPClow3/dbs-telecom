import { GoogleGenAI } from '@google/genai';
import { CONFIG } from '../../config/env.js';
import { AIOutputData, AIOutputSchema } from './ai.guardrails.js';
import { IXCContextBundle, ixcContextBuilder } from './ixc-context.builder.js';

export interface GeminiClassificationRequest {
  message: string;
  clientId?: string;
  contextBundle?: IXCContextBundle;
  conversationHistory?: Array<{ sender: string; text: string }>;
}

export interface GeminiAudioRequest {
  audioBase64: string;
  mimeType: string;
  clientId?: string;
  contextBundle?: IXCContextBundle;
}

export interface GeminiAudioResponse {
  transcript: string;
  aiOutput: AIOutputData;
}

/**
 * Limites de saída para conter gerações descontroladas (custo de IA) sem
 * degradar a qualidade conversacional: respostas de atendimento são curtas e
 * estruturadas; o JSON de classificação/áudio precisa de mais headroom para
 * caber o schema completo.
 */
const MAX_OUTPUT_TOKENS_CONVERSATIONAL = 1024;
const MAX_OUTPUT_TOKENS_STRUCTURED_JSON = 2048;

function cleanJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  return trimmed;
}

export interface GeminiFunctionCall {
  name: string;
  args: Record<string, any>;
}

export const GEMINI_TOOLS = [
  {
    functionDeclarations: [
      {
        name: 'getInvoices',
        description: 'Consulta as faturas, boletos e débitos em aberto do cliente da DBS Telecom no sistema ERP IXC Soft.',
        parameters: {
          type: 'OBJECT',
          properties: {
            clientId: {
              type: 'STRING',
              description: 'ID cadastral do cliente no sistema IXC Soft da DBS Telecom.',
            },
          },
          required: ['clientId'],
        },
      },
      {
        name: 'createTicket',
        description: 'Abre um chamado técnico ou ordem de serviço de suporte para verificação da conexão ou visita técnica no IXC Soft.',
        parameters: {
          type: 'OBJECT',
          properties: {
            clientId: {
              type: 'STRING',
              description: 'ID do cliente solicitante.',
            },
            subject: {
              type: 'STRING',
              description: 'Assunto resumido do chamado técnico (ex: Sem conexão de internet, Lentidão fibra ótica).',
            },
            message: {
              type: 'STRING',
              description: 'Descrição detalhada dos sintomas informados pelo cliente e testes realizados.',
            },
          },
          required: ['clientId', 'subject', 'message'],
        },
      },
      {
        name: 'unblockPromise',
        description: 'Executa o desbloqueio em confiança (promessa de pagamento) por 72 horas para restabelecer o sinal da conexão de internet suspensa por débito.',
        parameters: {
          type: 'OBJECT',
          properties: {
            clientId: {
              type: 'STRING',
              description: 'ID do cliente para efetuar a liberação temporária.',
            },
            contractId: {
              type: 'STRING',
              description: 'ID do contrato associado à conexão (opcional).',
            },
          },
          required: ['clientId'],
        },
      },
      {
        name: 'startDiagnostic',
        description: 'Inicia o protocolo de diagnóstico guiado de 3 etapas para identificar e resolver problemas de conexão, lentidão, queda de sinal ou roteador.',
        parameters: {
          type: 'OBJECT',
          properties: {
            clientId: {
              type: 'STRING',
              description: 'ID do cliente.',
            },
          },
          required: ['clientId'],
        },
      },
      {
        name: 'showPlans',
        description: 'Apresenta o catálogo oficial de planos de ultravelocidade em fibra ótica e tecnologia Wi-Fi 6 (802.11ax) da DBS Telecom.',
        parameters: {
          type: 'OBJECT',
          properties: {
            category: {
              type: 'STRING',
              enum: ['URBANO', 'WIFI6'],
              description: 'Categoria de planos a ser exibida (URBANO para planos padrão ou WIFI6 para planos com roteador Wi-Fi 6).',
            },
          },
        },
      },
    ],
  },
];

export function handleFunctionCall(
  functionCall: GeminiFunctionCall,
  contextBundle?: IXCContextBundle
): AIOutputData {
  const firstName = contextBundle?.client?.firstName || 'Cliente';
  const name = functionCall.name;
  const args = functionCall.args || {};

  switch (name) {
    case 'getInvoices': {
      let friendlyMessage = `Consultei o sistema da DBS Telecom para verificar suas faturas, ${firstName}.`;
      if (contextBundle?.financial.hasOpenInvoices && contextBundle.financial.invoices.length > 0) {
        const inv = contextBundle.financial.invoices[0];
        friendlyMessage = `Localizei sua fatura no valor de **${inv.valor}** com vencimento em **${inv.vencimento}**, ${firstName}.\n\nVocê pode copiar a chave PIX ou a linha digitável abaixo para efetuar o pagamento em instantes com toda comodidade:`;
      } else if (contextBundle && !contextBundle.financial.hasOpenInvoices) {
        friendlyMessage = `Consultei nosso sistema no IXC e você está com todas as contas em dia, ${firstName}! Não há nenhuma fatura pendente no momento. Muito obrigado pela parceria com a DBS Telecom! 🌟`;
      }

      return {
        department: 'FINANCEIRO',
        confidence: 0.99,
        intent: 'CONSULTA_FATURA_FUNCTION',
        friendlyMessage,
        extractedData: {
          invoiceRequested: true,
        },
        suggestedAction: 'GET_INVOICE',
      };
    }

    case 'createTicket': {
      const subject = args.subject || 'Atendimento técnico';
      return {
        department: 'SUPORTE',
        confidence: 0.98,
        intent: 'ABERTURA_CHAMADO_FUNCTION',
        friendlyMessage: `Compreendido, ${firstName}! Registrei a abertura da sua Ordem de Serviço sobre "${subject}". Nossa equipe de suporte especializado já recebeu seus dados para dar prioridade ao seu atendimento.`,
        suggestedAction: 'START_DIAGNOSTIC',
      };
    }

    case 'unblockPromise': {
      return {
        department: 'FINANCEIRO',
        confidence: 0.99,
        intent: 'DESBLOQUEIO_CONFIANCA_FUNCTION',
        friendlyMessage: `Perfeito, ${firstName}! Estou ativando agora o seu **Desbloqueio em Confiança (Promessa de Pagamento)** por 72 horas para que sua conexão seja restabelecida de imediato.`,
        suggestedAction: 'NONE',
      };
    }

    case 'startDiagnostic': {
      return {
        department: 'SUPORTE',
        confidence: 0.98,
        intent: 'DIAGNOSTICO_CONEXAO_FUNCTION',
        friendlyMessage: `Olá, ${firstName}! Vamos fazer um diagnóstico rápido da sua conexão para identificar e corrigir qualquer oscilação no seu sinal ou equipamentos.`,
        extractedData: {
          slownessReported: true,
        },
        suggestedAction: 'START_DIAGNOSTIC',
      };
    }

    case 'showPlans': {
      const wantsWifi6 = args.category === 'WIFI6';
      let friendlyMessage = `Apresento a seguir nossos planos oficiais de fibra ótica DBS Telecom com ultravelocidade e instalação gratuita no plano fidelidade:`;
      if (wantsWifi6) {
        friendlyMessage = `Para máxima estabilidade, menor latência e dezenas de aparelhos sem travamentos, recomendo nossos planos com a tecnologia **Wi-Fi 6 (802.11ax)**!`;
      }
      return {
        department: 'COMERCIAL',
        confidence: 0.98,
        intent: 'CONSULTA_PLANOS_FUNCTION',
        friendlyMessage,
        extractedData: {
          wantsWifi6,
        },
        suggestedAction: 'SHOW_PLANS',
      };
    }

    default: {
      return {
        department: 'GERAL',
        confidence: 0.9,
        intent: `TOOL_${name.toUpperCase()}`,
        friendlyMessage: `Processando sua solicitação com a equipe da DBS Telecom, ${firstName}.`,
        suggestedAction: 'NONE',
      };
    }
  }
}

export class GeminiProvider {
  private client: GoogleGenAI | null = null;
  private modelName: string;

  constructor() {
    this.modelName = CONFIG.ai.geminiModel || 'gemini-2.5-flash';
    if (CONFIG.ai.geminiApiKey) {
      try {
        this.client = new GoogleGenAI({ apiKey: CONFIG.ai.geminiApiKey });
      } catch (err) {
        console.warn('[GeminiProvider] Falha ao inicializar SDK GoogleGenAI:', err);
      }
    }
  }

  /**
   * Verifica se o Gemini está disponível e com chave configurada
   */
  isConfigured(): boolean {
    return Boolean(CONFIG.ai.geminiApiKey && CONFIG.ai.geminiApiKey.trim().length > 5);
  }

  /**
   * Constrói o System Prompt institucional da DBS Telecom com a persona Davi e injeção de contexto IXC
   */
  private buildSystemPrompt(contextBundle?: IXCContextBundle): string {
    const formattedContext = contextBundle ? ixcContextBuilder.formatContextForPrompt(contextBundle) : '';
    const firstName = contextBundle?.client?.firstName || 'Cliente';

    return `Você é o DAVI, especialista e consultor digital de atendimento da DBS TELECOM (Operadora de Telecomunicações autorizada pela ANATEL).
Seu compromisso é prestar um atendimento humano, empático, altamente resolutivo, acolhedor e ágil, como um verdadeiro especialista da empresa conversando com o cliente pelo aplicativo ou WhatsApp.

=== IDENTIDADE & PERSONALIDADE DE DAVI ===
- Nome: Davi
- Cargo: Consultor e Especialista Digital de Atendimento DBS Telecom
- Tom de Voz: Empático, prestativo, educado, seguro, acolhedor e natural (Português do Brasil contemporâneo).
- Jamais seja robótico, frio ou use jargões burocráticos como "Prezado cliente, sua solicitação foi recebida". Trate o cliente pelo primeiro nome (${firstName}) de forma afetuosa e respeitosa.

=== PRINCÍPIOS DE ACOLHIMENTO E INTELIGÊNCIA EMOCIONAL ===
1. ESCUTA ATIVA & EMPATIA IMEDIATA:
   - Se o cliente relatar que a internet caiu, está lenta ou que precisa trabalhar/estudar/jogar, reconheça a importância da conexão de imediato antes de qualquer coisa ("Poxa, sinto muito por isso! Sei o quanto a internet é fundamental para o seu dia a dia e para o seu trabalho. Fica tranquilo que vou te ajudar a verificar agora mesmo!").
   - Se o cliente estiver irritado ou impaciente, acolha com serenidade, valide o incômodo e mostre que você está ao lado dele para resolver.

2. DIDÁTICA SIMPLES & SEM JARGÕES COMPLEXOS:
   - Ao orientar sobre equipamentos, seja claro e didático:
     • Luzes do roteador: "Luz PON (sinal da fibra) e Internet devem estar verdes fixas. Se a luz LOS estiver vermelha ou piscando, significa que o sinal do cabo ótico está com interrupção."
     • Diferença Wi-Fi 2.4 GHz vs 5 GHz: "A rede 2.4G vai mais longe e atravessa paredes, enquanto a 5G entrega a velocidade máxima da sua fibra bem pertinho do roteador."
     • Wi-Fi 6 (802.11ax): "Tecnologia de ponta que permite dezenas de aparelhos conectados ao mesmo tempo sem travar, com menos interferência e menor tempo de resposta (ping)."
     • Ping / Latência: "É o tempo de resposta da internet. Quanto mais baixo o ping em milissegundos (ms), mais lisa fica a partida nos jogos online e chamadas de vídeo."

3. CLAREZA FINANCEIRA & TRANSPARÊNCIA:
   - Apresente débitos com clareza, informando valor, vencimento e o desconto especial de pontualidade no dia 10.
   - Ofereça facilidades imediatas: cópia da chave PIX em 1 clique, linha digitável e PDF oficial do boleto.
   - Em caso de bloqueio por fatura pendente, lembre com simpatia sobre o "Desbloqueio em Confiança (Promessa de Pagamento por 72h)" para liberação instantânea do sinal.

4. DIRETRIZES COMERCIAIS & INDIQUE E GANHE:
   - Seja consultivo: entenda a quantidade de aparelhos ou o perfil de uso (jogos, filmes 4K, home office) antes de sugerir planos.
   - Apresente planos com instalação 100% gratuita na contratação com fidelidade de 12 meses.
   - Lembre o cliente do programa "Indique e Ganhe": ao indicar um amigo que assine a DBS, ele ganha 50% de desconto na mensalidade seguinte.

=== DADOS INSTITUCIONAIS DA DBS TELECOM ===
- Slogan: "A Internet que você merece!"
- Central de Atendimento Telefônico: 0800-765-5567
- Site Oficial: www.dbstelecom.com.br
- Sede: Rua Sebastianinha Silvana, 567 - Centro, Santo Antônio da Barra - GO, 75935-000

=== FERRAMENTAS DISPONÍVEIS (FUNCTION CALLING) ===
Acione a ferramenta correta sempre que a intenção for clara:
- getInvoices: Para consultar faturas e débitos em aberto.
- createTicket: Para registrar chamado técnico / ordem de serviço.
- unblockPromise: Para processar desbloqueio em confiança por 72 horas.
- startDiagnostic: Para iniciar diagnóstico guiado da conexão.
- showPlans: Para exibir catálogo de planos de fibra e Wi-Fi 6.

=== REGRAS DE SEGURANÇA & ESCOPO ===
- Atenda exclusivamente a assuntos relacionados à DBS Telecom (fibra ótica, Wi-Fi, faturas, suporte, planos, atendimento).
- NUNCA invente números de cartão de crédito, contas bancárias não oficiais ou dados fora do sistema IXC.

=== CONTEXTO EM TEMPO REAL DA BASE ERP IXC SOFT ===
${formattedContext}`;
  }

  /**
   * Mapeia o histórico da conversa para o formato estrito de turnos alternados da API do Gemini
   */
  formatGeminiContents(
    currentMessage: string,
    history?: Array<{ sender: string; text: string }>
  ): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    if (history && history.length > 0) {
      const recent = history.slice(-12);

      for (const msg of recent) {
        const text = (msg.text || '').trim();
        if (!text) continue;

        const role: 'user' | 'model' = msg.sender.toUpperCase() === 'USER' ? 'user' : 'model';
        const lastTurn = contents[contents.length - 1];

        if (lastTurn && lastTurn.role === role) {
          lastTurn.parts[0].text += `\n${text}`;
        } else {
          if (contents.length === 0 && role === 'model') {
            continue;
          }
          contents.push({
            role,
            parts: [{ text }],
          });
        }
      }
    }

    const currentUserTurnText = `<user_message>\n${currentMessage.trim()}\n</user_message>`;

    if (contents.length > 0) {
      const lastTurn = contents[contents.length - 1];
      if (lastTurn.role === 'user') {
        lastTurn.parts[0].text = `${lastTurn.parts[0].text}\n\n${currentUserTurnText}`;
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: currentUserTurnText }],
        });
      }
    } else {
      contents.push({
        role: 'user',
        parts: [{ text: currentUserTurnText }],
      });
    }

    return contents;
  }

  /**
   * Processa a mensagem do cliente no Google Gemini via Google AI Studio REST API com Function Calling nativo e failover
   */
  async generateResponse(req: GeminiClassificationRequest): Promise<AIOutputData | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const systemPrompt = this.buildSystemPrompt(req.contextBundle);
    const contents = this.formatGeminiContents(req.message, req.conversationHistory);

    const candidateModels = [
      CONFIG.ai.geminiModel,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash-lite',
    ].filter(Boolean) as string[];

    const uniqueModels = Array.from(new Set(candidateModels));

    for (const model of uniqueModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.ai.geminiApiKey}`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(4500),
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents,
            tools: GEMINI_TOOLS,
            generationConfig: {
              temperature: CONFIG.ai.temperature,
              maxOutputTokens: MAX_OUTPUT_TOKENS_CONVERSATIONAL,
            },
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.warn(`[GeminiProvider] Modelo ${model} retornou ${res.status}, tentando próximo:`, errText.slice(0, 120));
          continue;
        }

        const data: any = await res.json();
        const candidateParts = data.candidates?.[0]?.content?.parts || [];

        // 1. Verifica se o modelo acionou uma Function Call nativa
        for (const part of candidateParts) {
          if (part.functionCall) {
            return handleFunctionCall(part.functionCall, req.contextBundle);
          }
        }

        // 2. Se retornou texto/JSON puro
        const candidateText = candidateParts[0]?.text;
        if (candidateText) {
          try {
            const parsed = JSON.parse(cleanJsonText(candidateText));
            return AIOutputSchema.parse(parsed);
          } catch {
            return {
              department: 'GERAL',
              confidence: 0.9,
              intent: 'RESPOSTA_ASSISTENTE',
              friendlyMessage: candidateText.trim(),
              suggestedAction: 'NONE',
            };
          }
        }
      } catch (err: any) {
        console.warn(`[GeminiProvider] Falha no modelo ${model}, tentando próximo:`, err?.message || err);
      }
    }

    return null;
  }

  /**
   * ⚡ Streaming de Respostas consumindo SSE (streamGenerateContent?alt=sse) do Google Gemini.
   *
   * O contrato deste provedor é um JSON de classificação (AIOutputSchema), NÃO
   * prosa conversacional. Os fragmentos brutos do stream são pedaços do JSON —
   * encaminhá-los ao cliente como se fossem texto exibível seria desonesto.
   * Portanto o stream é consumido de verdade (primeiro token chega cedo, sem
   * esperar a resposta inteira num único bloco), os fragmentos são acumulados
   * internamente e apenas o resultado validado pelo guardrail é devolvido.
   */
  async generateResponseStream(
    req: GeminiClassificationRequest,
    onChunk: (chunkText: string) => void
  ): Promise<AIOutputData | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const systemPrompt = this.buildSystemPrompt(req.contextBundle);
    const contents = this.formatGeminiContents(req.message, req.conversationHistory);

    const candidateModels = [
      CONFIG.ai.geminiModel,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash-lite',
    ].filter(Boolean) as string[];

    const uniqueModels = Array.from(new Set(candidateModels));

    for (const model of uniqueModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${CONFIG.ai.geminiApiKey}`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(4500),
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents,
            tools: GEMINI_TOOLS,
            generationConfig: {
              temperature: CONFIG.ai.temperature,
              maxOutputTokens: MAX_OUTPUT_TOKENS_CONVERSATIONAL,
            },
          }),
        });

        if (!res.ok || !res.body) {
          continue;
        }

        let accumulatedFullText = '';
        let sawFunctionCall: GeminiFunctionCall | null = null;
        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
              const parsedChunk = JSON.parse(jsonStr);
              for (const part of parsedChunk.candidates?.[0]?.content?.parts || []) {
                if (part.functionCall && !sawFunctionCall) {
                  sawFunctionCall = part.functionCall;
                }
                if (part.text) {
                  accumulatedFullText += part.text;
                }
              }
              // Fragmentos de JSON não são texto exibível: nada vai ao cliente
              // aqui — apenas acumulado para o parse final honesto.
            } catch (e) {
              // ignore SSE malformed line
            }
          }

          if (sawFunctionCall) break; // tool call completa chegou; interrompe consumo
        }

        if (sawFunctionCall) {
          return handleFunctionCall(sawFunctionCall, req.contextBundle);
        }

        if (accumulatedFullText) {
          try {
            const parsed = JSON.parse(cleanJsonText(accumulatedFullText));
            return AIOutputSchema.parse(parsed);
          } catch {
            // JSON incompleto/corrompido no stream: NUNCA vazar fragmentos ao
            // cliente; trata como falha e deixa o fallback resolver.
            console.warn('[GeminiProvider] Stream retornou JSON inválido/incompleto; usando fallback.');
          }
        }

        void onChunk; // assinatura preservada para compatibilidade
      } catch (err) {
        console.warn(`[GeminiProvider] Stream failed on model ${model}:`, err);
      }
    }

    // Se o stream do Gemini falhou ou não retornou, fallback para generateResponse
    return this.generateResponse(req);
  }

  /**
   * 🎙️ Processamento Multimodal de Áudio com Google Gemini (Transcrição + Classificação e Resposta)
   */
  async processAudioMessage(req: GeminiAudioRequest): Promise<GeminiAudioResponse | null> {
    if (!this.isConfigured()) {
      return null;
    }

    const systemPrompt = this.buildSystemPrompt(req.contextBundle);
    const audioPrompt = `Ouça atentamente a mensagem de voz do cliente da DBS Telecom enviada em anexo.
1. Transcreva com máxima fidelidade tudo o que foi falado pelo cliente em Português do Brasil. Se o áudio não contiver fala humana reconhecível (for apenas silêncio, tom puro, ruído ou inaudível), defina o campo "transcript" como "[Áudio inaudível / ruído]".
2. Analise e classifique a solicitação do cliente segundo as diretrizes oficiais da DBS Telecom.
3. Retorne EXCLUSIVAMENTE um JSON válido com o campo "transcript" contendo a transcrição exata e os demais campos do schema:
{
  "transcript": "Transcrição do que o usuário falou",
  "department": "COMERCIAL" | "SUPORTE" | "FINANCEIRO" | "GERAL",
  "confidence": 0.98,
  "intent": "string descritiva da intenção",
  "friendlyMessage": "Resposta humanizada para o cliente",
  "extractedData": {
    "devicesCount": null,
    "wantsWifi6": false,
    "objectionType": null,
    "invoiceRequested": false,
    "slownessReported": false
  },
  "suggestedAction": "START_DIAGNOSTIC" | "GET_INVOICE" | "SHOW_PLANS" | "HANDLE_OBJECTION" | "NONE"
}`;

    // Normalização de mimeType para a API do Gemini
    let normalizedMimeType = (req.mimeType || 'audio/webm').split(';')[0].trim().toLowerCase();
    if (normalizedMimeType === 'audio/m4a' || normalizedMimeType === 'audio/x-m4a') {
      normalizedMimeType = 'audio/mp4';
    }

    const candidateModels = [
      CONFIG.ai.geminiModel,
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-2.0-flash-lite',
    ].filter(Boolean) as string[];

    const uniqueModels = Array.from(new Set(candidateModels));

    for (const model of uniqueModels) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${CONFIG.ai.geminiApiKey}`;

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(6000),
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }],
            },
            contents: [
              {
                role: 'user',
                parts: [
                  {
                    inlineData: {
                      mimeType: normalizedMimeType,
                      data: req.audioBase64,
                    },
                  },
                  {
                    text: audioPrompt,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json',
              maxOutputTokens: MAX_OUTPUT_TOKENS_STRUCTURED_JSON,
            },
          }),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.warn(`[GeminiProvider] Áudio no modelo ${model} retornou ${res.status}:`, errText.slice(0, 120));
          continue;
        }

        const data: any = await res.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) {
          const parsed = JSON.parse(cleanJsonText(candidateText));
          const transcript = parsed.transcript || 'Mensagem de voz recebida';
          const aiOutput = AIOutputSchema.parse(parsed);
          return { transcript, aiOutput };
        }
      } catch (err: any) {
        console.warn(`[GeminiProvider] Falha no processamento de áudio com modelo ${model}:`, err?.message || err);
      }
    }

    return null;
  }
}

export const geminiProvider = new GeminiProvider();
