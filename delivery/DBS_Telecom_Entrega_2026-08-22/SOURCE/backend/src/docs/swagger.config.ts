export const swaggerDocument: Record<string, any> = {
  openapi: '3.0.3',
  info: {
    title: '📱 DBS Telecom — Smart Service BFF & ERP IXC API',
    version: '1.0.0',
    description: `
### Backend for Frontend (BFF) de Atendimento Inteligente DBS Telecom

Este backend integra o aplicativo móvel do cliente com o **ERP IXC Soft WebService v1** e orquestra o motor de **Inteligência Artificial Google Gemini** com **Guardrails de Segurança Multicamadas**.

---

### 🔐 Segurança & Autenticação (Anti-IDOR)
- **Login Inicial:** Autenticação por CPF/CNPJ com senha padrão sendo o próprio CPF (\`/api/auth/login\`).
- **Tokens JWT:** Todas as rotas protegidas exigem o cabeçalho \`Authorization: Bearer <token>\`.
- **Proteção Anti-IDOR (Insecure Direct Object References):** Um cliente autenticado só tem permissão para consultar suas próprias faturas, chamados e dados cadastrais. Tentativas de acesso a dados de outros clientes são bloqueadas com **HTTP 403 Forbidden**.
- **Alias 'me':** Em qualquer endpoint com \`:clientId\`, é permitido utilizar \`/api/financial/invoices/me\` para resolver automaticamente para o cliente autenticado.

---

### 💾 Persistência de Conversas
- Sessões e histórico de mensagens usam **PostgreSQL/Neon** quando DATABASE_URL está configurada. O fallback em memória é exclusivo de testes e desenvolvimento isolado.
    `,
    contact: {
      name: 'Suporte Técnico & Engenharia DBS Telecom',
      url: 'https://dbstelecom.com.br',
      email: 'contato@dbstelecom.com.br',
    },
    license: {
      name: 'MIT',
    },
  },
  servers: [
    {
      url: '/api',
      description: 'Servidor Local da API BFF (Atual)',
    },
    {
      url: 'http://localhost:3000/api',
      description: 'Ambiente de Desenvolvimento Local (Porta 3000)',
    },
  ],
  tags: [
    { name: '🔐 Autenticação & Usuários', description: 'Emissão de JWT, sincronização de usuários IXC e identificação' },
    { name: '💬 Atendimento Inteligente & Chatbot IA', description: 'Orquestração de conversas, Google Gemini, Fast Router e histórico' },
    { name: '💳 Financeiro & Faturas (Anti-IDOR)', description: 'Consulta de faturas, linha digitável, PIX Copia-e-Cola, PDF e desbloqueio em confiança' },
    { name: '🛠️ Suporte Técnico & Diagnóstico (Anti-IDOR)', description: 'Máquina de estados de diagnóstico guiado e Ordens de Serviço (O.S.)' },
    { name: '🚀 Comercial & Planos', description: 'Catálogo de planos de fibra ótica Urbanos e Wi-Fi 6 (802.11ax)' },
    { name: '📊 Tráfego & Consumo de Dados (Anti-IDOR)', description: 'Extrato de download, upload e consumo diário' },
    { name: '🧠 Diagnóstico de IA & Guardrails', description: 'Auditoria de classificação de intenções, contexto RAG e sanitização' },
    { name: '⚡ Sistema & Diagnóstico de Rede', description: 'Healthcheck, medição de latência (ping) e download speedtest' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['⚡ Sistema & Diagnóstico de Rede'],
        summary: 'Healthcheck e status da conexão com IXC e Gemini',
        description: 'Retorna o status operacional do backend BFF, status do ERP IXC e configuração do motor Gemini.',
        responses: {
          '200': {
            description: 'Serviço operacional',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
              },
            },
          },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['🔐 Autenticação & Usuários'],
        summary: 'Autenticação de cliente e emissão de Token JWT (Anti-IDOR)',
        description: 'Autentica o cliente na base IXC (login padrão: CPF / senha: CPF sem pontuação) e emite token JWT com permissões anti-IDOR.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/LoginRequest' },
              example: {
                cpfCnpj: '00000000000',
                password: 'senha-de-exemplo',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Autenticação bem-sucedida com JWT',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/LoginResponse' },
              },
            },
          },
          '400': { description: 'CPF/CNPJ ou login ausente' },
          '401': { description: 'Credenciais inválidas' },
        },
      },
    },
    '/auth/identify': {
      post: {
        tags: ['🔐 Autenticação & Usuários'],
        summary: 'Identificação rápida de cliente por CPF/CNPJ',
        description: 'Busca os dados cadastrais do cliente no IXC pelo CPF/CNPJ (com ou sem pontuação).',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['cpfCnpj'],
                properties: {
                  cpfCnpj: { type: 'string', example: '00000000000' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Cliente localizado no IXC' },
          '404': { description: 'Cliente não encontrado' },
        },
      },
    },
    '/auth/sync-users': {
      post: {
        tags: ['🔐 Autenticação & Usuários'],
        summary: 'Sincronização em lote de usuários IXC (Senha padrão = CPF)',
        responses: {
          '200': { description: 'Usuários sincronizados com sucesso' },
        },
      },
    },
    '/auth/users': {
      get: {
        tags: ['🔐 Autenticação & Usuários'],
        summary: 'Lista todos os usuários sincronizados',
        responses: {
          '200': { description: 'Lista de usuários' },
        },
      },
    },
    '/chat/greeting': {
      post: {
        tags: ['💬 Atendimento Inteligente & Chatbot IA'],
        summary: 'Gera a saudação inicial personalizada com o primeiro nome do IXC',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId'],
                properties: {
                  clientId: { type: 'string', example: '2270' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Mensagem de saudação gerada',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatMessage' },
              },
            },
          },
          '401': { description: 'Token JWT ausente ou inválido' },
          '403': { description: 'Violação Anti-IDOR' },
        },
      },
    },
    '/chat/message': {
      post: {
        tags: ['💬 Atendimento Inteligente & Chatbot IA'],
        summary: 'Envia e processa mensagem no chat com Fast Router, IA Gemini e Guardrails',
        description: 'Processa a mensagem em linguagem natural, roteando para Comercial, Suporte ou Financeiro, com persistência PostgreSQL quando configurada.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  sessionId: { type: 'string', example: 'session-2270-main' },
                  clientId: { type: 'string', example: '2270' },
                  message: { type: 'string', example: 'Preciso da segunda via do meu boleto' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Resposta processada pelo assistente inteligente',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatMessage' },
              },
            },
          },
          '401': { description: 'Token JWT ausente ou inválido' },
          '403': { description: 'Violação Anti-IDOR' },
        },
      },
    },
    '/chat/history/{sessionId}': {
      get: {
        tags: ['💬 Atendimento Inteligente & Chatbot IA'],
        summary: 'Recupera o histórico completo de mensagens persistidas',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'sessionId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: 'session-2270-main',
          },
        ],
        responses: {
          '200': {
            description: 'Histórico de mensagens recuperado da persistência configurada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessionId: { type: 'string' },
                    total: { type: 'number' },
                    history: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/ChatMessage' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Token JWT ausente ou inválido' },
        },
      },
    },
    '/financial/invoices/{clientId}': {
      get: {
        tags: ['💳 Financeiro & Faturas (Anti-IDOR)'],
        summary: 'Consulta faturas e boletos em aberto no IXC (Anti-IDOR)',
        description: 'Retorna as faturas do cliente com Linha Digitável formatada, Código PIX Copia-e-Cola e status. Exige token do próprio cliente ou uso de "me".',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'clientId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: '2270',
            description: 'ID do cliente no IXC ou "me"',
          },
        ],
        responses: {
          '200': {
            description: 'Faturas localizadas no IXC',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'number', example: 1 },
                    invoices: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/FormattedInvoice' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Token JWT ausente ou inválido' },
          '403': { description: 'Acesso negado: Tentativa de acessar faturas de outro cliente (Anti-IDOR)' },
        },
      },
    },
    '/financial/unblock-promise': {
      post: {
        tags: ['💳 Financeiro & Faturas (Anti-IDOR)'],
        summary: 'Desbloqueio em Confiança (Promessa de Pagamento por 72h)',
        description: 'Libera temporariamente o sinal de internet por 72 horas para faturas pendentes, registrando protocolo.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId'],
                properties: {
                  clientId: { type: 'string', example: '2270' },
                  contractId: { type: 'string', example: '2323' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Desbloqueio efetuado com sucesso',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UnblockPromiseResult' },
              },
            },
          },
          '401': { description: 'Token JWT ausente ou inválido' },
          '403': { description: 'Violação Anti-IDOR' },
        },
      },
    },
    '/financial/invoices/{id}/pdf': {
      get: {
        tags: ['💳 Financeiro & Faturas (Anti-IDOR)'],
        summary: 'Download ou visualização em PDF do Boleto Bancário',
        description: 'Gera e serve o arquivo PDF (PDF-1.4) do boleto bancário oficial da DBS Telecom.',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: '145690',
          },
          {
            name: 'clientId',
            in: 'query',
            schema: { type: 'string' },
            example: '2270',
          },
          {
            name: 'download',
            in: 'query',
            schema: { type: 'boolean' },
            example: false,
          },
        ],
        responses: {
          '200': {
            description: 'Arquivo PDF do Boleto Bancário',
            content: {
              'application/pdf': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
    '/support/diagnostic': {
      post: {
        tags: ['🛠️ Suporte Técnico & Diagnóstico (Anti-IDOR)'],
        summary: 'Máquina de estados de pré-diagnóstico guiado de conexão',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['clientId'],
                properties: {
                  clientId: { type: 'string', example: '2270' },
                  userResponse: { type: 'string', example: 'Acontece em todos os aparelhos' },
                  action: { type: 'string', enum: ['start', 'step'], example: 'start' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Etapa atual do diagnóstico' },
          '401': { description: 'Token JWT ausente ou inválido' },
          '403': { description: 'Violação Anti-IDOR' },
        },
      },
    },
    '/support/tickets/{clientId}': {
      get: {
        tags: ['🛠️ Suporte Técnico & Diagnóstico (Anti-IDOR)'],
        summary: 'Central de Ordens de Serviço (O.S.) e Chamados Técnicos (Anti-IDOR)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'clientId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: '2270',
          },
        ],
        responses: {
          '200': {
            description: 'Lista de Ordens de Serviço',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'number', example: 2 },
                    tickets: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/TicketRecord' },
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Token JWT ausente ou inválido' },
          '403': { description: 'Violação Anti-IDOR' },
        },
      },
    },
    '/commercial/plans': {
      get: {
        tags: ['🚀 Comercial & Planos'],
        summary: 'Catálogo de planos de fibra ótica DBS Telecom (Urbanos e Wi-Fi 6)',
        parameters: [
          {
            name: 'type',
            in: 'query',
            schema: { type: 'string', enum: ['URBANO', 'WIFI6'] },
          },
        ],
        responses: {
          '200': {
            description: 'Catálogo de planos',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    plans: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/DBSPlan' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/traffic/consumption/{clientId}': {
      get: {
        tags: ['📊 Tráfego & Consumo de Dados (Anti-IDOR)'],
        summary: 'Extrato de consumo diário de download e upload (Anti-IDOR)',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'clientId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: '2270',
          },
          {
            name: 'days',
            in: 'query',
            schema: { type: 'number' },
            example: 14,
          },
        ],
        responses: {
          '200': {
            description: 'Resumo e gráfico diário de tráfego',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/TrafficConsumptionSummary' },
              },
            },
          },
          '401': { description: 'Token JWT ausente ou inválido' },
          '403': { description: 'Violação Anti-IDOR' },
        },
      },
    },
    '/ai/classify': {
      post: {
        tags: ['🧠 Diagnóstico de IA & Guardrails'],
        summary: 'Auditoria de classificação de intenção e Guardrails',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: {
                  message: { type: 'string', example: 'Quero conhecer os planos Wi-Fi 6' },
                  clientId: { type: 'string', example: '2270' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Resultado da classificação da IA' },
        },
      },
    },
    '/ai/context/{clientId}': {
      get: {
        tags: ['🧠 Diagnóstico de IA & Guardrails'],
        summary: 'Visualização do Bundle de Contexto do IXC construído para o cliente',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'clientId',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: '2270',
          },
        ],
        responses: {
          '200': { description: 'Bundle de contexto formatado para System Prompt' },
          '401': { description: 'Token JWT ausente ou inválido' },
          '403': { description: 'Violação Anti-IDOR' },
        },
      },
    },
    '/system/ping': {
      get: {
        tags: ['⚡ Sistema & Diagnóstico de Rede'],
        summary: 'Endpoint ultra-leve para medição real de latência (Ping e Jitter)',
        responses: {
          '200': { description: 'Pong com timestamp e nó de rede' },
        },
      },
    },
    '/system/speedtest-payload': {
      get: {
        tags: ['⚡ Sistema & Diagnóstico de Rede'],
        summary: 'Payload binário para teste real de velocidade de download',
        parameters: [
          {
            name: 'size',
            in: 'query',
            schema: { type: 'number' },
            example: 1048576,
          },
        ],
        responses: {
          '200': {
            description: 'Stream binário para cálculo de Throughput em Mbps',
            content: {
              'application/octet-stream': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Insira o token JWT gerado pelo endpoint /api/auth/login.',
      },
    },
    schemas: {
      HealthResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'online' },
          system: { type: 'string', example: 'DBS Telecom Smart Service BFF' },
          timestamp: { type: 'string', example: '2026-08-20T00:00:00.000Z' },
          ixcBaseUrl: { type: 'string', example: 'https://demo.ixcsoft.com.br/webservice/v1' },
          ai: {
            type: 'object',
            properties: {
              provider: { type: 'string', example: 'gemini' },
              geminiConfigured: { type: 'boolean', example: true },
              geminiModel: { type: 'string', example: 'modelo-configurado-por-ambiente' },
              guardrailsEnabled: { type: 'boolean', example: true },
              temperature: { type: 'number', example: 0.2 },
            },
          },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['cpfCnpj'],
        properties: {
          cpfCnpj: { type: 'string', example: '00000000000', description: 'Documento de exemplo; não use dados de cliente na documentação' },
          password: { type: 'string', example: 'senha-de-exemplo', description: 'Senha de exemplo; nunca use uma credencial real' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          found: { type: 'boolean', example: true },
          authenticated: { type: 'boolean', example: true },
          token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'Token JWT para autorização' },
          expiresIn: { type: 'string', example: '7d' },
          client: { $ref: '#/components/schemas/Customer' },
          contracts: { type: 'array', items: { type: 'object' } },
        },
      },
      Customer: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '2270' },
          nome: { type: 'string', example: 'Cliente de Exemplo' },
          fantasia: { type: 'string', example: 'Conta de Exemplo' },
          cpfCnpj: { type: 'string', example: '00000000000' },
          email: { type: 'string', example: 'cliente@example.invalid' },
          telefone: { type: 'string', example: '(49) 98877-6655' },
          endereco: { type: 'string', example: 'Av. Brasil, 1500 - Centro, Chapecó' },
        },
      },
      ChatMessage: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'msg-1724123456-abc12' },
          sender: { type: 'string', enum: ['USER', 'BOT', 'SYSTEM'], example: 'BOT' },
          text: { type: 'string', example: 'Olá! Consulte os dados confirmados da sua conta no aplicativo.' },
          timestamp: { type: 'string', example: '2026-08-20T00:00:00.000Z' },
          department: { type: 'string', enum: ['COMERCIAL', 'SUPORTE', 'FINANCEIRO', 'GERAL'], example: 'FINANCEIRO' },
          quickOptions: { type: 'array', items: { type: 'string' } },
          aiProvider: { type: 'string', example: 'gemini' },
          aiModel: { type: 'string', example: 'modelo-configurado-por-ambiente' },
          guardrailApplied: { type: 'boolean', example: false },
          cards: { type: 'object' },
        },
      },
      FormattedInvoice: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '145690' },
          documento: { type: 'string', example: '71820' },
          valor: { type: 'number', example: 119.9 },
          valorFormatado: { type: 'string', example: 'R$ 119,90' },
          dataEmissao: { type: 'string', example: '2026-08-10' },
          dataVencimento: { type: 'string', example: '2026-09-10' },
          dataVencimentoFormatada: { type: 'string', example: '10/09/2026' },
          status: { type: 'string', example: 'PENDENTE' },
          linhaDigitavel: { type: 'string', example: '04790000020000014569803047711654260000011990' },
          linhaDigitavelFormatada: { type: 'string', example: '04790.00002 00000.145698 03047.711654 2 60000011990' },
          pixCopiaECola: { type: 'string', example: '00020126580014br.gov.bcb.pix...' },
          isOverdue: { type: 'boolean', example: false },
        },
      },
      DBSPlan: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'dbs-500' },
          name: { type: 'string', example: 'Ideal DBS 500MB' },
          speed: { type: 'string', example: '500 Mega' },
          downloadMbps: { type: 'number', example: 500 },
          uploadMbps: { type: 'number', example: 250 },
          price: { type: 'number', example: 139.9 },
          priceOnTime: { type: 'number', example: 119.9 },
          type: { type: 'string', enum: ['URBANO', 'WIFI6', 'RETENCAO'], example: 'URBANO' },
          isPopular: { type: 'boolean', example: true },
          description: { type: 'string', example: 'Nosso plano mais vendido!' },
          recommendedForDevices: { type: 'string', example: 'De 4 a 8 dispositivos' },
          features: { type: 'array', items: { type: 'string' } },
        },
      },
      TicketRecord: {
        type: 'object',
        properties: {
          id: { type: 'string', example: '8472' },
          id_cliente: { type: 'string', example: '2270' },
          assunto: { type: 'string', example: 'Instalação e Troca de Roteador Wi-Fi 6' },
          status: { type: 'string', example: 'EC' },
          statusLabel: { type: 'string', example: 'Técnico a Caminho' },
          protocolo: { type: 'string', example: 'DBS-781920' },
          nome_tecnico: { type: 'string', example: 'Carlos Eduardo' },
          previsao_visita: { type: 'string', example: 'Hoje até às 17:30' },
          etapas: { type: 'array', items: { type: 'object' } },
        },
      },
      UnblockPromiseResult: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Sinal desbloqueado em confiança com sucesso!' },
          protocolo: { type: 'string', example: 'DBS-DESB-837192' },
          unblockUntil: { type: 'string', example: '22/08/2026 23:59' },
          unblockHours: { type: 'number', example: 72 },
        },
      },
      TrafficConsumptionSummary: {
        type: 'object',
        properties: {
          clientId: { type: 'string', example: '2270' },
          period: { type: 'string', example: 'Agosto 2026' },
          totalDownloadGB: { type: 'number', example: 218.4 },
          totalUploadGB: { type: 'number', example: 39.31 },
          totalConsumedGB: { type: 'number', example: 257.71 },
          dailyAverageGB: { type: 'number', example: 18.41 },
          planFranchise: { type: 'string', example: '100% Ilimitado (Sem Franquia)' },
          dailyUsage: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
};

export const swaggerCustomOptions = {
  customSiteTitle: 'DBS Telecom — API BFF & ERP IXC Interactive Docs',
  customCss: `
    .topbar { background-color: #1f2024 !important; border-bottom: 3px solid #F84B03; }
    .topbar-wrapper img { content: url('https://img.icons8.com/color/48/fiber-optic-cable.png'); }
    .swagger-ui .info .title { color: #F84B03; font-weight: 800; }
    .swagger-ui .btn.authorize { background-color: #F84B03; border-color: #F84B03; color: #fff; }
    .swagger-ui .btn.authorize svg { fill: #fff; }
    .swagger-ui .opblock.opblock-post { border-color: #49cc90; }
    .swagger-ui .opblock.opblock-get { border-color: #61affe; }
  `,
};
