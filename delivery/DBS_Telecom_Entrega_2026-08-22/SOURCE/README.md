# DBS Telecom — aplicativo de autoatendimento

Aplicativo Expo/React Native e BFF TypeScript para autoatendimento da DBS Telecom. O BFF integra o ERP IXC, persistência PostgreSQL/Neon, IA Gemini e serviços de atendimento, sempre sem incluir credenciais no aplicativo.

## Estado de entrega

- Backend: Cloudflare Worker + PostgreSQL/Neon.
- Mobile: Expo SDK 57, distribuição Android via EAS.
- Ambiente de demonstração: pode usar dados ilustrativos; a interface identifica prévias e bloqueia ações financeiras ou de roteador sem confirmação do provedor.
- Integrações IXC/Gemini: dependem de credenciais e dados autorizados do ambiente destino. Uma suíte local aprovada não substitui um smoke test autenticado.

## Requisitos

- Node.js 22+ para o backend; Node.js 20+ para o aplicativo mobile.
- Docker opcional para executar o backend localmente.
- Conta Cloudflare/Neon e credenciais de integração somente para publicação.

## Executar localmente

### Backend

```powershell
cd backend
Copy-Item .env.example .env
npm.cmd ci
npm.cmd test
npm.cmd run build
npm.cmd run dev
```

Defina `DATABASE_URL` para persistência PostgreSQL. Sem ela, os testes usam fallback em memória; este fallback não é adequado para produção.

### Mobile

```powershell
cd mobile
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npx.cmd expo start
```

Defina apenas `EXPO_PUBLIC_API_URL` no mobile. Nunca coloque tokens IXC, Gemini, banco ou JWT em variáveis `EXPO_PUBLIC_*`.

## Testes

```powershell
# backend
cd backend; npm.cmd test; npm.cmd run build

# mobile
cd mobile; npm.cmd run typecheck; npm.cmd test

# E2E web (instale as dependências e o Chromium na primeira vez)
cd e2e; npm.cmd ci; npx.cmd playwright install chromium; npm.cmd test
```

O E2E exporta o app atual para web e usa provedores isolados. Ele verifica fluxos desktop e viewport mobile, mas não substitui a validação visual em dispositivo Android/iOS.

## Publicação

```powershell
# backend — credenciais ficam nos secrets do Worker
cd backend; npx.cmd wrangler deploy

# APK interno Android
cd mobile; npx.cmd eas-cli@latest build --platform android --profile preview
```

Antes de publicar, aplique as migrações com `npm.cmd run migrate`, configure os secrets do Worker e valide a rota `/api/health/ready` com um JWT administrativo no ambiente publicado. Não use `.env` local como fonte de entrega.

## Documentação

- [Arquitetura](docs/ARQUITETURA.md)
- [Integração IXC e rotas](docs/API_IXC.md)
- [Fluxos de atendimento](docs/FLUXOS_ATENDIMENTO.md)
- [Segurança e guardrails](docs/GUARDRAILS_E_SEGURANCA.md)
- [Manual de desenvolvimento e testes](docs/MANUAL_DE_DESENVOLVIMENTO_E_TESTES.md)
- [Guia de apresentação](docs/GUIA_APRESENTACAO.md)
- [Manifesto de entrega](docs/DELIVERY_MANIFEST.md)

## Segurança

Arquivos `.env`, bancos locais, caches, relatórios de teste, `node_modules` e artefatos de build não devem entrar no ZIP de entrega. Consulte o manifesto de entrega para a lista de inclusão/exclusão.
