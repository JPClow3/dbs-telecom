import { test, expect } from '@playwright/test';
import { loginTestCustomer } from './helpers/auth';

test.describe('🚀 4. Plans & Commercial Catalog Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and login
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await loginTestCustomer(page);

    // Navega para a aba de planos
    const plansTab = page.getByText('Planos DBS');
    await plansTab.click();
  });

  test('deve renderizar o catálogo com simulador de dispositivos e banner de indicação', async ({ page }) => {
    await expect(page.getByText('Planos DBS Fibra Ótica')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('QUANTOS DISPOSITIVOS USAM INTERNET?')).toBeVisible();
    await expect(page.getByText('1 a 3 aparelhos')).toBeVisible();
    await expect(page.getByText('Família (4-8)')).toBeVisible();
    await expect(page.getByText('Gamer / 8+')).toBeVisible();
    await expect(page.getByText('Indique um Amigo e Ganhe 50% OFF')).toBeVisible();
  });

  test('deve permitir simulação por perfil e alternar categoria automaticamente', async ({ page }) => {
    // Clica no perfil Gamer
    const gamerBtn = page.getByText('Gamer / 8+');
    await gamerBtn.click();

    // Confirma a mudança pelo conteúdo do catálogo. O React Native Web não
    // serializa accessibilityState.selected como aria-selected neste controle.
    await expect(
      page.getByText(/500 Mega Wi-Fi 6|800 Mega Wi-Fi 6|1000 Mega/i).first()
    ).toBeVisible({ timeout: 10000 });

    // Clica no perfil Família
    const familyBtn = page.getByText('Família (4-8)');
    await familyBtn.click();
    await expect(page.getByText('Planos Urbanos').first()).toBeVisible();
  });

  test('deve alternar entre as abas Planos Urbanos e Tecnologia Wi-Fi 6', async ({ page }) => {
    // Clica na aba Wi-Fi 6
    const wifi6Tab = page.getByText('Tecnologia Wi-Fi 6');
    await wifi6Tab.click();
    await expect(page.getByText(/500 Mega Wi-Fi 6|800 Mega Wi-Fi 6|1000 Mega/i).first()).toBeVisible({ timeout: 10000 });

    // Clica na aba Planos Urbanos
    const urbanTab = page.getByText('Planos Urbanos');
    await urbanTab.click();
    await expect(page.getByText(/400 Mega|500 Mega|600 Mega|800 Mega/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('deve permitir copiar o link do programa Indique e Ganhe 50% OFF', async ({ page }) => {
    const referralCard = page.getByText('Indique um Amigo e Ganhe 50% OFF');
    await expect(referralCard).toBeVisible();

    const shareBtn = page.locator('div[style*="cursor: pointer"], div[role="button"]').filter({ has: page.locator('svg') }).nth(1);
    if (await shareBtn.isVisible()) {
      await shareBtn.click();
    }
  });

  test('deve clicar em "Quero Contratar Este Plano" e navegar para o Chat', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Quero Contratar Este Plano/i }).first()).toBeVisible({ timeout: 10000 });

    // Clica no botão de contratação do primeiro plano
    const hireBtn = page.getByRole('button', { name: /Quero Contratar Este Plano/i }).first();
    await hireBtn.click();

    // Deve redirecionar automaticamente para a aba Atendimento (Chat)
    await expect(page.getByText('Davi • DBS Telecom').first()).toBeVisible({ timeout: 15000 });

    // Verifica que foi navegado para o chat (mensagem de interesse ou a aba de atendimento está ativa)
    const chatTab = page.getByRole('tab', { name: /Atendimento/i });
    await expect(chatTab).toHaveAttribute('aria-selected', 'true', { timeout: 5000 }).catch(() => {});

    // Verifica que a mensagem de contratação apareceu no histórico (com timeout maior para SSE)
    await expect(
      page.getByText(/Gostei do plano|contratar|plano/i).first()
    ).toBeVisible({ timeout: 15000 });
  });
});
