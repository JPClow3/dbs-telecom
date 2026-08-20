import { test, expect } from '@playwright/test';
import { loginTestCustomer } from './helpers/auth';

test.describe('👤 5. Profile, Diagnostics, Tickets & Logout Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and login
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await loginTestCustomer(page);

    // Navega para a aba Meu Perfil
    const profileTab = page.getByText('Meu Perfil');
    await profileTab.click();
  });

  test('deve renderizar o card do titular com dados cadastrais e status da conta', async ({ page }) => {
    await expect(page.getByText('Emanuel da Silva')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Ambiente de demonstração — cadastro não confirmado (ID #2270)')).toBeVisible();
    await expect(page.getByText('Aparência do Aplicativo')).toBeVisible();
    await expect(page.getByText('Status do Aplicativo e Diagnóstico')).toBeVisible();
  });

  test('deve alternar entre os temas do aplicativo (Automático, Claro, Escuro)', async ({ page }) => {
    const lightBtn = page.getByText('Claro');
    await lightBtn.click();
    await expect(page.getByText(/Tema alterado para Modo Claro/i)).toBeVisible({ timeout: 5000 });

    const darkBtn = page.getByText('Escuro');
    await darkBtn.click();
    await expect(page.getByText(/Tema alterado para Modo Escuro/i)).toBeVisible({ timeout: 5000 });

    const autoBtn = page.getByText('Automático');
    await autoBtn.click();
    await expect(page.getByText(/Tema alterado para Automático/i)).toBeVisible({ timeout: 5000 });
  });

  test('deve executar o teste de diagnóstico de conexão e exibir latência e velocidade', async ({ page }) => {
    const testBtn = page.getByText(/Testar Conexão e Latência|Repetir Teste de Conexão/i);
    await expect(testBtn).toBeVisible();
    await testBtn.click();

    // Aguarda o resultado do diagnóstico
    await expect(page.getByText(/Diagnóstico concluído/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Latência (Ping)')).toBeVisible();
    await expect(page.getByText('Download estimado')).toBeVisible();
  });

  test('deve abrir o modal de Chamados e Ordens de Serviço (O.S.), filtrar e fechar', async ({ page }) => {
    // Clica no atalho de Chamados & O.S.
    const ticketsShortcut = page.getByText('Chamados & Ordens de Serviço (O.S.)');
    await expect(ticketsShortcut).toBeVisible();
    await ticketsShortcut.click();

    // Modal de chamados aberto
    await expect(page.getByText('Central de Chamados (O.S.)')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Todos/i).first()).toBeVisible();
    await expect(page.getByText(/Em Andamento/i).first()).toBeVisible();
    await expect(page.getByText(/Concluídos/i).first()).toBeVisible();

    // Testa filtro Em Andamento
    const activeTab = page.getByText(/Em Andamento/i).first();
    await activeTab.click();

    // Testa filtro Concluídos
    const doneTab = page.getByText(/Concluídos/i).first();
    await doneTab.click();

    // Testa cópia de protocolo
    const copyProtocolBtn = page.getByText('Copiar Protocolo').first();
    if (await copyProtocolBtn.isVisible()) {
      await copyProtocolBtn.click();
    }

    // Fecha o modal
    const closeBtn = page.getByTestId('close-tickets-modal-btn');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
    }
  });

  test('deve identificar o teste de velocidade como prévia no ambiente demo', async ({ page }) => {
    await page.getByText('Teste de Velocidade Real').click();
    await expect(page.getByText('Prévia local • não confirma o desempenho da operadora')).toBeVisible();
  });

  test('deve bloquear alterações de Wi-Fi no ambiente demo', async ({ page }) => {
    await page.getByText('Gerenciador Wi-Fi & Visitas').click();
    await expect(page.getByText('Prévia local • sem acesso ao roteador')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar (demo) — indisponível' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Reiniciar (demo) — indisponível' })).toBeDisabled();
  });

  test('deve identificar a telemetria óptica como não confirmada no ambiente demo', async ({ page }) => {
    await page.getByText('Telemetria de Sinal Ótico').click();
    await expect(page.getByText('Prévia local • telemetria não confirmada')).toBeVisible();
    await expect(page.getByText(/POTÊNCIA RX \(PRÉVIA NÃO CONFIRMADA\)/i)).toBeVisible();
  });

  test('deve bloquear indicação e compartilhamento de benefícios ilustrativos', async ({ page }) => {
    await page.getByText('Indique e Ganhe 50% OFF').click();
    await expect(page.getByText('Prévia local • benefícios não confirmados')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compartilhar (demo) — indisponível' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Indicar amigo (demo) — indisponível' })).toBeDisabled();
  });

  test('deve bloquear ações financeiras nas notificações de demonstração', async ({ page }) => {
    await page.getByText('Central de Notificações').click();
    await expect(page.getByText('Prévia local • alertas não confirmados')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar tudo (demo) — indisponível' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'PIX indisponível na demo' }).first()).toBeDisabled();
  });

  test('deve realizar logout e retornar para a tela de autenticação', async ({ page }) => {
    const logoutBtn = page.getByText('Trocar de Conta / Sair');
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Deve retornar para a tela de Login
    await expect(page.getByText('Acesse sua Conta')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('login-btn')).toBeVisible();
  });
});
