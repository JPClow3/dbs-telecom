# Integração IXC e API BFF

Esta referência descreve contratos de integração sem dados pessoais, credenciais ou valores financeiros reais. O BFF é a única camada que conversa com IXC e IA; o aplicativo mobile nunca recebe tokens de fornecedor.

## Endereços e autenticação

- Prefixo local: `http://localhost:3000/api`.
- Prefixo publicado: definido por `EXPO_PUBLIC_API_URL` no build mobile.
- As rotas protegidas usam `Authorization: Bearer <jwt>`.
- `clientId` no token é validado contra recursos solicitados para bloquear IDOR. Use o alias `me` quando a rota o suportar.
- `/api/health` é liveness público. `/api/health/ready` verifica dependências para publicação e exige JWT administrativo. A resposta é operacional e não deve expor secrets ou detalhes internos.

## Persistência e ambientes

Sessões, chat, fila, suporte e CSAT usam PostgreSQL/Neon por `DATABASE_URL`. Os testes podem usar adaptadores em memória; essa modalidade é isolada e não persiste dados de produção.

O IXC de demonstração é um provedor externo. Uma resposta vazia pode significar que o documento não existe; falha de rede ou resposta malformada deve aparecer como indisponibilidade, nunca como uma confirmação financeira ou de suporte.

## Famílias de rota

| Família | Rotas principais | Observação |
|---|---|---|
| Saúde | `GET /health`, `GET /health/ready` | Liveness e readiness sem segredos. |
| Autenticação | `/auth/identify`, `/auth/login`, OTP e administração | Documento/senha e rate limit são validados pelo BFF. |
| Atendimento | `/chat/greeting`, `/chat/message`, `/chat/message/stream`, `/chat/audio`, `/chat/csat` | Streaming deve concluir com evento `done`; falhas não criam confirmação fictícia. |
| Financeiro | `/financial/invoices/:clientId`, PDF, PIX e desbloqueio | Só habilite ações quando os dados forem confirmados pelo provedor. |
| Suporte | tickets, tráfego, fila, Wi-Fi, diagnóstico óptico e notificações | Dados indisponíveis devem renderizar estado de erro, não lista vazia confirmada. |
| Comercial | planos, indicação e catálogo | Simulações são marcadas como prévia quando não confirmadas. |
| Sistema | ping, payload de speed test e status operacional | O teste de velocidade mede tráfego real e deve ser cancelável pelo usuário. |
| Enterprise | webhook/stream PIX, rotas de operação e sistema | Proteja por segredo próprio e valide autenticação em SSE. |

Consulte os arquivos em `backend/src/routes/` para o contrato de implementação vigente. A especificação OpenAPI em `backend/src/docs/swagger.config.ts` é material de desenvolvimento e não deve ser anunciada como Swagger UI publicada sem validar o endpoint no ambiente alvo.

## Exemplo seguro

```http
POST /api/auth/identify
Content-Type: application/json

{ "cpfCnpj": "00000000000" }
```

```http
GET /api/financial/invoices/me
Authorization: Bearer <jwt>
```

Exemplos são apenas de formato. Não copie documentos, e-mails, nomes, linhas digitáveis, chaves PIX, IDs de cliente ou protocolos de ambientes reais para logs, documentação ou material de apresentação.

## Operação IXC

As consultas IXC usam `POST`, o cabeçalho definido pelo WebService v1 e filtros como `qtype`. Configure a URL base e o token apenas como variáveis/segredos de servidor. Antes de alterar a URL ou o ambiente:

1. valide o endpoint com uma conta autorizada;
2. confirme que o BFF retorna erro honesto para timeout e resposta sem registros;
3. faça smoke test de login, fatura, suporte e chat;
4. registre a evidência sem preservar PII.
