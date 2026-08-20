import jwt from 'jsonwebtoken';
import { CONFIG } from '../../config/env.js';

export interface AuthUserPayload {
  clientId: string;
  cpfCnpj: string;
  name: string;
  email?: string;
  role?: 'client' | 'admin';
  iat?: number;
  exp?: number;
}

export class JwtService {
  private get secret(): string {
    return CONFIG.auth.jwtSecret;
  }

  private get expiresIn(): string {
    return CONFIG.auth.jwtExpiresIn;
  }

  /**
   * Emite um novo token JWT assinado para o cliente autenticado
   */
  generateToken(payload: Omit<AuthUserPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.secret, {
      expiresIn: this.expiresIn as any,
    });
  }

  /**
   * Valida e decodifica um token JWT
   * @throws {jwt.JsonWebTokenError | jwt.TokenExpiredError} se o token for inválido ou expirado
   */
  verifyToken(token: string): AuthUserPayload {
    const decoded = jwt.verify(token, this.secret) as AuthUserPayload;
    return decoded;
  }

  /**
   * Decodifica um token JWT sem validar a assinatura (para inspeção)
   */
  decodeToken(token: string): AuthUserPayload | null {
    try {
      const decoded = jwt.decode(token) as AuthUserPayload | null;
      return decoded;
    } catch {
      return null;
    }
  }
}

export const jwtService = new JwtService();
