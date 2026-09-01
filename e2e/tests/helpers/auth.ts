import { expect, Page } from '@playwright/test';

/** Authenticate against the fixed demo customer in the isolated E2E backend. */
export async function loginTestCustomer(page: Page) {
  await page.getByPlaceholder('000.000.000-00').fill('15429370789');
  await page.getByPlaceholder('Digite sua senha').fill('15429370789');
  await page.getByTestId('login-btn').click();

  await expect(page.getByText(/Ambiente demo|App online|Sem internet/).first()).toBeVisible({ timeout: 15000 });
}
