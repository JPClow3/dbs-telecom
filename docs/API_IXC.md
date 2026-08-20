# 🔌 Documentação de Integração — API IXC Soft & Backend BFF

Este documento é a referência técnica completa para a integração entre o **Backend BFF da DBS Telecom** e o **WebService v1 do IXC Soft ERP**, além de documentar todos os endpoints REST expostos pelo BFF para o aplicativo mobile e aplicações clientes.

---

## 📖 Documentação Interativa Swagger / OpenAPI 3.0

O backend da DBS Telecom disponibiliza uma interface interativa completa no padrão OpenAPI 3.0:

* 🌐 **Swagger UI Interativo:** [http://localhost:3000/api/docs](http://localhost:3000/api/docs)
* 📄 **Especificação OpenAPI JSON:** [http://localhost:3000/api/docs.json](http://localhost:3000/api/docs.json)
* 🔐 **Autorização no Swagger:** Clique no botão **Authorize** no topo do Swagger UI e informe o token JWT gerado pelo endpoint `/api/auth/login`.

---

## 🔐 Mecanismo de Autenticação JWT & Proteção Anti-IDOR

1. **Emissão de Token JWT:** No endpoint `/api/auth/login`, após validar o CPF e senha (onde a senha padrão é o CPF), o servidor emite um token JWT assinado contendo `clientId`, `cpfCnpj`, `name` e `role`.
2. **Middleware `authMiddleware`:** Todas as rotas de dados sensíveis exigem o cabeçalho `Authorization: Bearer <token>`.
3. **Proteção Anti-IDOR (Insecure Direct Object Reference):** O middleware `enforceAntiIdor` compara o `clientId` solicitado na rota/corpo com o `clientId` contido no token JWT. Se um usuário tentar acessar dados de outro cliente, a requisição é bloqueada imediatamente com **HTTP 403 Forbidden** (`IDOR_FORBIDDEN`).
4. **Alias `me`:** É suportado o alias `/api/financial/invoices/me` para resolver automaticamente para o cliente autenticado.

---

## 💾 Persistência de Conversas e Histórico de Chat em SQLite

* O `ChatService` armazena duravelmente todas as sessões e o histórico de mensagens no banco de dados **SQLite** (`better-sqlite3`).
* Mesmo se o servidor Node.js for reiniciado ou o cliente fechar o aplicativo, todo o histórico de mensagens, intenções e cards contextuais permanece intacto.
* Endpoint de consulta de histórico persistido: `GET /api/chat/history/:sessionId`.

---

## 1. Especificação do Protocolo IXC Soft WebService v1

### 1.1 Configurações de Conexão e Autenticação
* **URL Base do ERP:** `https://demo.ixcsoft.com.br/webservice/v1`
* **Token de Integração:** `replace-with-a-rotated-ixc-token`
* **Mecanismo de Autenticação:** `Authorization: Basic <base64(TOKEN)>`
  - Valor codificado: `Basic MTA1OjFjMGUyZDc2NGJlODQxZDliODhiMDI0MTQzMzdkN2JiYzJkZDRlMWJiOTQwMjk1MzQzYjM2ZDMxY2JhYTlmOTg=`

### 1.2 Headers Obrigatórios em Requisições de Consulta
```http
POST /webservice/v1/cliente HTTP/1.1
Host: demo.ixcsoft.com.br
Authorization: Basic MTA1OjFjMGUyZDc2NGJlODQxZDliODhiMDI0MTQzMzdkN2JiYzJkZDRlMWJiOTQwMjk1MzQzYjM2ZDMxY2JhYTlmOTg=
Content-Type: application/json
ixcsoft: listar
```

> [!NOTE]
> O header `ixcsoft: listar` é obrigatório no WebService v1 do IXC para requisições de listagem, paginação e filtragem via método `POST`.

### 1.3 Estrutura do Payload de Consulta (`qtype` / `oper` / `query`)
Todas as consultas no WebService v1 do IXC utilizam o formato de query relacional:
```json
{
  "qtype": "tabela.campo",
  "query": "valor_a_buscar",
  "oper": "=",
  "page": "1",
  "rp": "20",
  "sortname": "tabela.id",
  "sortorder": "desc"
}
```
* `qtype`: Nome da tabela e coluna a filtrar (ex: `cliente.cnpj_cpf`, `fn_areceber.id_cliente`).
* `query`: Valor do filtro pesquisado.
* `oper`: Operador relacional (`=`, `>`, `<`, `LIKE`, `IN`).
* `page`: Número da página (base 1).
* `rp`: Registros por página (Records per Page).
* `sortname`: Coluna para ordenação.
* `sortorder`: Direção da ordenação (`asc` ou `desc`).

---

## 2. Endpoints do ERP IXC Soft Mapeados

### 2.1 Consulta de Clientes (`/cliente`)
Utilizado no **Fluxo 1 (Identificação & Boas-vindas)** e no **Módulo de Autenticação (Login: CPF / Senha: CPF)**.

* **Método:** `POST`
* **URL:** `https://demo.ixcsoft.com.br/webservice/v1/cliente`
* **Exemplo de Requisição cURL:**
```bash
curl -X POST https://demo.ixcsoft.com.br/webservice/v1/cliente \
  -H "Authorization: Basic MTA1OjFjMGUyZDc2NGJlODQxZDliODhiMDI0MTQzMzdkN2JiYzJkZDRlMWJiOTQwMjk1MzQzYjM2ZDMxY2JhYTlmOTg=" \
  -H "Content-Type: application/json" \
  -H "ixcsoft: listar" \
  -d '{
    "qtype": "cliente.cnpj_cpf",
    "query": "154.293.707-89",
    "oper": "=",
    "page": "1",
    "rp": "1",
    "sortname": "cliente.id",
    "sortorder": "desc"
  }'
```
* **Exemplo de Resposta de Sucesso:**
```json
{
  "page": "1",
  "total": "1",
  "registros": [
    {
      "id": "2270",
      "razao": "Emanuel da Silva",
      "fantasia": "Emanuel Silva",
      "cnpj_cpf": "154.293.707-89",
      "email": "emanuel.silva@dbstelecom.com.br",
      "fone": "49988776655",
      "ativo": "S",
      "endereco": "Av. Brasil",
      "numero": "1500",
      "bairro": "Centro",
      "cidade": "4376"
    }
  ]
}
```

---

### 2.2 Consulta de Faturas e Boletos (`/fn_areceber`)
Utilizado no **Fluxo 4 (Financeiro / 2ª Via de Boleto e PIX)**.

* **Método:** `POST`
* **URL:** `https://demo.ixcsoft.com.br/webservice/v1/fn_areceber`
* **Payload de Requisição:**
```json
{
  "qtype": "fn_areceber.id_cliente",
  "query": "2270",
  "oper": "=",
  "page": "1",
  "rp": "10",
  "sortname": "fn_areceber.data_vencimento",
  "sortorder": "asc"
}
```
* **Exemplo de Resposta:**
```json
{
  "page": "1",
  "total": "1",
  "registros": [
    {
      "id": "145690",
      "id_cliente": "2270",
      "status": "A",
      "data_emissao": "2026-08-10",
      "data_vencimento": "2026-09-10",
      "valor": "119.90",
      "valor_aberto": "119.90",
      "documento": "71820",
      "linha_digitavel": "04790000020000014569803047711654260000011990",
      "tipo_recebimento": "Boleto",
      "obs": "Plano DBS Fibra 500MB (Com desconto pontualidade)"
    }
  ]
}
```

---

### 2.3 Consulta de Contratos de Conexão (`/cliente_contrato`)
Utilizado para verificar o status da assinatura, endereços de conexão e suporte técnico.

* **Método:** `POST`
* **URL:** `https://demo.ixcsoft.com.br/webservice/v1/cliente_contrato`
* **Payload de Requisição:**
```json
{
  "qtype": "cliente_contrato.id_cliente",
  "query": "2270",
  "oper": "=",
  "page": "1",
  "rp": "5",
  "sortname": "cliente_contrato.id",
  "sortorder": "desc"
}
```
* **Exemplo de Resposta:**
```json
{
  "page": "1",
  "total": "1",
  "registros": [
    {
      "id": "2323",
      "id_cliente": "2270",
      "status": "A",
      "id_vd_plano": "10",
      "contrato": "Contrato Fibra Ótica 500MB DBS"
    }
  ]
}
```

---

### 2.4 Abertura de Ordem de Serviço / Chamado Técnico (`/su_oss_chamado`)
Utilizado no **Fluxo 3 (Suporte Técnico)** quando os 3 passos de diagnóstico não solucionam a lentidão/queda.

* **Método:** `POST` (sem header `ixcsoft: listar`)
* **URL:** `https://demo.ixcsoft.com.br/webservice/v1/su_oss_chamado`
* **Payload de Envio:**
```json
{
  "id_cliente": "2270",
  "id_contrato": "2323",
  "id_filial": "1",
  "tipo": "C",
  "assunto": "Lentidão / Oscilação reportada via App Mobile DBS",
  "mensagem": "Cliente efetuou diagnóstico guiado no aplicativo (verificação de múltiplos aparelhos, cabos/LEDs e reinicialização por 30s), porém a lentidão persiste.",
  "origem_endereco": "C",
  "prioridade": "M",
  "status": "A"
}
```
* **Resposta de Sucesso:**
```json
{
  "type": "success",
  "message": "Registro inserido com sucesso!",
  "id": "8472"
}
```

---

## 3. Catálogo de Endpoints da API REST do Backend BFF

Todas as rotas do BFF são servidas com prefixo `/api` e implementam sanitização, validação e tratamento de erros:

### 3.1 `GET /api/health`
Verifica a saúde do backend, a conectividade com o IXC e a configuração do motor de IA Gemini.
* **Resposta 200 OK:**
```json
{
  "status": "online",
  "system": "DBS Telecom Smart Service BFF",
  "timestamp": "2026-08-19T19:00:00.000Z",
  "ixcBaseUrl": "https://demo.ixcsoft.com.br/webservice/v1",
  "ai": {
    "provider": "gemini",
    "geminiConfigured": true,
    "geminiModel": "gemini-flash-lite-latest",
    "guardrailsEnabled": true,
    "temperature": 0.2
  }
}
```

---

### 3.2 `POST /api/auth/login`
Autenticação de clientes onde a **senha padrão de acesso é o próprio CPF/CNPJ** do cliente cadastrado no IXC (apenas dígitos).
* **Payload:**
```json
{
  "cpfCnpj": "154.293.707-89",
  "password": "15429370789"
}
```
* **Resposta 200 OK:**
```json
{
  "found": true,
  "authenticated": true,
  "client": {
    "id": "2270",
    "nome": "Emanuel da Silva",
    "fantasia": "Emanuel Silva",
    "cpfCnpj": "154.293.707-89",
    "email": "emanuel.silva@dbstelecom.com.br",
    "telefone": "49988776655",
    "endereco": "Av. Brasil, 1500 - Centro, Chapecó"
  },
  "contracts": [
    {
      "id": "2323",
      "id_cliente": "2270",
      "status": "A",
      "id_vd_plano": "10"
    }
  ]
}
```

---

### 3.3 `POST /api/auth/sync-users`
Varre a base do ERP IXC (`/cliente`), gera as credenciais de acesso padrão (`login: CPF` e `senha: CPF`) e sincroniza com a base de usuários do sistema.
* **Query Params:** `?limit=50`
* **Resposta 200 OK:**
```json
{
  "success": true,
  "message": "Criados/sincronizados 50 usuários da base IXC com senha padrão = CPF.",
  "totalProcessed": 50,
  "users": [ ... ]
}
```

---

### 3.4 `POST /api/chat/greeting`
Gera a mensagem de abertura do atendimento chamando o cliente pelo primeiro nome recuperado do IXC.
* **Payload:** `{ "clientId": "2270" }`
* **Resposta 200 OK:**
```json
{
  "id": "msg-1724090000-a1b2c",
  "sender": "BOT",
  "text": "Olá, Emanuel! 👋\n\nSou o assistente virtual da **DBS TELECOM**. Como posso te ajudar hoje? Escolha uma das opções rápidas abaixo ou digite sua dúvida:",
  "timestamp": "2026-08-19T19:00:00.000Z",
  "department": "GERAL",
  "aiProvider": "fast-route",
  "aiModel": "dbs-fast-router-v1",
  "quickOptions": [
    "Preciso do meu boleto 💳",
    "Minha internet está lenta 🛠️",
    "Quero contratar ou mudar de plano 🚀",
    "Conhecer planos Wi-Fi 6 📶"
  ]
}
```

---

### 3.5 `POST /api/chat/message`
Processamento principal de mensagens com a esteira **Fast Router + Guardrails + Gemini + Dynamic Context Bundle + Fallback**.
* **Payload:**
```json
{
  "sessionId": "session-2270",
  "message": "Preciso da minha fatura deste mês",
  "clientId": "2270"
}
```
* **Resposta 200 OK:**
```json
{
  "id": "msg-1724090001-d3e4f",
  "sender": "BOT",
  "text": "💳 **Central de Faturas DBS Telecom**\n\nLocalizei sua fatura em aberto no valor de **R$ 119,90** com vencimento em **10/09/2026**.\n\nVocê pode copiar a linha digitável ou a chave PIX abaixo para pagar com rapidez e confirmação instantânea:",
  "timestamp": "2026-08-19T19:00:01.000Z",
  "department": "FINANCEIRO",
  "aiProvider": "fast-route",
  "aiModel": "dbs-fast-router-v1",
  "guardrailApplied": false,
  "quickOptions": [
    "Copiar código de barras",
    "Copiar PIX",
    "Falar com atendente"
  ],
  "cards": {
    "type": "INVOICE",
    "invoices": [
      {
        "id": "145690",
        "documento": "71820",
        "valor": 119.9,
        "valorFormatado": "R$ 119,90",
        "dataEmissao": "2026-08-10",
        "dataVencimento": "2026-09-10",
        "dataVencimentoFormatada": "10/09/2026",
        "status": "PENDENTE",
        "linhaDigitavel": "04790000020000014569803047711654260000011990",
        "linhaDigitavelFormatada": "04790.00002 00000.145698 03047.711654 2 60000011990",
        "pixCopiaECola": "00020126580014br.gov.bcb.pix0136dbstelecom-145690-pix@dbstelecom.com.br5204000053039865406119.905802BR5911DBS TELECOM6007CHAPECO62070503***6304",
        "obs": "Plano DBS Fibra 500MB (Com desconto pontualidade)",
        "isOverdue": false
      }
    ]
  }
}
```

---

### 3.6 `GET /api/financial/invoices/:clientId`
Consulta faturas diretamente no IXC e retorna DTOs enriquecidos com códigos de barras e chave PIX formatada.
* **Exemplo:** `GET /api/financial/invoices/2270`
* **Resposta 200 OK:**
```json
{
  "total": 1,
  "invoices": [
    {
      "id": "145690",
      "documento": "71820",
      "valor": 119.9,
      "valorFormatado": "R$ 119,90",
      "dataEmissao": "2026-08-10",
      "dataVencimento": "2026-09-10",
      "dataVencimentoFormatada": "10/09/2026",
      "status": "PENDENTE",
      "linhaDigitavel": "04790000020000014569803047711654260000011990",
      "linhaDigitavelFormatada": "04790.00002 00000.145698 03047.711654 2 60000011990",
      "pixCopiaECola": "00020126580014br.gov.bcb.pix0136dbstelecom-145690-pix@dbstelecom.com.br5204000053039865406119.905802BR5911DBS TELECOM6007CHAPECO62070503***6304",
      "obs": "Plano DBS Fibra 500MB (Com desconto pontualidade)",
      "isOverdue": false
    }
  ]
}
```

---

### 3.7 `GET /api/commercial/plans`
Retorna o catálogo oficial de planos da DBS Telecom com suporte a filtro por tipo (`URBANO` ou `WIFI6`).
* **Query Params:** `?type=URBANO` ou `?type=WIFI6`
* **Resposta 200 OK:**
```json
{
  "total": 6,
  "plans": [
    {
      "id": "dbs-400",
      "name": "Seja DBS 400MB",
      "speed": "400 Mega",
      "downloadMbps": 400,
      "uploadMbps": 200,
      "price": 109.9,
      "type": "URBANO",
      "description": "Ideal para navegação diária, redes sociais e streaming em HD.",
      "recommendedForDevices": "Até 4 dispositivos",
      "features": [
        "Download 400 Mbps / Upload 200 Mbps",
        "Instalação 100% gratuita no plano fidelidade",
        "Wi-Fi Dual Band incluso",
        "Valor fixo mensal"
      ]
    },
    {
      "id": "dbs-500",
      "name": "Ideal DBS 500MB",
      "speed": "500 Mega",
      "downloadMbps": 500,
      "uploadMbps": 250,
      "price": 139.9,
      "priceOnTime": 119.9,
      "type": "URBANO",
      "isPopular": true,
      "description": "Nosso plano mais vendido! Perfeito para famílias conectadas e home office.",
      "recommendedForDevices": "De 4 a 8 dispositivos",
      "features": [
        "Download 500 Mbps / Upload 250 Mbps",
        "Super desconto até o vencimento: R$ 119,90",
        "Instalação gratuita com fidelidade 12 meses",
        "Roteador Dual Band alta performance"
      ]
    }
  ]
}
```

---

### 3.8 `POST /api/support/diagnostic`
Executa e avança a máquina de estados do diagnóstico guiado de suporte.
* **Payload para iniciar:** `{ "clientId": "2270", "action": "start" }`
* **Payload para responder etapa:** `{ "clientId": "2270", "userResponse": "Sim, luzes verdes e cabos firmes" }`

---

## 4. Matriz de Tratamento de Erros e Casos de Borda

| Cenário | Resposta do IXC | Comportamento do Backend BFF | Resposta Entregue ao Usuário |
| :--- | :--- | :--- | :--- |
| **CPF não cadastrado** | `total: "0"`, `registros: []` | Retorna `found: false` (404) e oferece fluxo comercial. | *"Não localizei um cadastro com esse documento. Que tal conhecer nossos planos de ultravelocidade?"* |
| **Cliente adimplente** | `registros: []` em `/fn_areceber` | Retorna lista vazia e mensagem amigável de quitação. | *"Excelente notícia! Você está 100% em dia com a DBS Telecom e não possui faturas pendentes. 🌟"* |
| **Instabilidade no IXC** | HTTP 5xx ou Timeout (>10s) | Aciona 3 tentativas com backoff exponencial; caso persista, ativa DTOs locais de fallback. | *"Estamos consultando a base da DBS Telecom. Se preferir, você pode aguardar alguns instantes ou falar com nosso atendente."* |
| **Prompt Injection** | N/A | Tier 1 Guardrail bloqueia antes de chamar o IXC ou o Gemini. | Reafirma papel institucional da DBS Telecom com cordialidade. |
