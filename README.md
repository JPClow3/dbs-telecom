# DBS Telecom — Central do Assinante

Aplicativo Expo/React Native e BFF TypeScript para autoatendimento da DBS Telecom. O BFF concentra autenticação, regras de negócio, integração com o ERP IXC Soft, persistência PostgreSQL/Neon e orquestração de IA. O aplicativo nunca recebe credenciais de fornecedor.

## Visão geral

```text
App Expo / React Native
        │ HTTPS + JWT
        ▼
BFF Express (Node local ou Cloudflare Worker)
        ├── PostgreSQL/Neon       sessões, chat, fila e registros do app
        ├── IXC Soft WebService   clientes, contratos, faturas e chamados
        └── Gemini/OpenAI         classificação e respostas com guardrails
```

O produto inclui login por CPF/CNPJ, chat síncrono e por SSE, áudio, CSAT, consulta financeira, diagnóstico de suporte, fila virtual, catálogo de planos, notificações, indicação, diagnóstico óptico e teste de velocidade.

### Estados de dados

O cliente deve distinguir sempre `LIVE`, `DEMO`, `UNAVAILABLE` e `UNAUTHORIZED` na interface:

- `LIVE`: resposta confirmada pelo provedor configurado.
- `DEMO`: fixture ou adaptador local; nenhuma ação financeira ou de roteador é real.
- `UNAVAILABLE`: provedor ou backend não confirmou a operação.
- `UNAUTHORIZED`: sessão ausente, expirada ou sem permissão.

O modo demo local é opt-in. O E2E o habilita explicitamente com `DBS_DEMO_MODE=true`, `AI_PROVIDER=mock` e banco SQLite em memória. Esse banco é descartado ao reiniciar e nunca deve apontar para produção.

## Requisitos

- Node.js 22 ou superior para `backend/`.
- Node.js 20 ou superior para `mobile/`.
- Docker e Docker Compose apenas quando a execução conteinerizada for necessária.
- Chromium instalado pelo Playwright para os testes E2E.
- Conta Cloudflare, projeto Neon e credenciais de IXC/IA somente para ambientes publicados ou contratos live opt-in.

## Instalação local

Não há `package.json` na raiz. Cada área possui seu próprio `package-lock.json` e deve ser instalada separadamente.

### Backend

```powershell
Set-Location backend
Copy-Item .env.example .env
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

O servidor inicia em `http://localhost:3000`. Sem `DATABASE_URL`, o backend usa SQLite `:memory:` no runtime Node; isso é adequado para desenvolvimento isolado e testes, mas não para produção. Para consultar o IXC localmente, configure `IXC_BASE_URL` e `IXC_TOKEN` no `.env`. Para IA real, configure o provedor e a chave correspondente; use `AI_PROVIDER=mock` em cenários sem credenciais.

### Mobile

```powershell
Set-Location mobile
Copy-Item .env.example .env
# Ajuste EXPO_PUBLIC_API_URL para o backend que deseja usar.
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd start
```

Comandos Expo disponíveis: `npm.cmd run web`, `npm.cmd run android` e `npm.cmd run ios`. Para o backend local, use `http://localhost:3000/api` no navegador, `http://10.0.2.2:3000/api` no emulador Android ou o endereço HTTP/HTTPS alcançável da máquina em um dispositivo físico. A configuração `EXPO_PUBLIC_*` é pública: nunca coloque nela JWT, senha, token IXC, chave Gemini ou URL assinada.

O primeiro acesso usa CPF/CNPJ sem pontuação como credencial inicial quando a conta foi criada/sincronizada dessa forma. O contrato HTTP ainda exige `password`. Depois de uma troca, a senha personalizada também é aceita; por compatibilidade com a central, o CPF/CNPJ sem pontuação continua aceito pelo backend. O banco armazena apenas hashes.

## Testes e gates

Instale as três áreas antes do E2E:

```powershell
Set-Location backend; npm.cmd ci
Set-Location ..\mobile; npm.cmd ci
Set-Location ..\e2e; npm.cmd ci
```

Gates locais:

```powershell
# Backend
Set-Location backend
npm.cmd test
npm.cmd run build

# Mobile
Set-Location ..\mobile
npm.cmd run typecheck
npm.cmd test

# E2E web
Set-Location ..\e2e
npx.cmd playwright install chromium
npm.cmd test
```

