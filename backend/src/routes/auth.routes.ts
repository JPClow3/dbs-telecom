import { Router, type Request, type Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { ixcService } from '../modules/ixc/ixc.service.js';
import { CONFIG } from '../config/env.js';
import { userService } from '../modules/auth/user.service.js';
import { jwtService } from '../modules/auth/jwt.service.js';
import { authMiddleware, enforceAntiIdor, requireAdmin } from '../middlewares/auth.middleware.js';
import { redactUserAccount, sendApiError } from './route.helpers.js';

/** Mensagem genérica única para falha de login (anti-enumeração de usuários). */
const GENERIC_LOGIN_ERROR = 'CPF ou senha inválidos.';

/** Mascara CPF/CNPJ mantendo apenas os dígitos finais (ex.: 154.***.***-89). */
function maskCpfCnpj(doc: string): string {
  const digits = (doc || '').replace(/\D/g, '');
  if (digits.length < 5) return '****';
  return `***.${digits.slice(-6, -3)}.***-${digits.slice(-2)}`;
}

function normalizeCpfCnpj(doc: string): string {
  return String(doc || '').replace(/\D/g, '');
}

function getObjectBody(req: Request): Record<string, any> {
  const body = req.body;
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

/** Limiter dedicado do /auth/identify: 5 requisições por minuto por IP. */
const identifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const cloudflareIp = process.env.TRUST_CF_HEADERS === 'true'
      ? req.get('cf-connecting-ip')
      : undefined;
    return ipKeyGenerator(cloudflareIp || req.ip || '0.0.0.0');
  },
  message: { error: 'Muitas consultas de identificação. Aguarde um minuto antes de tentar novamente.', code: 'TOO_MANY_REQUESTS' },
});

