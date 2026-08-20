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
      let friendlyMessage = `Consultei o sistema IXC da DBS Telecom para verificar suas faturas, ${firstName}.`;
      if (contextBundle?.financial.hasOpenInvoices && contextBundle.financial.invoices.length > 0) {
        const inv = contextBundle.financial.invoices[0];
        friendlyMessage = `Localizei sua fatura no valor de **${inv.valor}** com vencimento em **${inv.vencimento}**, ${firstName}.\n\nVocê pode copiar a linha digitável ou chave PIX abaixo para efetuar o pagamento com facilidade:`;
      } else if (contextBundle && !contextBundle.financial.hasOpenInvoices) {
        friendlyMessage = `Consultei nosso sistema no IXC e você não possui faturas em aberto no momento, ${firstName}! Sua conexão está 100% em dia com a DBS Telecom. 🌟`;
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
        friendlyMessage: `Entendi a sua solicitação, ${firstName}. Vou registrar a abertura do chamado técnico sobre "${subject}" para nossa equipe de suporte analisar com prioridade.`,
        suggestedAction: 'START_DIAGNOSTIC',
      };
    }

    case 'unblockPromise': {
      return {
        department: 'FINANCEIRO',
        confidence: 0.99,
        intent: 'DESBLOQUEIO_CONFIANCA_FUNCTION',
        friendlyMessage: `Vou processar o seu Desbloqueio em Confiança (Promessa de Pagamento) por 72 horas para liberar a sua conexão imediatamente, ${firstName}!`,
        suggestedAction: 'NONE',
      };
    }

    case 'startDiagnostic': {
      return {
        department: 'SUPORTE',
        confidence: 0.98,
        intent: 'DIAGNOSTICO_CONEXAO_FUNCTION',
        friendlyMessage: `Olá, ${firstName}! Vamos iniciar o diagnóstico guiado para verificar o status dos seus equipamentos e da sua fibra ótica.`,
        extractedData: {
          slownessReported: true,
        },
        suggestedAction: 'START_DIAGNOSTIC',
      };
    }

    case 'showPlans': {
      const wantsWifi6 = args.category === 'WIFI6';
      let friendlyMessage = `Apresento a seguir nossos planos oficiais de fibra ótica DBS Telecom com instalação gratuita e alta velocidade!`;
      if (wantsWifi6) {
        friendlyMessage = `Para máxima cobertura e sem travamentos, recomendo nossos planos com tecnologia **Wi-Fi 6 (802.11ax)**!`;
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
    this.modelName = CONFIG.ai.geminiModel || 'gemini-3.6-flash';
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
   * Constrói o System Prompt institucional da DBS Telecom com injeção de contexto IXC e Guardrails
   */
  private buildSystemPrompt(contextBundle?: IXCContextBundle): string {
    const formattedContext = contextBundle ? ixcContextBuilder.formatContextForPrompt(contextBundle) : '';

    return `Você é o Assistente Virtual Inteligente oficial da DBS TELECOM (Operadora de Telecomunicações autorizada pela ANATEL).
Seu papel é atender os clientes com máxima cordialidade, empatia, precisão técnica e comercial, seguindo a identidade e os manuais oficiais da empresa.

=== DADOS INSTITUCIONAIS DA DBS TELECOM ===
- Slogan: "A Internet que você merece!"
- Central de Atendimento: 0800-765-5567
- Site Oficial: www.dbstelecom.com.br
- Sede: Rua Sebastianinha Silvana, 567 - Centro, Santo Antônio da Barra - GO, 75935-000

=== DIRETRIZES DE ATENDIMENTO E FERRAMENTAS DISPONÍVEIS ===
Você possui ferramentas nativas (Function Calling) que devem ser acionadas quando apropriado:
- getInvoices: Para consultar débitos e 2ª via de faturas.
- createTicket: Para registrar ordens de serviço / chamados.
- unblockPromise: Para desbloquear sinal em confiança (72h).
- startDiagnostic: Para iniciar diagnóstico técnico de conexão.
- showPlans: Para apresentar os planos de fibra ótica e Wi-Fi 6.

=== REGRAS RÍGIDAS DE ESCOPO (ANTI-ABUSE & FORA DE ESCOPO) ===
- Você atende EXCLUSIVAMENTE sobre serviços da DBS TELECOM.
- NUNCA invente faturas ou dados bancários fictícios.

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
      'gemini-3.6-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
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
   * ⚡ Streaming de Respostas consumindo SSE (streamGenerateContent?alt=sse) do Google Gemini
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
      'gemini-3.6-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
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
            generationConfig: {
              temperature: CONFIG.ai.temperature,
              responseMimeType: 'application/json',
            },
          }),
        });

        if (!res.ok || !res.body) {
          continue;
        }

        let accumulatedFullText = '';
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
            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6).trim();
              if (jsonStr === '[DONE]') continue;
              try {
                const parsedChunk = JSON.parse(jsonStr);
                const partText = parsedChunk.candidates?.[0]?.content?.parts?.[0]?.text;
                if (partText) {
                  accumulatedFullText += partText;
                  onChunk(partText);
                }
              } catch (e) {
                // ignore SSE malformed line
              }
            }
          }
        }

        if (accumulatedFullText) {
          const parsed = JSON.parse(cleanJsonText(accumulatedFullText));
          return AIOutputSchema.parse(parsed);
        }
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
      'gemini-3.6-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
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