O launcher E2E (`e2e/scripts/serve-current-mobile.mjs`) remove somente o `mobile/dist` gerado, exporta novamente o app para web e inicia um backend isolado. Ele neutraliza `DATABASE_URL`, tokens e chaves herdados do shell, habilita fixtures demo e impede que um bundle antigo seja servido. A suíte cobre Chromium desktop e mobile; ela não substitui a validação do APK em aparelho/emulador nem um smoke test autenticado de IXC/Gemini.

Contratos live do backend são opt-in e podem consultar serviços externos:

```powershell
Set-Location backend
$env:RUN_LIVE_CONTRACTS = 'true'
npm.cmd run test:live-contracts
```

Só execute esse comando com credenciais e dados autorizados para o ambiente de teste.

## API e operação

Com o backend local, os endpoints ficam sob `http://localhost:3000/api`:

- `GET /health`: liveness público; confirma apenas que o processo responde.
- `GET /health/ready`: readiness protegido por JWT administrativo; verifica a conexão PostgreSQL/Neon e pode responder `503` quando degradado.
- `GET /docs` e `GET /api/docs`: página de orientação para a documentação.
- `GET /api/docs.json`: especificação OpenAPI 3.0.3 para clientes compatíveis.

Rotas protegidas usam `Authorization: Bearer <jwt>`. O alias `me` é aceito pelas rotas de recurso que recebem `clientId`; o middleware Anti-IDOR bloqueia acesso de cliente a outro identificador. A referência completa está em [Integração IXC e API BFF](docs/API_IXC.md).

## Banco e migrações

As migrações PostgreSQL versionadas ficam em `backend/migrations/` e são controladas pela tabela `schema_migrations`:

```powershell
Set-Location backend
$env:DATABASE_URL = 'postgresql://usuario:senha@host/banco?sslmode=require'
npm.cmd run migrate -- --dry-run
npm.cmd run migrate
```

O `--dry-run` apenas lista migrações pendentes. O comando sem essa opção altera o banco informado; confira a URL antes de executar. A importação legada de um SQLite persistente exige, adicionalmente, `MIGRATE_SQLITE_TO_NEON=confirm` e `SQLITE_PATH`.

## Docker

O Dockerfile do backend usa Node 22 Alpine em dois estágios. Para iniciar o serviço com Compose, configure as variáveis obrigatórias no `.env` da raiz e execute:

```powershell
docker compose up -d --build
docker compose logs -f backend
docker compose down
```

O Compose exige `DATABASE_URL`, `JWT_SECRET`, `IXC_BASE_URL`, `IXC_TOKEN`, `PIX_WEBHOOK_SECRET` e `CORS_ORIGIN`. Não use o fallback SQLite em uma execução marcada como produção.

## Publicação

### Cloudflare Worker

```powershell
Set-Location backend
npx.cmd wrangler deploy --dry-run
npx.cmd wrangler deploy
```

Configure os valores sensíveis como secrets/variáveis do Worker, aplique as migrações antes de ativar código que dependa delas e valide `/api/health/ready` com um JWT administrativo. `wrangler.jsonc` define o Worker `dbs-telecom-api`; o adapter do Worker não abre um socket TCP local.

### Android via EAS

```powershell
Set-Location mobile
npx.cmd eas-cli@latest build --platform android --profile preview
```

O perfil `preview` gera APK para distribuição interna. O perfil `production` gera Android App Bundle e rejeita URL de backend local: `EXPO_PUBLIC_API_URL` precisa ser HTTPS não local. Instalação, assinatura e smoke test nativo devem ser registrados separadamente dos gates locais.

## Documentação

- [Arquitetura](docs/ARQUITETURA.md)
- [Integração IXC, API e autenticação](docs/API_IXC.md)
- [Fluxos de atendimento](docs/FLUXOS_ATENDIMENTO.md)
- [Guardrails e segurança](docs/GUARDRAILS_E_SEGURANCA.md)
- [Manual de desenvolvimento e testes](docs/MANUAL_DE_DESENVOLVIMENTO_E_TESTES.md)
- [Guia de apresentação](docs/GUIA_APRESENTACAO.md)
- [Manifesto de entrega](docs/DELIVERY_MANIFEST.md)

## Segurança

Não versione `.env`, dados de clientes, tokens, bancos locais, `node_modules`, `dist`, relatórios Playwright ou APKs fora do pacote de entrega autorizado. Registre evidências sem CPF/CNPJ, senha, e-mail, endereço, linha digitável, chave PIX, JWT ou URL assinada. Consulte o [manifesto de entrega](docs/DELIVERY_MANIFEST.md) antes de gerar um ZIP.
