import { test, expect } from '@playwright/test';
import { loginTestCustomer } from './helpers/auth';

test.describe('💳 3. Invoices & Financial Center Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and login
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await loginTestCustomer(page);

    // Navega para a aba de faturas
    const invoicesTab = page.getByText('2ª Via Fatura');
    await invoicesTab.click();
  });

  test('deve identificar o resumo financeiro de demonstração como não confirmado', async ({ page }) => {
    await expect(page.getByText('Central Financeira DBS')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Dados de demonstração')).toBeVisible();
    await expect(page.getByText('TOTAL NÃO CONFIRMADO')).toBeVisible();
    await expect(page.getByText('VENCIMENTO NÃO CONFIRMADO')).toBeVisible();
    await expect(page.getByText(/valores, vencimentos e documentos são ilustrativos/i)).toBeVisible();
    await expect(page.getByText(/R\$\s*\d+/i).first()).toBeVisible();
  });

  test('deve bloquear a chave PIX rápida quando os dados são de demonstração', async ({ page }) => {
    const quickPixBtn = page.getByRole('button', { name: 'PIX indisponível em dados não confirmados' });
    await expect(quickPixBtn).toBeVisible();
    await expect(quickPixBtn).toBeDisabled();
    await expect(page.getByText('PIX indisponível na demonstração')).toBeVisible();
  });

  test('deve filtrar as faturas pelas abas Todas, Em Aberto e Pagas', async ({ page }) => {
    // Filtro Em Aberto — use role=button with matching name to avoid strict mode violation
    const pendingTab = page.getByRole('button', { name: /Em Aberto \(\d+\)/i }).first();
    await pendingTab.click();
    await expect(page.getByText(/Mensalidade DBS Fibra|Tudo em Dia/i).first()).toBeVisible({ timeout: 8000 });

    // Filtro Pagas
    const paidTab = page.getByRole('button', { name: /Pagas \(\d+\)/i }).first();
    await paidTab.click();
    await expect(page.getByText(/Tudo em Dia|Mensalidade DBS Fibra/).first()).toBeVisible({ timeout: 8000 });

    // Volta para Todas
    const allTab = page.getByRole('button', { name: /Todas \(\d+\)/i }).first();
    await allTab.click();
    await expect(page.getByText(/Mensalidade DBS Fibra|R\$\s*\d+/).first()).toBeVisible({ timeout: 8000 });
  });

  test('deve testar os botões de ação do card de fatura (Copiar Código, PIX e PDF)', async ({ page }) => {
    await expect(page.getByText('Mensalidade DBS Fibra').first()).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(/Ambiente de demonstração|Você está offline|Prévia local: confirme a fatura/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Pagar com PIX|PIX indisponível/i }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /Visualizar|Boleto PDF indisponível/i }).first()).toBeDisabled();
  });

  test('deve redirecionar para o chat através do atalho de dúvidas no rodapé', async ({ page }) => {
    const helpBox = page.getByText('Dúvidas sobre faturas ou comprovantes?');
    await expect(helpBox).toBeVisible();
    await helpBox.click();

    // Verifica que voltou para a tela de atendimento
    await expect(page.getByText('Davi • DBS Telecom').first()).toBeVisible({ timeout: 10000 });
  });
});
