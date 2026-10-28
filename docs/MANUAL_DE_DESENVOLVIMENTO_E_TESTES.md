# 🧪 Manual de Desenvolvimento e Testes — DBS Telecom

Este manual fornece as instruções técnicas para configurar o ambiente, executar os gates automatizados, depurar o aplicativo móvel e publicar o backend. Os comandos abaixo usam PowerShell no Windows; adapte `npm.cmd` para `npm` em shells Unix.

---

## 1. Pré-requisitos do Ambiente

* **Node.js:** versão 22+ para o backend e 20+ para o aplicativo Expo. O CI e o Docker do backend usam Node 22.
* **Gerenciador de Pacotes:** `npm` v9+ ou superior. O repositório não possui workspace na raiz; instale `backend/`, `mobile/` e `e2e/` separadamente.
* **Docker & Docker Compose:** Versão 24+ (para execução conteinerizada).
* **Ambiente Mobile (opcional para testes móveis):**
  - **Navegador Web:** Google Chrome, Brave ou Microsoft Edge (para Web Preview instantâneo).
  - **Android Studio:** Com emulador Android configurado (API 33+).
  - **Dispositivo Físico:** **Development build** recomendado para validar módulos nativos; Expo Go serve apenas para iteração básica e não comprova o binário de produção.

---

## 2. Configuração e Execução do Backend BFF

### 2.1 Instalação e Configuração
```powershell
cd backend

# 1. Copie o arquivo de variáveis de ambiente
Copy-Item .env.example .env

# 2. Instale exatamente o lockfile
npm.cmd ci
```

Sem `DATABASE_URL`, o runtime Node usa SQLite `:memory:`. Essa opção é apropriada para desenvolvimento isolado e testes, mas não fornece persistência e não deve ser usada em produção. Para uma integração externa, configure `IXC_BASE_URL`, `IXC_TOKEN`, `AI_PROVIDER` e as chaves correspondentes no `.env`.

### 2.2 Scripts do `package.json` do Backend

| Comando | Descrição |
| :--- | :--- |
| `npm run dev` | Inicia o servidor HTTP em modo de desenvolvimento com hot-reload automático via `tsx watch`. |
| `npm run build` | Compila o código TypeScript para JavaScript na pasta `dist/`. |
| `npm start` | Inicia o servidor em modo de produção a partir do código compilado (`dist/server.js`). |
| `npm test` | Executa a suíte atual de testes automatizados com o **Vitest**. |
| `npm run test:live-contracts` | Executa os contratos opt-in com IXC e Gemini reais; requer `RUN_LIVE_CONTRACTS=true` e credenciais externas. |
| `npm run test:watch` | Executa os testes em modo interativo com re-execução automática a cada alteração de arquivo. |

---

## 3. Suíte de Testes Automatizados (Vitest)

O backend possui uma suíte de testes automatizados distribuída entre os arquivos em `backend/test` e `backend/src`. A contagem deve ser conferida pela execução atual, pois integrações externas e mudanças de segurança podem alterar o resultado.

```powershell
cd backend
npm.cmd test
```

Essa suíte define `AI_PROVIDER=mock`, remove credenciais IXC/Gemini do processo e usa banco em memória. Para validar os provedores separadamente, configure `IXC_TOKEN`, `LIVE_IXC_CLIENT_ID`, `GEMINI_API_KEY` e execute:

O `vitest.config.mts` prefere `TEST_DATABASE_URL`, depois `DATABASE_URL`, e só então cai no SQLite em memória. Mantenha ambas vazias para a suíte local isolada; se usar um banco de teste, ele deve ser descartável e nunca ser o banco de produção.

```bash
# PowerShell
$env:RUN_LIVE_CONTRACTS='true'
npm.cmd run test:live-contracts
```

Os contratos live fazem chamadas externas e só devem ser executados com dados e credenciais autorizados.

### 3.1 Detalhamento dos Arquivos de Teste

