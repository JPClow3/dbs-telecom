import { Request, Response, NextFunction } from 'express';
import { jwtService, AuthUserPayload } from '../modules/auth/jwt.service.js';
import { userService } from '../modules/auth/user.service.js';

// Extende a interface Request do Express para incluir o usuário autenticado
declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

/**
 * Middleware de Autenticação JWT obrigatório
 * Valida o cabeçalho Authorization: Bearer <token>
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Não autorizado: Token JWT de autenticação não fornecido no cabeçalho Authorization.',
      code: 'TOKEN_MISSING',
    });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return res.status(401).json({
      error: 'Não autorizado: Token JWT não fornecido.',
      code: 'TOKEN_MISSING',
    });
  }

  try {
    req.user = verifyAuthenticatedToken(token);
    return next();
  } catch (error: any) {
    if (error?.code === 'SESSION_REVOKED') {
      return res.status(401).json({
        error: 'Não autorizado: sessão encerrada. Faça login novamente.',
        code: 'SESSION_REVOKED',
      });
    }
    return res.status(401).json({
      error: 'Não autorizado: Token JWT inválido, expirado ou corrompido.',
      code: 'TOKEN_INVALID',
    });
  }
}

/**
 * Middleware opcional de autenticação: se o token existir, decodifica o usuário
 */
export function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: 'Token JWT não fornecido.', code: 'TOKEN_MISSING' });
    }
    try {
      req.user = verifyAuthenticatedToken(token);
    } catch (error: any) {
      if (error?.code === 'SESSION_REVOKED') {
        return res.status(401).json({
          error: 'Não autorizado: sessão encerrada. Faça login novamente.',
          code: 'SESSION_REVOKED',
        });
      }
      return res.status(401).json({
        error: 'Token JWT inválido, expirado ou corrompido.',
        code: 'TOKEN_INVALID',
      });
    }
  }

  return next();
}

/**
 * Verifica um token fora do pipeline Express (por exemplo, no SSE que aceita
 * `?token=`). Manter assinatura, claims e revogação nesta única fronteira
 * evita que transportes alternativos criem uma sessão menos segura.
 */
export function verifyAuthenticatedToken(token: string): AuthUserPayload {
  const user = jwtService.verifyToken(token);
  if (!user.clientId || (user.role && user.role !== 'admin' && user.role !== 'client')) {
    throw new Error('invalid claims');
  }
  if (!userService.isTokenSessionValid(user.clientId, user.sessionVersion)) {
    const error = new Error('session revoked') as Error & { code?: string };
    error.code = 'SESSION_REVOKED';
    throw error;
  }
  return user;
}

/** Garante que apenas uma identidade administrativa assine operações de suporte. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Não autorizado: Usuário não autenticado.', code: 'UNAUTHORIZED' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.', code: 'ADMIN_REQUIRED' });
  }
  return next();
}

/**
 * Middleware Anti-IDOR (Insecure Direct Object Reference)
 * Garante que um cliente autenticado só consiga consultar, alterar ou interagir com seus próprios dados.
 * Suporta o alias "me" para resolver automaticamente o ID do cliente autenticado.
 */
export function enforceAntiIdor(paramName: string = 'clientId') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Não autorizado: Usuário não autenticado.',
        code: 'UNAUTHORIZED',
      });
    }

    // Admins possuem permissão irrestrita
    if (req.user.role === 'admin') {
      return next();
    }

    // Identifica o ID solicitado em params, body ou query
    let requestedId: string | undefined =
      req.params[paramName] || (req.body && req.body[paramName]) || (req.query && (req.query[paramName] as string));

    // Se o cliente usou o alias "me", substitui pelo seu próprio clientId
    if (requestedId === 'me') {
      if (req.params[paramName]) req.params[paramName] = req.user.clientId;
      if (req.body && req.body[paramName]) req.body[paramName] = req.user.clientId;
      return next();
    }

    // Se não foi passado um ID específico mas a rota é protegida, injeta o ID do usuário autenticado
    if (!requestedId) {
      if (req.params[paramName] !== undefined) req.params[paramName] = req.user.clientId;
      if (req.body && req.body[paramName] !== undefined) req.body[paramName] = req.user.clientId;
      return next();
    }

    // Comparação estrita anti-IDOR
    if (String(requestedId).trim() !== String(req.user.clientId).trim()) {
      return res.status(403).json({
        error: 'Acesso negado (Proteção Anti-IDOR): Você só possui autorização para consultar e manipular seus próprios dados.',
        code: 'IDOR_FORBIDDEN',
        requestedClientId: requestedId,
        authenticatedClientId: req.user.clientId,
      });
    }

    return next();
  };
}
