import { test, expect } from '@playwright/test';
import { loginTestCustomer } from './helpers/auth';

test.describe('💬 2. Digital Support & Chatbot Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and login
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await loginTestCustomer(page);
  });

  test('deve carregar a saudação inicial do assistente virtual Davi', async ({ page }) => {
    await expect(page.getByText('Davi • DBS Telecom').first()).toBeVisible({ timeout: 10000 });
    // A saudação é baseada no horário do servidor (Bom dia/Boa tarde/Boa noite).
    await expect(page.getByText(/Olá|Bom dia|Boa tarde|Boa noite/i).first()).toBeVisible();
    await expect(page.getByText(/Modo demonstração local|Atendimento conectado ao servidor|Conectando ao atendimento|Sem internet/i).first()).toBeVisible();
    await expect(page.getByText(/Atendimento Digital/i).first()).toBeVisible();
  });

  test('deve interagir com chips de sugestões rápidas e receber card de fatura', async ({ page }) => {
    // Clica no chip "Preciso do meu boleto 💳"
    const boletoChip = page.getByRole('button', { name: /Preciso do meu boleto/i }).first();
    await expect(boletoChip).toBeVisible();
    await boletoChip.click();

    // Aguarda resposta do bot com card de fatura
    await expect(page.getByText(/Central de Faturas|Fatura|Mensalidade/i).first()).toBeVisible({ timeout: 12000 });
    await expect(page.getByText(/R\$\s*\d+/i).first()).toBeVisible();

    // Em prévia local, ações financeiras ficam bloqueadas para não induzir pagamento.
    const localPreview = page.getByText(/AMBIENTE DE DEMONSTRAÇÃO|PRÉVIA LOCAL|Prévia local: confirme a fatura/i).first();
    if (await localPreview.isVisible().catch(() => false)) {
      await expect(page.getByRole('button', { name: /Pagar com PIX|PIX indisponível/i }).first()).toBeDisabled();
      await expect(page.getByRole('button', { name: /Visualizar|Boleto PDF indisponível/i }).first()).toBeDisabled();
    } else {
      const copyCodeBtn = page.getByText('Copiar Código').first();
      await expect(copyCodeBtn).toBeVisible();
      await copyCodeBtn.click();

      const pixBtn = page.getByText('Pagar com PIX').first();
      await expect(pixBtn).toBeVisible();
      await pixBtn.click();
    }
  });

  test('deve executar o fluxo completo de pré-diagnóstico de suporte técnico em 3 etapas com CSAT', async ({ page }) => {
    const input = page.getByPlaceholder('Digite sua dúvida ou solicitação...');
    await input.fill('minha internet está lenta');
    await page.getByTestId('send-message-btn').click();

    // Etapa 1: Identificação de Dispositivos
    await expect(page.getByText(/Suporte Técnico Inteligente|Diagnóstico/i).first()).toBeVisible({ timeout: 12000 });
    await expect(page.getByText(/Etapa 1 de 3/i).first()).toBeVisible();

    const step1Btn = page.getByRole('button', { name: /Acontece em todos os aparelhos/i }).first();
    await expect(step1Btn).toBeVisible();
    await step1Btn.click();

    // Etapa 2: Verificação de Cabos
    await expect(page.getByText(/Etapa 2 de 3/i).first()).toBeVisible({ timeout: 12000 });
    const step2Btn = page.getByRole('button', { name: /Sim, luzes verdes e cabos firmes/i }).first();
    await expect(step2Btn).toBeVisible();
    await step2Btn.click();

    // Etapa 3: Reinicialização
    await expect(page.getByText(/Etapa 3 de 3/i).first()).toBeVisible({ timeout: 12000 });
    const step3Btn = page.getByRole('button', { name: /Conexão normalizou/i }).first();
    await expect(step3Btn).toBeVisible();
    await step3Btn.click();

    // Finalização e Pesquisa de Satisfação (CSAT)
    await expect(page.getByText(/Conexão 100% Restabelecida|Restabelecida|Normalizada/i).first()).toBeVisible({ timeout: 12000 });
    await expect(page.getByText('Pesquisa de Satisfação').first()).toBeVisible();

    // Seleciona tag e confirma CSAT
    const tagChip = page.getByText(/Rápido e Prático/i).first();
    if (await tagChip.isVisible()) {
      await tagChip.click();
    }

    const confirmCsatBtn = page.getByText('Confirmar Avaliação').first();
    await confirmCsatBtn.click();

    await expect(page.getByText('Obrigado pela sua avaliação!').first()).toBeVisible({ timeout: 8000 });
  });

  test('deve acionar o transbordo para fila virtual de atendimento humano', async ({ page }) => {
    const atendenteChip = page.getByRole('button', { name: /Falar com atendente/i }).first();
    await expect(atendenteChip).toBeVisible();
    await atendenteChip.click();

    // Card de Fila Virtual — aguarda qualquer texto de fila ou atendimento humano
    await expect(page.getByText(/Fila Virtual de Atendimento Humano|Atendente Humano Conectado|Fila de Espera/i).first()).toBeVisible({ timeout: 15000 });

    // Verifica que algum chip de opção está disponível
    await expect(page.getByRole('button', { name: /Cancelar espera|Ver status da fila|internet está lenta/i }).first()).toBeVisible({ timeout: 8000 });
  });
});