Os arquivos e a quantidade de casos mudam junto com a implementação. Use o relatório do Vitest como fonte de verdade; a documentação abaixo é apenas um mapa de áreas cobertas.

#### Guardrails de IA (`src/modules/ai/ai.guardrails.test.ts`):
* Valida a esteira de defesa de entrada (bloqueio de jailbreak, DAN mode, framing hipotético).
* Valida a detecção e recusa de tentativas de extração de System Prompt.
* Valida a filtragem de assuntos fora de escopo (culinária, política, código).
* Valida a normalização de texto contra homóglifos e caracteres invisíveis.
* Valida a sanitização LGPD e remoção de chaves de API (`AIzaSy...`, `sk-...`).

#### Integração Gemini e guardrails (`test/ai-gemini-guardrails.test.ts`):
* Valida o classificador de IA com injeção de contexto RAG do IXC.
* Valida a validação estrutural com **Zod Schema** e correção de saídas malformadas.
* Valida as regras anti-alucinação em cenários de adimplência financeira.
* Valida o Fast Router determinístico para intenções comerciais, de suporte e financeiras.

#### Rotas e integração (`test/backend.test.ts`):
* Valida o health check e status dos serviços (`GET /api/health`).
* Valida a autenticação de clientes com CPF/CNPJ como credencial inicial (`POST /api/auth/login`). O campo HTTP `password` continua obrigatório; após a troca, a senha personalizada e a credencial de compatibilidade CPF/CNPJ continuam aceitas.
* Valida a sincronização de usuários da base do IXC (`POST /api/auth/sync-users`).
* Valida a consulta e formatação de faturas do IXC (`GET /api/financial/invoices/:clientId`).
* Valida o catálogo de planos da DBS Telecom e filtros por tipo (`GET /api/commercial/plans`).
* Valida a máquina de estados do diagnóstico de suporte em 3 etapas (`POST /api/support/diagnostic`).

---

## 4. Configuração e Execução do Aplicativo Mobile

### 4.1 Instalação
```powershell
cd mobile

# 1. Copie o arquivo de variáveis de ambiente
Copy-Item .env.example .env

# 2. Instale exatamente o lockfile
npm.cmd ci

# 3. Valide política de sessão e tipos
npm.cmd test
npm.cmd run typecheck
```

Defina `EXPO_PUBLIC_API_URL` conforme o alvo. Essa variável entra no bundle público e nunca deve conter tokens, senhas ou segredos.

### 4.2 Iniciando o Metro Bundler do Expo
```bash
npm.cmd start
```

### 4.3 Ambientes de Execução Suportados:

#### 1. Web Preview (Navegador Web — Mais Rápido para Avaliação):
* Pressione a tecla **`w`** no terminal onde o Expo está rodando ou execute `npm.cmd run web`.
* O navegador abrirá automaticamente em `http://localhost:8081`.

#### 2. Emulador Android (Android Studio):
* Inicie o Emulador no Android Studio.
* Pressione a tecla **`a`** no terminal do Expo ou execute `npm.cmd run android`.
* > [!NOTE]
  > O transporte em `mobile/src/services/api/transport.ts`, exposto pela fachada `api.ts`, detecta automaticamente a plataforma Android e direciona as requisições para `http://10.0.2.2:3000/api` (endereço do host local no emulador Android).

#### 3. Dispositivo Físico:
* Conecte o computador e o smartphone na **mesma rede Wi-Fi**.
* Para iteração básica, abra o **Expo Go** e escaneie o QR Code.
* Para validar permissões, áudio, armazenamento, biometria e comportamento de release, use um **development build** ou binário de distribuição interna.

### 4.4 Gates do projeto Expo SDK 57

```bash
npx expo install --check
npx expo-doctor
npx expo export --platform web
```