export function registerAuthRoutes(apiRouter: Router): void {
  /**
   * Login com CPF e Senha
   * Emite Token JWT com permissão Anti-IDOR
   *
   * Anti-enumeracao: "CPF desconhecido" e "senha incorreta" retornam o MESMO
   * corpo (found:false + mensagem genérica) e o MESMO status 401.
  */
  apiRouter.post('/auth/login', async (req: Request, res: Response) => {
    const { cpfCnpj, login, password } = getObjectBody(req);
    const doc = cpfCnpj || login;

    if (!doc) {
      return res.status(400).json({ error: 'Informe o CPF, CNPJ ou login para autenticação.' });
    }

    // A credencial deve ser sempre explícita no contrato HTTP. A tela mobile
    // preenche essa credencial com o CPF/CNPJ sem pontuação para simplificar o
    // acesso do público da central.
    const pass = password !== undefined && password !== null ? String(password) : '';
    if (!pass.trim()) {
      return res.status(400).json({ error: 'Informe a senha de acesso.' });
    }

    try {
      const authResult = await userService.authenticateUser(doc, pass);
      if (!authResult.success || !authResult.client) {
        return res.status(401).json({
          found: false,
          authenticated: false,
          message: authResult.message || GENERIC_LOGIN_ERROR,
        });
      }

      const client = authResult.client;
      const contracts = await ixcService.getClientContracts(client.id);

      // Emissão do Token JWT assinado para proteção Anti-IDOR.
      // A versão de sessão vigente é embutida para permitir revogação após
      // troca de senha; expiração reduzida de 7d para 24h.
      const token = jwtService.generateToken({
        clientId: client.id,
        cpfCnpj: client.cnpj_cpf,
        name: client.razao,
        email: client.email,
        role: 'client',
        sessionVersion: userService.getTokenVersion(client.id),
      });

      return res.json({
        found: true,
        authenticated: true,
        mode: CONFIG.demoMode ? 'demo' : 'live',
        dataState: CONFIG.demoMode ? 'DEMO' : 'LIVE',
        token,
        expiresIn: CONFIG.auth.jwtExpiresIn,
        client: {
          id: client.id,
          nome: client.razao,
          fantasia: client.fantasia,
          cpfCnpj: client.cnpj_cpf,
          email: client.email,
          telefone: client.fone,
          endereco: `${client.endereco || ''}, ${client.numero || ''} - ${client.bairro || ''}, ${client.cidade || ''}`.trim(),
          isDemo: CONFIG.demoMode,
        },
        contracts,
      });
    } catch (error: any) {
      return sendApiError(res, 'Erro ao autenticar cliente no IXC.', error);
    }
  });

  /**
   * Sincronização em lote: cria contas de acesso para clientes do IXC usando
   * CPF/CNPJ como usuário e senha padrão.
   */
  apiRouter.post('/auth/sync-users', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
    const requestedLimit = Number.parseInt(String(req.query.limit || getObjectBody(req).limit || '50'), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50;
    try {
      const syncResult = await userService.syncUsersFromIXC(limit);
      const credentials = (syncResult as any).credentials;
      return res.json({
        success: true,
        message: `Criados/sincronizados ${syncResult.totalProcessed} usuários da base IXC.` +
          (credentials?.length ? ` ${credentials.length} credencial(is) com CPF/CNPJ como senha padrão.` : ''),
        totalProcessed: syncResult.totalProcessed,
        users: syncResult.users.map(redactUserAccount),
        // Credenciais iniciais para o operador distribuir conforme o contrato
        // da central. O banco persiste somente o hash.
        ...(credentials ? { credentials } : {}),
      });
    } catch (error: any) {
      return sendApiError(res, 'Erro ao sincronizar usuários do IXC.', error);
    }
  });

  /**
   * Listagem dos usuários sincronizados
   */
  apiRouter.get('/auth/users', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const users = await userService.listAllUsers();
      return res.json({ total: users.length, users: users.map(redactUserAccount) });
    } catch (error: any) {
      return sendApiError(res, 'Erro ao listar usuários.', error);
    }
  });

  /**
   * Alteração de senha com hash criptográfico seguro (Anti-IDOR).
   * Em caso de sucesso a versão de sessão do usuário é incrementada e todos
   * os tokens JWT anteriores deixam de ser aceitos.
   */
  apiRouter.post('/auth/change-password', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
    const { clientId, oldPassword, newPassword } = getObjectBody(req);
    const targetClientId = clientId || req.user?.clientId;

    if (!targetClientId || !oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Informe clientId, senha atual (oldPassword) e nova senha (newPassword).' });
    }

    try {
      const result = await userService.changePassword(targetClientId, oldPassword, newPassword);
      if (!result.success) {
        return res.status(400).json(result);
      }

      // Reemite um token válido imediatamente (com a nova sessionVersion) para
      // que o próprio solicitante não precise refazer login.
      const client = await ixcService.findClientById(targetClientId);
      const token = client
        ? jwtService.generateToken({
          clientId: client.id,
          cpfCnpj: client.cnpj_cpf,
          name: client.razao,
          email: client.email,
          role: (req.user?.role === 'admin' ? 'admin' : 'client') as 'admin' | 'client',
          sessionVersion: userService.getTokenVersion(client.id),
        })
        : undefined;

      return res.json({ ...result, ...(token ? { token } : {}) });
    } catch (error: any) {
      return sendApiError(res, 'Erro ao alterar senha.', error);
    }
  });

  /**
   * Solicitação de Código OTP por SMS ou WhatsApp
   *
   * Fora do modo demo o canal de entrega não existe: 501 NOT_IMPLEMENTED
   * (condição permanente, não-retentável) em vez de 503 (falha transitória).
  */
  apiRouter.post('/auth/otp/request', async (req: Request, res: Response) => {
    const { identifier, channel } = getObjectBody(req);
    if (!identifier) {
      return res.status(400).json({ error: 'Informe o CPF, CNPJ ou identificador para envio do código OTP.' });
    }

    try {
      const otpResult = await userService.requestOtp(identifier, channel || 'WHATSAPP');
      if (!otpResult.success) {
        if (otpResult.notImplemented) {
          return res.status(501).json({
            ...otpResult,
            code: 'NOT_IMPLEMENTED',
            error: otpResult.message,
          });
        }
        return res.status(otpResult.rateLimited ? 429 : 404).json(otpResult);
      }
      return res.json(otpResult);
    } catch (error: any) {
      return sendApiError(res, 'Erro ao gerar código OTP.', error);
    }
  });

  /**
   * Validação do Código OTP e Emissão de Token JWT
  */
  apiRouter.post('/auth/otp/verify', async (req: Request, res: Response) => {
    const { identifier, code } = getObjectBody(req);
    if (!identifier || !code) {
      return res.status(400).json({ error: 'Informe o identificador e o código OTP de 6 dígitos.' });
    }

    try {
      const verifyResult = await userService.verifyOtp(identifier, code);
      if (!verifyResult.success || !verifyResult.client) {
        return res.status(401).json(verifyResult);
      }

      const client = verifyResult.client;
      const contracts = await ixcService.getClientContracts(client.id);

      const token = jwtService.generateToken({
        clientId: client.id,
        cpfCnpj: client.cnpj_cpf,
        name: client.razao,
        email: client.email,
        role: 'client',
        sessionVersion: userService.getTokenVersion(client.id),
      });

      return res.json({
        authenticated: true,
        token,
        expiresIn: CONFIG.auth.jwtExpiresIn,
        client: {
          id: client.id,
          nome: client.razao,
          fantasia: client.fantasia,
          cpfCnpj: client.cnpj_cpf,
          email: client.email,
          telefone: client.fone,
          endereco: `${client.endereco || ''}, ${client.numero || ''} - ${client.bairro || ''}, ${client.cidade || ''}`.trim(),
        },
        contracts,
      });
    } catch (error: any) {
      return sendApiError(res, 'Erro ao validar código OTP.', error);
    }
  });

  /**
   * Identificação rápida do cliente por CPF/CNPJ
   *
   * Hardening: agora EXIGE autenticação JWT (evidência: `grep -rn
   * identifyClient mobile/src` mostra que a função existe em
   * services/api/auth.ts e é reexportada, mas nenhum fluxo pré-login a chama —
   * era um oráculo de PII aberto: nome, e-mail, telefone, endereço e
   * contratos por CPF puro). Mesmo autenticado, a resposta fica reduzida ao
   * mínimo necessário: confirmação de titularidade (nome + CPF mascarado).
   * Nada de e-mail, telefone, endereço, id ou contratos.
  */
  apiRouter.post('/auth/identify', authMiddleware, identifyLimiter, async (req: Request, res: Response) => {
    const { cpfCnpj } = getObjectBody(req);

    if (!cpfCnpj) {
      return res.status(400).json({ error: 'Informe o CPF ou CNPJ para identificação.' });
    }

    // A successful lookup returns identifying PII. A client may confirm only
    // its own document; administrators retain the explicit lookup capability.
    if (req.user?.role !== 'admin' && normalizeCpfCnpj(cpfCnpj) !== normalizeCpfCnpj(req.user?.cpfCnpj || '')) {
      return res.status(403).json({
        error: 'Acesso negado: a identificação só pode consultar o documento da sessão atual.',
        code: 'IDOR_FORBIDDEN',
      });
    }

    try {
      const client = await ixcService.findClientByCpfCnpj(cpfCnpj);
      if (!client) {
        return res.status(404).json({
          found: false,
          message: 'Cliente não localizado na base IXC da DBS Telecom.',
        });
      }

      return res.json({
        found: true,
        client: {
          nome: client.razao,
          cpfCnpjMascarado: maskCpfCnpj(client.cnpj_cpf || ''),
        },
      });
    } catch (error: any) {
      return sendApiError(res, 'Erro ao consultar cliente no IXC.', error);
    }
  });
}
