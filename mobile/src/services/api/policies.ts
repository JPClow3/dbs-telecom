/** Pure transport/auth policies kept independent of React Native runtime modules. */
export function normalizeAuthToken(token: string | null | undefined): string | null {
  const normalized = token?.trim() || null;
  return normalized;
}

export function isDemoOptInEnabled(isDevelopmentBuild: boolean | undefined, flag: string | undefined): boolean {
  return isDevelopmentBuild === true && flag === 'true';
}

export function isUnauthorizedStatus(status: number): boolean {
  return status === 401 || status === 403;
}
