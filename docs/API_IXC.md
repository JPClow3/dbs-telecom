# Integração IXC e API BFF

Esta referência descreve os contratos HTTP sem dados pessoais, credenciais ou valores financeiros reais. O BFF é a única camada que conversa com IXC e IA; o aplicativo mobile nunca recebe tokens de fornecedor.

## Endereços e autenticação

- Prefixo local: `http://localhost:3000/api`.
- Prefixo publicado: o valor de `EXPO_PUBLIC_API_URL` no bundle mobile; os perfis EAS deste repositório apontam para o Worker configurado em `mobile/eas.json`.
- Rotas protegidas usam `Authorization: Bearer <jwt>`.
- O login aceita `cpfCnpj` ou o alias legado `login`, mas o corpo HTTP deve conter `password`. A conta criada/sincronizada recebe CPF/CNPJ sem pontuação como credencial inicial; depois de uma troca, a senha personalizada também é aceita e o contrato atual mantém a compatibilidade com o documento sem pontuação.
- O `clientId` do token é comparado com o recurso solicitado para bloquear IDOR. O alias `me` resolve para o cliente autenticado nas rotas que recebem `clientId`.
- `/api/health` é liveness público. `/api/health/ready` exige JWT de administrador e verifica PostgreSQL/Neon; não expõe URL de provedor, flags ou chaves.

## Persistência e ambientes

Sessões, chat, fila, suporte, CSAT, usuários, notificações, indicações e eventos PIX usam PostgreSQL/Neon quando `DATABASE_URL` está configurada. No runtime Node sem essa variável, o adaptador SQLite `:memory:` é descartável e serve apenas para desenvolvimento/testes isolados. Em produção, `DATABASE_URL` é obrigatória.

O IXC de demonstração é um provedor externo. Uma resposta sem registros pode significar que o documento não existe; timeout, falha de rede ou resposta malformada devem aparecer como indisponibilidade, nunca como confirmação financeira, contratual ou de suporte. O serviço aceita a forma válida do IXC com `page`/`total` sem `registros` como uma lista vazia.

## Catálogo de rotas

Todas as rotas abaixo são relativas ao prefixo `/api`. `Público` não exige JWT; `Cliente` exige JWT e escopo Anti-IDOR; `Admin` exige JWT com `role=admin`; `Demo` indica comportamento de demonstração, não uma integração de produção.

