# Fluxos de atendimento

Os fluxos abaixo são regras de produto. Em todos eles, a interface deve distinguir dados confirmados pelo provedor de prévias locais, indisponibilidade e ações bloqueadas.

## Identificação e sessão

1. A pessoa informa documento e senha na tela de login.
2. O BFF consulta o IXC e valida a credencial no servidor.
3. Em sucesso, cria sessão JWT associada ao cliente autenticado e carrega contratos autorizados.
4. Documento inexistente, falha de autenticação e indisponibilidade recebem mensagens diferentes; não se cria sessão parcial.

## Chat e IA

1. O app solicita a saudação e apresenta o estado da fonte do atendimento.
2. Ao enviar mensagem, adiciona o texto do usuário e uma resposta em streaming.
3. O stream precisa terminar com um evento `done`. Timeout, fechamento incompleto ou falha acionam fallback/estado de indisponibilidade, sem deixar bolha vazia.
4. Mensagens enviadas offline entram na outbox e só são removidas após confirmação de entrega.

## Financeiro

1. O BFF consulta faturas do cliente autenticado.
2. Apenas resposta confirmada pelo IXC pode habilitar PDF, copia-e-cola, PIX ou desbloqueio.
3. Prévia local, cache desatualizado ou falha de rede devem exibir aviso e manter ações mutáveis bloqueadas.

## Suporte e fila

1. O diagnóstico orienta o cliente por etapas e registra evidências no atendimento.
2. Após a triagem, o BFF cria chamado ou registra entrada em fila quando o provedor confirmar a operação.
3. O card de fila oferece apenas ações que tenham efeito. O estado “atendimento em andamento” é informativo, não um botão sem ação.
4. Lista vazia confirmada é diferente de falha ao carregar chamados.

## Wi-Fi, óptico e velocidade

1. Dados de roteador e telemetria óptica precisam vir do provedor para serem apresentados como confirmação.
2. Sem sincronização, o app mostra “indisponível”, não “online”, e bloqueia salvar/reiniciar.
3. O speed test solicita confirmação em rede celular, é cancelável ao fechar o modal e descarta resultados de uma medição cancelada.
4. Em demonstração, valores ilustrativos são identificados como prévia e não permitem mutações de roteador.

## Comercial e indicação

1. Planos e simulações podem ser apresentados como catálogo ou prévia conforme a proveniência.
2. Indicação, cópia e compartilhamento só ficam ativos quando houver link confirmado; erro de carregamento não deve mostrar um link vazio.

## Testes

Os cenários desktop e viewport mobile estão em `e2e/tests/`. Eles validam login, chat, faturas, planos, perfil e estados honestos de dados. A aprovação do E2E web não substitui teste do APK em aparelho físico.
