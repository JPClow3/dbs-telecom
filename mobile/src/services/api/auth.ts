import type { AuthResponse, IdentifyResponse } from '../../types';
import { ApiServiceError, apiFetch, getApiUrl, getAuthHeaders, isApiServiceError, responseError, setAuthToken, unavailableError } from './transport';

export async function loginClient(cpfCnpj: string, password?: string): Promise<AuthResponse> {
  try {
    const res = await apiFetch(`${getApiUrl()}/auth/login`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ cpfCnpj, password: password !== undefined ? password : cpfCnpj }),
    });

    if (!res.ok) {
      throw await responseError(res, 'Falha na autenticação.');
    }

    const data: AuthResponse = await res.json();
    if (!data.authenticated || !data.found || !data.token || !data.client) {
      setAuthToken(null);
      throw new ApiServiceError(
        'O servidor não retornou uma sessão autenticada válida.',
        'INVALID_RESPONSE'
      );
    }
    setAuthToken(data.token);
    return data;
  } catch (e: any) {
    setAuthToken(null);
    if (isApiServiceError(e)) throw e;
    throw unavailableError(
      'Não foi possível conectar ao servidor de autenticação. Verifique sua conexão e tente novamente.'
    );
  }
}

export async function identifyClient(cpfCnpj: string): Promise<IdentifyResponse> {
  try {
    const res = await apiFetch(`${getApiUrl()}/auth/identify`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ cpfCnpj }),
    });

    if (!res.ok) {
      throw await responseError(res, 'Falha na identificação.');
    }

    return await res.json();
  } catch (e) {
    if (isApiServiceError(e)) throw e;
    throw unavailableError(
      'Não foi possível consultar o cadastro. Verifique sua conexão e tente novamente.'
    );
  }
}