| Área | Método e rota | Acesso / contrato |
|---|---|---|
| Saúde | `GET /health` | Público; liveness do processo. |
| Saúde | `GET /health/ready` | Admin; verifica PostgreSQL/Neon e retorna `503` se degradado. |
| Autenticação | `POST /auth/login` | Público; CPF/CNPJ + senha, emite JWT por 24h. |
| Autenticação | `POST /auth/otp/request` | Público; fora do demo, entrega SMS/WhatsApp retorna `501 NOT_IMPLEMENTED`. |
| Autenticação | `POST /auth/otp/verify` | Público; valida código e emite JWT. |
| Autenticação | `POST /auth/identify` | Cliente; confirmação reduzida de nome e documento mascarado. Não é um oráculo pré-login. |
| Autenticação | `POST /auth/change-password` | Cliente; exige senha atual, nova senha com pelo menos 6 caracteres e revoga tokens anteriores. |
| Autenticação | `POST /auth/sync-users`, `GET /auth/users` | Admin; sincronização/listagem sem devolver hashes. |
| Chat | `POST /chat/greeting`, `POST /chat/message` | Cliente; sessão e cliente ficam limitados pelo token. `messageId` permite idempotência. |
| Chat | `GET /chat/history/:sessionId` | Cliente/Admin; o histórico só pode ser lido pelo titular ou admin. |
| Chat | `ALL /chat/message/stream` | Cliente em operação normal; anônimo apenas no demo. SSE sempre termina com evento `done`. |
| Chat | `POST /chat/audio`, `POST /chat/csat`, `GET /chat/csat/client/:clientId` | Cliente; áudio aceita allowlist MIME e teto de aproximadamente 10 MB. |
| Chat | `GET /chat/csat/stats` | Admin; métricas agregadas. |
| Fila | `POST /queue/join`, `GET /queue/status/:clientId`, `POST /queue/leave` | Cliente; departamento é recalculado no servidor. |
| Fila | `GET /queue/stream/:clientId` | Cliente em operação normal; SSE com alias `me`. |
| Fila | `POST /queue/progress` | Cliente na própria fila; transições de atendente exigem admin fora do demo. |
| Fila | `GET /queue/stats` | Admin. |
| IA | `POST /ai/classify`, `GET /ai/context/:clientId` | Cliente; Anti-IDOR e guardrails. Classificação rejeita mensagens acima de 2.000 caracteres. |
| Financeiro | `GET /financial/invoices/:clientId` | Cliente; paginação local sobre consulta IXC. |
| Financeiro | `GET /financial/invoices/:id/pdf` | Cliente/Admin; `clientId` é query opcional e a fatura é revalidada para o titular. |
| Financeiro | `POST /financial/unblock-promise` | Cliente; só confirme a ação quando o IXC responder. |
| PIX | `POST /financial/pix/webhook` | Gateway; em produção exige assinatura, timestamp, replay protection e `PIX_WEBHOOK_SECRET`. |
| PIX | `GET /financial/pix/stream/:clientId` | Cliente/Admin; JWT no header ou `?token=` para EventSource web. O query token aparece em logs e não deve ser usado em escrita. |
| Comercial | `GET /commercial/plans` | Público; filtro opcional `type=URBANO` ou `type=WIFI6`. |
| Suporte | `POST /support/diagnostic`, `GET /support/tickets/:clientId` | Cliente; diagnóstico e chamados distinguem erro de lista vazia. |
| Tráfego | `GET /traffic/consumption/:clientId` | Cliente; período opcional por `days`. |
| Sistema | `ALL /system/ping` | Público; mede latência contra o BFF. |
| Sistema | `GET/POST /system/speedtest-payload` | Público; limite de 10 requisições/hora/IP e payload limitado. |
| Wi-Fi | `GET/PUT /wifi/settings/:clientId`, `GET /wifi/qr/:clientId`, `POST /wifi/restart/:clientId` | Cliente; hoje depende do adaptador demo e retorna `503 PROVIDER_NOT_CONFIGURED` fora dele. |
| Óptico | `GET /optical/diagnostics/:clientId` | Cliente; hoje depende do adaptador demo e retorna `503 PROVIDER_NOT_CONFIGURED` fora dele. |
| Notificações | `GET /notifications/:clientId`, `PATCH /notifications/:clientId/read/:notificationId`, `PATCH /notifications/:clientId/read-all` | Cliente. |
| Notificações | `POST /notifications/simulate` | Admin; payload estrito, apenas para simulação/automação. |
| Indicação | `GET/POST /referrals/:clientId` | Cliente; atualmente depende do adaptador demo. |

Consulte os registradores em `backend/src/routes/` quando alterar um contrato. A página `/api/docs` é uma landing page portátil; a especificação OpenAPI é servida em `/api/docs.json` e pode ser aberta em um cliente compatível. Ela deve ser validada junto com os handlers antes de ser anunciada como documentação pública completa.

## Exemplos seguros

```http
POST /api/auth/login
Content-Type: application/json

{ "cpfCnpj": "<documento-de-teste>", "password": "<senha-de-teste>" }
```

```http
GET /api/financial/invoices/me
Authorization: Bearer <jwt-de-teste>
```

Exemplos são apenas de formato. Não copie documentos, e-mails, nomes, linhas digitáveis, chaves PIX, IDs de cliente ou protocolos de ambientes reais para logs, documentação ou material de apresentação.

## Operação IXC

As consultas IXC usam `POST`, o cabeçalho `ixcsoft: listar`, autenticação Basic derivada de `IXC_TOKEN` e filtros como `qtype`. Configure URL e token somente como variáveis/segredos de servidor. Antes de alterar a URL ou o ambiente:

1. valide o endpoint com uma conta autorizada;
2. confirme que o BFF retorna erro honesto para timeout, resposta malformada e lista vazia;
3. faça smoke test de login, fatura, suporte e chat;
4. registre a evidência sem preservar PII, tokens ou payloads de pagamento.