O perfil EAS `production` resolve `EXPO_PUBLIC_API_URL` pelo perfil EAS ou pelo fallback do `app.config.js`; o valor resolvido deve ser HTTPS e não local. O `app.config.js` interrompe o build quando a URL resolvida não é HTTPS ou aponta para `localhost`, `127.0.0.1` ou `10.0.2.2`. A geração Android/iOS também depende das credenciais de assinatura de cada plataforma.

### 4.5 Jornadas E2E com export atual

```bash
cd ../e2e
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd test
```

Antes dessa etapa, instale também as dependências de `backend/` e `mobile/`, porque o launcher executa a exportação Expo e inicia `backend/src/server.ts` diretamente. O launcher do Playwright remove apenas o diretório gerado `mobile/dist`, executa `npx expo export --platform web` e só então inicia o backend com `DBS_DEMO_MODE=true`, `DEMO_MODE=true`, `AI_PROVIDER=mock`, credenciais externas neutralizadas e banco em memória. Se a exportação falhar, os testes não prosseguem usando um bundle antigo. A suíte web cobre Chromium desktop e mobile, mas não substitui a prova nativa em Android/iOS ou os smoke tests de IXC/Gemini.

Antes da primeira execução E2E, instale as dependências e o navegador:

```powershell
cd e2e
npm.cmd ci
npx.cmd playwright install chromium
```

---

## 5. Execução com Docker & Docker Compose

O projeto está totalmente preparado para execução em containers Docker:

### 5.1 Estrutura do `Dockerfile` (Multi-stage Build)
* **Stage 1 (Build):** Compila o TypeScript em ambiente limpo Node.js 22 Alpine.
* **Stage 2 (Runtime):** Cria uma imagem leve contendo apenas os artefatos compilados e dependências de produção.

### 5.2 Comandos Docker Compose
```bash
# Construir a imagem e subir o backend em segundo plano
docker compose up -d --build

# Visualizar logs em tempo real
docker compose logs -f backend

# Parar os containers
docker compose down
```

---

## 6. Boas Práticas e Padrões de Código

1. **TypeScript Estrito (`strict: true`):** Proibido o uso de `any` não tipado em contratos públicos.
2. **Separação em Camadas:**
   - `services/`: Apenas lógica de negócio e integração com APIs.
   - `routes/`: Validação de requisição HTTP e envio de respostas DTO.
   - `components/`: Componentes visuais desacoplados e reutilizáveis.
3. **Resiliência honesta:** Toda chamada assíncrona externa deve conter `try/catch` com estado de erro, retry e indicação clara quando houver apenas uma prévia local. Nunca trate fallback local como confirmação de pagamento, contrato, desbloqueio ou chamado.

---

## 7. Migrações de Banco de Dados (Neon/PostgreSQL)

Use `DATABASE_URL` para o banco de destino. O fallback em memória é exclusivo de desenvolvimento/testes; não há persistência SQLite de produção. Para aplicar migrações:

```powershell
cd backend
$env:DATABASE_URL = 'postgresql://usuario:senha@host/banco?sslmode=require'
npm.cmd run migrate -- --dry-run
npm.cmd run migrate
```

Para publicar no Cloudflare, mantenha as credenciais exclusivamente como secrets do Worker e faça um `npx.cmd wrangler deploy --dry-run` antes do deploy real.

O schema vive em arquivos SQL versionados em `backend/migrations/`, aplicados em ordem pelo runner oficial:

```powershell
cd backend
npm.cmd run migrate              # aplica as migrações pendentes
npm.cmd run migrate -- --dry-run # apenas lista o que seria aplicado (não altera nada)
```

* Cada arquivo é executado uma única vez; o controle fica na tabela `schema_migrations`.
* Instruções não transacionáveis (`CREATE INDEX CONCURRENTLY`) rodam fora do lote automaticamente.
* **Quando:** rode após cada deploy que inclua novas migrações (e antes de ativar o código que dependa delas). Em CI/pipeline, use o dry-run como gate.
* Sem `DATABASE_URL` o runner falha de forma controlada — nunca aplica em banco errado por acidente.
