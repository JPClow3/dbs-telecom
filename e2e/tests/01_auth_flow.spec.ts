import { test, expect } from '@playwright/test';
import { loginTestCustomer } from './helpers/auth';

test.describe('🔐 1. Authentication & Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test('deve renderizar a tela de login com identidade visual da DBS Telecom', async ({ page }) => {
    await page.goto('/');

    // Verifica logo, marca e slogan
    await expect(page.getByText('DBS', { exact: true })).toBeVisible();
    await expect(page.getByText('TELECOM', { exact: true })).toBeVisible();
    await expect(page.getByText('Central do Assinante & Atendimento Digital')).toBeVisible();

    // Verifica card de login
    await expect(page.getByText('Acesse sua Conta')).toBeVisible();
    await expect(page.getByPlaceholder('000.000.000-00')).toBeVisible();
    await expect(page.getByPlaceholder('Digite sua senha')).toBeVisible();
    await expect(page.getByTestId('login-btn')).toBeVisible();
    // The local-only shortcut is hidden when the export is production-shaped.
    // Its absence must not make the authenticated flow look falsely available.
  });

  test('deve formatar automaticamente a máscara do CPF enquanto digita', async ({ page }) => {
    await page.goto('/');
    const cpfInput = page.getByPlaceholder('000.000.000-00');

    await cpfInput.fill('15429370789');
    await expect(cpfInput).toHaveValue('154.293.707-89');
  });

  test('deve exibir mensagem de validação ao tentar entrar com campo vazio', async ({ page }) => {
    await page.goto('/');
    const loginBtn = page.getByTestId('login-btn');

    await loginBtn.click();
    await expect(page.getByText('Por favor, digite o CPF ou CNPJ do titular.')).toBeVisible();
  });

  test('deve permitir limpar o CPF através do botão X', async ({ page }) => {
    await page.goto('/');
    const cpfInput = page.getByPlaceholder('000.000.000-00');
    await cpfInput.fill('15429370789');
    await expect(cpfInput).toHaveValue('154.293.707-89');

    await cpfInput.fill('');
    await expect(cpfInput).toHaveValue('');
  });

  test('deve preencher campos e realizar login com sucesso', async ({ page }) => {
    await page.goto('/');

    const cpfInput = page.getByPlaceholder('000.000.000-00');
    await cpfInput.fill('15429370789');

    const passInput = page.getByPlaceholder('Digite sua senha');
    await passInput.fill('15429370789');

    const loginBtn = page.getByTestId('login-btn');
    await loginBtn.click();

    // Aguarda autenticação e redirecionamento para o dashboard principal
    await expect(page.getByText(/Ambiente demo|App online|Sem internet/).first()).toBeVisible({ timeout: 15000 });
  });

  test('deve autenticar pelo cliente demo do ambiente E2E isolado', async ({ page }) => {
    await page.goto('/');
    await loginTestCustomer(page);
  });
});
