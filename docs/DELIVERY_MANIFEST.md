# Manifesto de entrega

## Conteúdo do pacote fonte

O ZIP de entrega inclui código-fonte, documentação, manifestos de dependência, migrações, testes, configuração não sensível e o APK Android gerado para esta entrega.

Não inclui credenciais, dados de clientes, bancos locais, dependências instaladas, caches, relatórios temporários ou arquivos de controle local.

## Pré-publicação

1. Configure `DATABASE_URL`, `IXC_TOKEN`, `GEMINI_API_KEY`, `JWT_SECRET` e `PIX_WEBHOOK_SECRET` como secrets do Worker.
2. Defina `EXPO_PUBLIC_API_URL` no perfil EAS que será distribuído.
3. Aplique `backend/migrations/*.sql` usando `npm.cmd run migrate` contra o banco alvo.
4. Publique o Worker e confirme `GET /api/health/ready` com JWT administrativo na URL implantada.
5. Faça smoke test com uma conta autorizada do IXC; não use dados de cliente em documentação, issues ou capturas públicas.

## Verificações de release

```powershell
cd backend; npm.cmd test; npm.cmd run build; npx.cmd wrangler deploy --dry-run
cd mobile; npm.cmd run typecheck; npm.cmd test; npm.cmd audit --omit=dev --audit-level=high
cd e2e; npm.cmd test
```

O pacote deve registrar o commit de origem, link/arquivo do APK e o resultado dessas verificações antes da entrega. A execução E2E web não substitui a instalação e o smoke test do APK em aparelho físico.

## Evidências desta entrega (22/08/2026)

- Worker publicado: `https://dbs-telecom-api.joaopaulo-grv4.workers.dev` (versão `57e4db20-0107-41f3-b350-2c129ec67696`); `GET /api/health` respondeu 200.
- APK Android: build EAS `244627ec-3dc6-4ebd-b064-af7639c556b1` (perfil `preview`, distribuição interna). O arquivo final é incluído no diretório `APK/` do ZIP; SHA-256 `FC9F172423BA2BFC1797E7E413B917741550F77B41A2C58FA915416DC3D964BB`.
- Backend: 190 testes passaram; compilação TypeScript e `wrangler deploy --dry-run` passaram; `npm audit --omit=dev --audit-level=high` não encontrou vulnerabilidades.
- Mobile: typecheck, 21 testes e `expo-doctor` passaram; a auditoria de dependências de produção não encontrou vulnerabilidades.
- Jornada E2E: 74 testes passaram em Chromium desktop e viewport mobile, cobrindo autenticação, chat, finanças, planos, perfil, chamados e estados demonstrativos.
- Migrações não foram aplicadas nesta máquina porque `DATABASE_URL` não foi disponibilizada. O comando foi interrompido antes de alterar qualquer banco.

## Exclusões obrigatórias

```text
.git/  .commandcode/  .env  .env.*  !*.env.example
backend/.env  mobile/.env  backend/data/**
**/node_modules/**  **/dist/**  .expo/  web-build/  coverage/
e2e/test-results/  e2e/playwright-report/  backend/.wrangler/
DEV/*.pdf (salvo autorização explícita do cliente)
```

## Limites conhecidos

- A validação nativa requer aparelho Android/iOS ou emulador disponível.
- A demonstração IXC é um ambiente externo: disponibilidade e conteúdo são controlados pelo provedor.
- Revogação global de JWT deve ser persistida no PostgreSQL antes de uma operação multi-instância que exija invalidação imediata.
