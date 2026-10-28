import { test, expect } from '@playwright/test';
import { loginTestCustomer } from './helpers/auth';

// This focused slice runs against the freshly exported current mobile source
// at a phone-sized viewport. It is intentionally E2E: the mobile package does
// not yet own a component-test runner or renderer dependency.
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.describe('📱 Mobile source: truthful provider and action states', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await loginTestCustomer(page);
  });

  test('identifica a fonte do atendimento sem declarar fibra confirmada', async ({ page }) => {
    await expect(page.getByText(/Modo demonstração local|Atendimento conectado ao servidor|Conectando ao atendimento|Sem internet/i).first()).toBeVisible({ timeout: 12000 });
    await expect(page.getByText('Fibra 100% Conectada')).toHaveCount(0);
  });

  test('bloqueia ações financeiras quando a fatura é apenas prévia local', async ({ page }) => {
    await page.getByText('2ª Via Fatura').click();
    await expect(page.getByText(/Ambiente de demonstração|Você está offline|Prévia local: confirme a fatura/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /PIX indisponível|Pagar com PIX/i }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /Boleto PDF indisponível|Visualizar/i }).first()).toBeDisabled();
  });

  test('mantém as ferramentas de perfil em proveniência demo', async ({ page }) => {
    await page.getByText('Meu Perfil', { exact: true }).click();

    await page.getByText('Teste de Velocidade Real', { exact: true }).click();
    await expect(page.getByText(/Prévia local • não confirma o desempenho da operadora/i)).toBeVisible();
    await expect(page.getByText('Iniciar prévia de velocidade', { exact: true })).toBeVisible();
  });

  test('desabilita alterações do roteador e sinaliza Wi-Fi ilustrativo', async ({ page }) => {
    await page.getByText('Meu Perfil', { exact: true }).click();
    await page.getByText('Gerenciador Wi-Fi & Visitas', { exact: true }).click();

    await expect(page.getByText(/dados da rede são ilustrativos/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Reiniciar \(demo\)/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Salvar \(demo\)/i })).toBeDisabled();
  });

  test('não apresenta telemetria ótica demo como confirmação de provedor', async ({ page }) => {
    await page.getByText('Meu Perfil', { exact: true }).click();
    await page.getByText('Telemetria de Sinal Ótico', { exact: true }).click();

    await expect(page.getByText(/leituras RX\/TX.*ilustrativas/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/telemetria não confirmada/i).first()).toBeVisible();
    await expect(page.getByText('Atualizar prévia', { exact: true })).toBeVisible();
  });

  test('bloqueia compartilhamento e cadastro de indicação em demo', async ({ page }) => {
    await page.getByText('Meu Perfil', { exact: true }).click();
    await page.getByText('Indique e Ganhe 50% OFF', { exact: true }).click();

    await expect(page.getByText(/código, link, métricas e descontos são ilustrativos/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Copiar \(demo\)/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Compartilhar \(demo\)/i })).toBeDisabled();
  });

  test('mantém notificações demo como leitura não confirmada e sem mutações', async ({ page }) => {
    await page.getByText('Meu Perfil', { exact: true }).click();
    await page.getByRole('button', { name: 'Abrir central de notificações' }).click();

    await expect(page.getByText(/alertas, ações e status são ilustrativos/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Marcar tudo \(demo\)/i })).toBeDisabled();
  });
});
