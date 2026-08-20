import { expect, Page } from '@playwright/test';

/**
 * Authenticate against the current export without assuming that a local demo
 * shortcut is enabled. Production-shaped builds intentionally hide that
 * shortcut; the seeded test customer remains the deterministic E2E seam.
 */
export async function loginTestCustomer(page: Page) {
  const demoButton = page.getByTestId('demo-login-btn');

  if (await demoButton.count()) {
    await demoButton.click();
  } else {
    await page.getByPlaceholder('000.000.000-00').fill('15429370789');
    await page.getByPlaceholder('Digite sua senha').fill('15429370789');
    await page.getByTestId('login-btn').click();
  }

  await expect(page.getByText(/Ambiente demo|App online|Sem internet/).first()).toBeVisible({ timeout: 15000 });
}
