# Guia de apresentação

## Objetivo

Demonstrar o autoatendimento da DBS Telecom com segurança, transparência de dados e continuidade de atendimento. Use apenas contas e dados autorizados para demonstração.

## Roteiro

1. Mostre a tela de login, a validação de documento e a mensagem de indisponibilidade quando o servidor não responde.
2. Após uma autenticação autorizada, apresente a saudação, os atalhos de chat e o indicador de proveniência.
3. Envie uma mensagem de suporte e explique o streaming, o fallback e a outbox offline.
4. Navegue pelo financeiro: confirme que ações de pagamento só são liberadas para retorno confirmado, e ficam bloqueadas em prévia/local.
5. Abra perfil, chamados, Wi-Fi, diagnóstico óptico e speed test. Mostre que status desconhecido não é apresentado como sucesso e que ações de roteador exigem dados confirmados.
6. Navegue pelo catálogo e pela indicação. Explique a diferença entre simulação e contratação confirmada.

## Evidências recomendadas

- `npm.cmd test` e `npm.cmd run build` no backend.
- `npm.cmd run typecheck` e `npm.cmd test` no mobile.
- `npm.cmd test` em `e2e` para as jornadas web em desktop e viewport mobile.
- Build EAS concluído para o APK Android e instalação em aparelho quando disponível.
- `GET /api/health/ready` após a publicação do Worker.

## Regras de segurança na demonstração

- Não exiba CPF, senha, e-mail, endereço, número de contrato, linha digitável, chave PIX, token ou URL assinada.
- Não trate dados de demonstração como se fossem operação real.
- Não afirme que IXC, Gemini, PIX, e-mail ou roteador executaram uma ação sem a resposta autenticada correspondente.
- A saída da demonstração deve incluir quais verificações foram locais e quais foram feitas no ambiente publicado.
