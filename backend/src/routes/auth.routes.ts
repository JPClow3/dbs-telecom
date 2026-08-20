import { Router, type Request, type Response } from 'express';
import { ixcService } from '../modules/ixc/ixc.service.js';
import { CONFIG } from '../config/env.js';
import { userService } from '../modules/auth/user.service.js';
import { jwtService } from '../modules/auth/jwt.service.js';
import { authMiddleware, enforceAntiIdor, requireAdmin } from '../middlewares/auth.middleware.js';
import { redactUserAccount, sendApiError } from './route.helpers.js';

export function registerAuthRoutes(apiRouter: Router): void {
/**
 * Login completo com CPF e Senha (onde a senha padrão é o CPF do cliente)
 * Emite Token JWT com permissão Anti-IDOR
 */
apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { cpfCnpj, login, password } = req.body;
  const doc = cpfCnpj || login;

  if (!doc) {
    return res.status(400).json({ error: 'Informe o CPF, CNPJ ou login para autenticação.' });
  }

  const pass = password !== undefined && password !== null ? String(password) : doc;

  try {
    const authResult = await userService.authenticateUser(doc, pass);
    if (!authResult.success || !authResult.client) {
      return res.status(401).json({
        found: false,
        message: authResult.message || 'Credenciais inválidas.',
      });
    }

    const client = authResult.client;
    const contracts = await ixcService.getClientContracts(client.id);

    // Emissão do Token JWT assinado para proteção Anti-IDOR
    const token = jwtService.generateToken({
      clientId: client.id,
      cpfCnpj: client.cnpj_cpf,
      name: client.razao,
      email: client.email,
      role: 'client',
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
 * Sincronização em lote: criação de contas de acesso para clientes do IXC onde a senha é o CPF
 */
apiRouter.post('/auth/sync-users', authMiddleware, requireAdmin, async (req: Request, res: Response) => {
  const limit = parseInt(String(req.query.limit || req.body.limit || '50'), 10);
  try {
    const syncResult = await userService.syncUsersFromIXC(limit);
    return res.json({
      success: true,
      message: `Criados/sincronizados ${syncResult.totalProcessed} usuários da base IXC.`,
      totalProcessed: syncResult.totalProcessed,
      users: syncResult.users.map(redactUserAccount),
    });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao sincronizar usuários do IXC.', error);
  }
});

/**
 * Listagem dos usuários sincronizados
 */
apiRouter.get('/auth/users', authMiddleware, requireAdmin, async (_req: Request, res: Response) => {
  const users = await userService.listAllUsers();
  return res.json({ total: users.length, users: users.map(redactUserAccount) });
});

/**
 * Alteração de senha com hash criptográfico seguro (Anti-IDOR)
 */
apiRouter.post('/auth/change-password', authMiddleware, enforceAntiIdor('clientId'), async (req: Request, res: Response) => {
  const { clientId, oldPassword, newPassword } = req.body;
  const targetClientId = clientId || req.user?.clientId;

  if (!targetClientId || !oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Informe clientId, senha atual (oldPassword) e nova senha (newPassword).' });
  }

  try {
    const result = await userService.changePassword(targetClientId, oldPassword, newPassword);
    if (!result.success) {
      return res.status(400).json(result);
    }
    return res.json(result);
  } catch (error: any) {
    return sendApiError(res, 'Erro ao alterar senha.', error);
  }
});

/**
 * Solicitação de Código OTP por SMS ou WhatsApp
 */
apiRouter.post('/auth/otp/request', async (req: Request, res: Response) => {
  const { identifier, channel } = req.body;
  if (!identifier) {
    return res.status(400).json({ error: 'Informe o CPF, CNPJ ou identificador para envio do código OTP.' });
  }

  try {
    const otpResult = await userService.requestOtp(identifier, channel || 'WHATSAPP');
    if (!otpResult.success) {
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
  const { identifier, code } = req.body;
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
 */
apiRouter.post('/auth/identify', async (req: Request, res: Response) => {
  const { cpfCnpj } = req.body;

  if (!cpfCnpj) {
    return res.status(400).json({ error: 'Informe o CPF ou CNPJ para identificação.' });
  }

  try {
    const client = await ixcService.findClientByCpfCnpj(cpfCnpj);
    if (!client) {
      return res.status(404).json({
        found: false,
        message: 'Cliente não localizado na base IXC da DBS Telecom.',
      });
    }

    const contracts = await ixcService.getClientContracts(client.id);

    return res.json({
      found: true,
      client: {
        id: client.id,
        nome: client.razao,
        fantasia: client.fantasia,
        cpfCnpj: client.cnpj_cpf,
        email: client.email,
        telefone: client.fone,
        endereco: `${client.endereco}, ${client.numero} - ${client.bairro}, ${client.cidade}`,
      },
      contracts,
    });
  } catch (error: any) {
    return sendApiError(res, 'Erro ao consultar cliente no IXC.', error);
  }
});
}
