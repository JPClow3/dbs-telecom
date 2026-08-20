# 📱 DBS Telecom — Aplicativo Mobile de Atendimento Inteligente & Integração ERP IXC

<div align="center">

![DBS Telecom](mobile/assets/logo.png)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React Native](https://img.shields.io/badge/React_Native-Expo_SDK_57-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.19+-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-Google_AI_Studio-4285F4?logo=google&logoColor=white)](https://aistudio.google.com/)
[![ERP IXC Soft](https://img.shields.io/badge/ERP_Integration-IXC_WebService_v1-FF6B00)](https://www.ixcsoft.com.br/)
[![Vitest](https://img.shields.io/badge/Tests-run_locally-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)

**MVP de autoatendimento ao cliente em evolução, com Inteligência Artificial Generativa, Guardrails de Segurança Multicamadas e integração com o ERP IXC Soft.**

[Documentação Técnica](#-documentação-técnica-completa) • [Como Executar](#-como-executar-o-projeto) • [Arquitetura](#-arquitetura-do-sistema) • [Matriz de Avaliação](#-matriz-de-avaliação-atual)

</div>

---

## 🎯 Visão Geral do Projeto

O **DBS Telecom Smart Service** foi desenvolvido para transformar a experiência de atendimento dos clientes da **DBS TELECOM** (operadora de telecomunicações autorizada pela ANATEL). O sistema combina um aplicativo móvel moderno em React Native/Expo com um backend seguro no padrão **BFF (Backend for Frontend)**, orquestrando o modelo **Google Gemini** e o ERP **IXC Soft WebService v1**.

### 🌟 Destaques e Capacidades Principais:
1. **Identificação & Autenticação Segura (Login: CPF / Senha: CPF):**
   - Reconhecimento automático do cliente no ERP IXC pelo CPF/CNPJ com ou sem máscara.
   - Sincronização e autenticação onde a senha padrão do cliente é o próprio CPF (apenas números).
2. **Atendimento Humanizado & Personalizado:**
   - Abertura personalizada chamando o cliente pelo primeiro nome e sem perguntas redundantes sobre dados já cadastrados.
3. **Classificação & Roteamento Dinâmico em 3 Departamentos Obrigatórios:**
   - 🟢 **Comercial:** Aplicação do Script Oficial de Vendas DBS, catálogo de planos Urbanos (400MB a 1GB) e Wi-Fi 6 (802.11ax), quebra de 4 objeções e campanha de indicação premiada (50% de desconto).
   - 🛠️ **Suporte:** Pré-diagnóstico guiado interativo em 3 etapas (checagem de aparelhos, cabos/LEDs e reinicialização) com abertura de chamado técnico (`su_oss_chamado`) e geração de protocolo no IXC.
   - 💳 **Financeiro:** Consulta em tempo real de faturas pendentes (`fn_areceber`), cópia em 1 clique da Linha Digitável e código PIX Copia-e-Cola com confirmação instantânea.
4. ⚡ **Streaming de Respostas (Server-Sent Events - SSE):**
   - Efeito de digitação em tempo real tipo ChatGPT no endpoint `/chat/message/stream` consumindo o stream do Google Gemini SDK (`generateContentStream` / SSE).
5. 🎙️ **Atendimento por Áudio / Mensagens de Voz (Google Gemini Multimodal):**
   - Gravação de áudio no aplicativo integrada diretamente ao modelo multimodal do Google Gemini (`gemini-flash-latest`), transcrevendo o que o cliente falou e gerando respostas com cards inteligentes.
6. ⭐ **Pesquisa de Satisfação (CSAT / NPS Interativo):**
   - Card interativo com 5 estrelas selecionáveis, tags rápidas de feedback e cálculo em tempo real de Net Promoter Score (NPS) e satisfação ao finalizar diagnósticos ou contratações.
7. 👤 **Transbordo / Fila Virtual com Atendente Humano:**
   - Máquina de estados virtual (`QUEUED`, `ASSIGNED`, `IN_SERVICE`, `COMPLETED`) com cálculo dinâmico de posição na fila (#2, #1) e tempo estimado de resposta.
8. **Arquitetura Híbrida de IA & Guardrails Multicamadas:**
   - **Tier 0 Fast Router:** Roteamento determinístico em <5ms para intenções transacionais diretas.
   - **Esteira de 4 Guardrails:** Proteção Anti-Jailbreak/Prompt Injection, restrição de escopo de domínio de Telecom, grounding anti-alucinação financeira e validação estruturada com Zod Schema.
   - **Continuidade offline explicitamente marcada:** respostas e catálogos locais são prévias e não confirmam pagamentos, contratos ou chamados.
9. **Segurança Rigorosa (BFF):**
   - Credenciais ficam no backend por desenho; produção exige segredos configurados fora do repositório e rotação antes do release.

---

## 🏛️ Arquitetura do Sistema

```mermaid
graph TB
    subgraph ClientLayer["📱 Camada do Cliente"]
        Mobile["📱 Mobile App (React Native / Expo)"]
        Web["💻 Web Preview / PWA"]
    end

    subgraph BFFLayer["🛡️ Backend for Frontend (BFF Seguro)"]
        Security["🛡️ Security & Auth Gate\n(CORS, Helmet, Rate Limit, Input Sanitizer)"]
        
        subgraph PipelineIA["🧠 Orquestrador Híbrido de IA & Segurança"]
            FastRouter["⚡ Fast Router (<5ms)\n(Comandos Determinísticos)"]
            GuardrailIn["🛡️ Input Guardrail\n(Anti-Jailbreak & Escopo)"]
            ContextBuilder["📦 Dynamic Context Builder\n(Injeta Cliente, Contratos, Faturas)"]
            Gemini["☁️ Google Gemini Provider\n(Google AI Studio - Gemini Flash)"]
            Fallback["⚙️ Heuristic Fallback Engine\n(Regras e Estado Offline)"]
            GuardrailOut["🔒 Output Guardrail\n(Zod Schema & LGPD Sanitizer)"]
        end

        subgraph Modules["🧩 Módulos de Negócio DBS Telecom"]
            AuthMod["👤 Autenticação & Usuários (Senha=CPF)"]
            ChatMod["💬 Gestão de Sessões de Chat"]
            FinMod["💳 Financeiro (fn_areceber / Boletos / PIX)"]
            SupMod["🛠️ Suporte (Máquina de Diagnóstico / Chamados)"]
            ComMod["🚀 Comercial (Planos Urbanos / Wi-Fi 6)"]
        end

        IXCConnector["🔌 Conector IXC WebService v1\n(POST JSON, qtype, Basic Auth)"]
    end

    subgraph External["☁️ Serviços Externos"]
        IXCERP[("🏢 ERP IXC Soft\n(demo.ixcsoft.com.br)")]
        GoogleAI[("🧠 Google AI Studio\n(Gemini 2.5/1.5 Flash API)")]
    end

    Mobile --> Security
    Web --> Security
    Security --> FastRouter
    FastRouter -.->|Se ambíguo| GuardrailIn
    GuardrailIn --> ContextBuilder
    ContextBuilder --> IXCConnector
    IXCConnector --> IXCERP
    ContextBuilder --> Gemini
    Gemini --> GoogleAI
    Gemini -.->|Se offline/quota| Fallback
    Gemini --> GuardrailOut
    Fallback --> GuardrailOut
    GuardrailOut --> ChatMod

    Security --> AuthMod & FinMod & SupMod & ComMod
    AuthMod & FinMod & SupMod --> IXCConnector
```

---

## 📚 Documentação Técnica Completa

A documentação do projeto está dividida em manuais técnicos especializados:

| Documento | Descrição |
| :--- | :--- |
| 🌐 [**Swagger / OpenAPI 3.0 Interativo**](http://localhost:3000/api/docs) | Documentação interativa em Swagger UI servida em `http://localhost:3000/api/docs` com suporte a Bearer Auth. |
| 🏗️ [**Arquitetura do Sistema**](docs/ARQUITETURA.md) | Detalhamento do padrão BFF, orquestrador de IA híbrido em 4 níveis, Context Builder e resiliência. |
| 🔌 [**Integração API IXC Soft & BFF**](docs/API_IXC.md) | Manual do WebService v1 do IXC e referência completa de todos os endpoints REST da API BFF. |
| 💬 [**Fluxos de Atendimento**](docs/FLUXOS_ATENDIMENTO.md) | Mapeamento dos 4 fluxos obrigatórios, Script de Vendas, 3 passos de diagnóstico e regras financeiras. |
| 🛡️ [**Guardrails e Segurança**](docs/GUARDRAILS_E_SEGURANCA.md) | Especificação das 4 camadas de guardrails, catálogo de ataques bloqueados, LGPD, JWT e Anti-IDOR. |
| 🎯 [**Guia de Apresentação**](docs/GUIA_APRESENTACAO.md) | Roteiro de pitch passo a passo (10-15 min) com frases exatas para demonstração dos 100 pontos do desafio. |
| 🧪 [**Manual de Desenvolvimento e Testes**](docs/MANUAL_DE_DESENVOLVIMENTO_E_TESTES.md) | Guia de setup local, execução dos testes do backend, export web atual e emulação Android/iOS. |

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
* **Node.js:** Versão 20 LTS ou superior (mínimo 18+)
* **Docker & Docker Compose** (opcional, para execução conteinerizada)
* **Smartphones com Expo Go** (Android ou iOS) ou Navegador Web moderno

---

### Opção 1: Execução com Docker (Recomendada para o Backend)

```bash
# 1. Clone o repositório
git clone https://github.com/usuario/dbs-telecom.git
cd dbs-telecom

# 2. Configure os segredos e origens exigidos pelo Compose
cp .env.example .env
# Edite .env e substitua todos os placeholders; produção falha sem eles.

# 3. Inicie o container do Backend via Docker Compose
docker-compose up -d --build

# 4. Verifique a saúde do serviço e documentação interativa
# API Health: http://localhost:3000/api/health
# Swagger Docs: http://localhost:3000/api/docs
```

---

### Opção 2: Execução Manual (Desenvolvimento Local)

#### 1. Configurando e Executando o Backend
```bash
cd backend

# Copie o arquivo de variáveis de ambiente
cp .env.example .env

# Instale as dependências
npm install

# Execute a suíte de testes automatizados do backend
npm test

# Inicie o servidor em modo de desenvolvimento com hot-reload
npm run dev
```
> O backend estará respondendo em: `http://localhost:3000` (Swagger UI em `http://localhost:3000/api/docs`).

#### 2. Configurando e Executando o Aplicativo Mobile
```bash
cd ../mobile

# Copie o arquivo de variáveis de ambiente
cp .env.example .env

# Instale as dependências
npm install

# Inicie o Expo Metro Bundler
npm start
```

**Opções de Execução no Terminal do Expo:**
* Pressione **`w`** para abrir no navegador web (**Web Preview** instantâneo no Google Chrome / Edge).
* Pressione **`a`** para abrir no **Emulador Android** (Android Studio).
* Escaneie o **QR Code** gerado no terminal usando o aplicativo **Expo Go** no seu smartphone (Android/iOS na mesma rede Wi-Fi).

---

## ⚙️ Variáveis de Ambiente (`.env`)

### Backend (`backend/.env`)
| Variável | Valor Padrão / Exemplo | Descrição |
| :--- | :--- | :--- |
| `PORT` | `3000` | Porta HTTP do servidor Express. |
| `NODE_ENV` | `development` | Ambiente de execução (`development`, `production`, `test`). |
| `CORS_ORIGIN` | `http://localhost:8081` | Lista de origens web permitidas. Use origens explícitas em produção. |
| `DBS_DEMO_MODE` | `false` | Habilita fixtures rotuladas apenas fora de produção. Nunca é aceito em produção. |
| `JWT_SECRET` | `defina fora do repositório` | Chave secreta para assinatura dos tokens JWT Anti-IDOR. Nunca use valor padrão. |
| `JWT_EXPIRES_IN` | `7d` | Tempo de expiração do token JWT. |
| `DB_PATH` | `./data/dbs_telecom.sqlite` | Caminho do banco de dados SQLite para persistência do chat. |
| `IXC_BASE_URL` | `defina para o ambiente` | URL base do WebService v1 do ERP IXC. |
| `IXC_TOKEN` | `defina fora do repositório` | Token de integração com o IXC Soft. Nunca documente ou comite o valor real. |
| `PIX_WEBHOOK_SECRET` | `defina fora do repositório` | Segredo HMAC de no mínimo 32 caracteres para validar webhooks PIX. |
| `AI_PROVIDER` | `gemini` | Provedor de IA (`gemini`, `openai`, `hybrid` ou `mock` apenas em testes). |
| `GEMINI_API_KEY` | `defina fora do repositório` | Chave de API do Google AI Studio. Nunca documente ou comite o valor real. |
| `GEMINI_MODEL` | `gemini-flash-lite-latest` | Modelo de IA (`gemini-flash-lite-latest`, `gemini-3.5-flash-lite`). |
| `AI_TEMPERATURE` | `0.2` | Temperatura para respostas precisas e determinísticas. |
| `AI_GUARDRAILS_ENABLED` | `true` | Habilita a esteira multicamadas de segurança. |

### Mobile (`mobile/.env`)
| Variável | Valor Padrão | Descrição |
| :--- | :--- | :--- |
| `EXPO_PUBLIC_API_URL` | `http://localhost:3000/api` | URL base da API do Backend BFF. No emulador Android, o app conecta automaticamente via `http://10.0.2.2:3000/api`. |

O perfil EAS `production` exige `EXPO_PUBLIC_API_URL` apontando para um backend HTTPS não local. `mobile/app.config.js` interrompe o build se a variável estiver ausente ou apontar para localhost/emulador.

Os módulos locais de Wi-Fi/TR-069, telemetria óptica e indicações são adaptadores de demonstração, não integrações de operadora. Eles retornam dados marcados como `DEMO` somente com `DBS_DEMO_MODE=true` fora de produção; em produção, respondem `503 PROVIDER_NOT_CONFIGURED` até que provedores reais sejam implementados. Notificações de exemplo também existem apenas no modo demo.

---

## 🧪 Testes Automatizados

O projeto possui testes unitários e de integração utilizando **Vitest**. A contagem e o resultado devem vir da execução atual; isso não significa que provedores externos, builds nativos ou produção estejam aprovados. Execute a suíte no ambiente alvo antes de publicar:

```bash
cd backend
npm test
```

A suíte padrão zera as credenciais de provedor e usa adaptadores determinísticos. Os contratos reais são opt-in e falham visivelmente quando a configuração necessária não existe:

```bash
cd backend
# Configure IXC_TOKEN, LIVE_IXC_CLIENT_ID e GEMINI_API_KEY no ambiente.
# PowerShell:
$env:RUN_LIVE_CONTRACTS='true'
npm run test:live-contracts
```

O mobile também possui testes unitários para a política de restauração de sessão:

```bash
cd mobile
npm test
npm run typecheck
```

### 🧭 Jornadas E2E no Web Preview

```bash
cd e2e
npm install
npm test
```

O `webServer` do Playwright executa um novo `expo export --platform web` antes de iniciar um backend isolado com adaptadores de teste explícitos. Assim, os cenários de Atendimento, Faturas, Planos e Perfil exercitam o código atual de `mobile/`, e não um `mobile/dist` antigo nem provedores externos instáveis. A suíte web não substitui a validação em Android/iOS nem um smoke test com IXC/Gemini reais.

---

## 🧭 Matriz de Avaliação Atual

| Critério | Peso | Status | Onde foi Implementado / Evidências |
| :--- | :---: | :---: | :--- |
| **Funcionamento do MVP** | **25%** | ✅ **Validado localmente** | Build web atual e jornadas desktop/mobile-browser cobrem Login, Chat, Faturas, Planos e Perfil; o binário nativo ainda exige prova em dispositivo. |
| **Integração com API IXC** | **25%** | ⚠️ **Validar ao vivo** | Integração prevista com `/cliente`, `/fn_areceber`, `/cliente_contrato` e `/su_oss_chamado`; requer credenciais e smoke test do provedor. |
| **Funcionamento do Chat / IA** | **15%** | ⚠️ **Validar ao vivo** | O app diferencia servidor e prévia local; quota, timeout e indisponibilidade do Gemini devem aparecer como falha honesta. |
| **Classificação dos Setores** | **10%** | ✅ **Implementado localmente** | Roteamento para Comercial, Suporte e Financeiro com badge visual e cards contextuais. |
| **Qualidade do Código & Arquitetura** | **10%** | ✅ **Validado localmente** | Router, chat, API mobile e Perfil estão modularizados; build, testes, typecheck, Expo Doctor e export web são os gates locais. |
| **Segurança das Informações** | **5%** | ⚠️ **Bloqueado até rotação** | Segredos devem ficar fora do bundle e do Git; rotação, autorização e fail-closed precisam ser comprovados no ambiente alvo. |
| **Interface e UX** | **5%** | ✅ **Implementado localmente** | Design System DBS Telecom, feedback visual, estados offline/demo e microinterações táteis. |
| **Documentação e Apresentação** | **5%** | ✅ **Atualizada** | Documentos descrevem SDK 57, setup, arquitetura modular, fluxos e limites entre evidência local, nativa e de provedores. |

---

## 👥 Autores & Créditos

Projeto desenvolvido com excelência técnica para o **Desafio Técnico — DBS Telecom**.
* **Operadora:** DBS Telecom — "A Internet que você merece!"
* **Tecnologias:** React Native, Expo, Node.js, Express, TypeScript, Google Gemini, IXC Soft ERP, Docker, Vitest.
