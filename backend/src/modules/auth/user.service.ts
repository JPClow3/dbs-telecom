import { ixcService } from '../ixc/ixc.service.js';
import { IXCClientRecord } from '../ixc/ixc.types.js';
import { CONFIG } from '../../config/env.js';
import { userRepository, UserAccountRecord } from './user.repository.js';
import { CryptoUtils } from '../../utils/crypto.utils.js';

export interface UserAccount {
  id: string;
  clientId: string;
  clientName: string;
  cpfCnpj?: string;
  cleanCpf?: string;
  login: string;
  email?: string;
  phone?: string;
  defaultPasswordCpf?: string;
  passwordHash?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OtpRequestResult {
  success: boolean;
  message: string;
  channel: 'SMS' | 'WHATSAPP';
  maskedPhone?: string;
  expiresInMinutes: number;
  rateLimited?: boolean;
  /** Fora do demo o canal OTP não existe: mapeado para 501 NOT_IMPLEMENTED (não-retentável). */
  notImplemented?: boolean;
}

/** Resultado da criação/sincronização de conta com credencial inicial. */
export interface AccountCreationResult {
  user: UserAccount;
  /** CPF/CNPJ sem pontuação usado como senha inicial; o banco guarda apenas o hash. */
  initialPassword?: string;
  message?: string;
}

export interface OtpVerifyResult {
  success: boolean;
  message: string;
  client?: IXCClientRecord;
  user?: UserAccount;
}

/**
 * Mapa em memória de versão de sessão por usuário (clientId → versão).
 * Incrementado a cada troca de senha bem-sucedida; tokens emitidos com
 * `sessionVersion` menor passam a ser rejeitados.
 *
 * ATENÇÃO (PT-BR): este mapa vive apenas na RAM — reiniciar o processo limpa
 * as revogações pendentes (tokens antigos voltam a valer até expirar). Para uma
 * revogação durável, migrar para uma coluna `token_version` na tabela
 * `user_accounts` (não existe em migrations/0001_initial_postgres.sql).
 */
const tokenVersions = new Map<string, number>();

/** Versão de sessão atual exigida nos tokens emitidos para o usuário. */
function currentTokenVersion(clientId: string): number {
  return tokenVersions.get(clientId) ?? 0;
}

export class UserService {
  /** Raw OTPs exist only in the explicit test/demo adapter and in memory. */
  private readonly demoOtpCodes = new Map<string, string>();

  /**
   * Autentica cliente via CPF/Login e Senha
   * Suporta:
   * 1. Senha customizada com hash criptográfico seguro (Scrypt/Salt)
   * 2. Credencial simples para o público da central: documento como senha
   *    (CPF/CNPJ sem pontuação)
   * 3. Em modo demonstração explicitamente habilitado: ID interno como senha
   *    (fixtures falsas)
   */
  async authenticateUser(loginOrCpf: string, passwordInput: string): Promise<{ success: boolean; client?: IXCClientRecord; message?: string }> {
    const cleanPass = passwordInput.trim().replace(/\D/g, '');

    // 1. Busca cliente no IXC
    const client = await ixcService.findClientByCpfCnpj(loginOrCpf);
    if (!client) {
      // Anti-enumeracao: mesma mensagem/codigo para "CPF desconhecido" e
      // "senha errada" (ver auth.routes.ts — ambos viram 401 generico).
      return {
        success: false,
        message: 'CPF ou senha inválidos.',
      };
    }

    const clientCpfClean = (client.cnpj_cpf || '').replace(/\D/g, '');

    // Busca usuário registrado no SQLite para checar se possui senha customizada com hash
    let existingUser: UserAccountRecord | undefined = await userRepository.getByClientId(client.id);
    if (!existingUser) {
      existingUser = await this.registerUserAccount(client).then((r) => r.user);
    }
    if (!existingUser) {
      // Defensivo: registerUserAccount sempre retorna conta; nunca deve ocorrer.
      return { success: false, message: 'CPF ou senha inválidos.' };
    }

    // A. O hash continua sendo a fonte primária para senhas customizadas, mas
    // o documento também permanece aceito como senha conforme o contrato
    // simplificado solicitado para a central do assinante. Isso também torna
    // recuperáveis contas criadas durante a migração anterior, cujo hash
    // aleatório nunca chegou a ser entregue ao cliente.
    if (existingUser.passwordHash) {
      const isPasswordValid = CryptoUtils.verifyPassword(passwordInput, existingUser.passwordHash);
      const isDocumentPasswordValid = cleanPass.length > 0 &&
        clientCpfClean.length > 0 &&
        cleanPass === clientCpfClean;
      const isMasterDemoMatch = this.isMasterDemoPassword(passwordInput);

      if (isPasswordValid || isDocumentPasswordValid || isMasterDemoMatch) {
        return { success: true, client };
      }

      return {
        success: false,
        message: 'CPF ou senha inválidos.',
      };
    }

    // B. Fallback defensivo para contas legadas sem hash. O documento é a
    // senha padrão em todos os ambientes; o ID interno continua exclusivo do
    // modo demonstração.
    const isDocumentPasswordValid = cleanPass.length > 0 &&
      clientCpfClean.length > 0 &&
      cleanPass === clientCpfClean;
    // O ID interno só é aceito como senha no modo demonstração; em produção,
    // conhecer o ID numérico não pode garantir acesso à conta.
    const isIdMatch = Boolean(CONFIG.demoMode && client.id && passwordInput.trim() === client.id);
    const isMasterDemoMatch = this.isMasterDemoPassword(passwordInput);

    if (isDocumentPasswordValid || isIdMatch || isMasterDemoMatch) {
      return {
        success: true,
        client,
      };
    }

    return {
      success: false,
      message: 'CPF ou senha inválidos.',
    };
  }

  /**
   * Altera a senha do usuário com hash criptográfico seguro.
   * Em caso de sucesso incrementa a versão de sessão do usuário, revogando
   * todos os tokens JWT emitidos antes da alteração.
   */
  async changePassword(clientId: string, oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    if (!newPassword || newPassword.trim().length < 6) {
      return { success: false, message: 'A nova senha deve conter no mínimo 6 caracteres.' };
    }

    const client = await ixcService.findClientById(clientId);
    if (!client) {
      return { success: false, message: 'Cliente não encontrado na base da DBS Telecom.' };
    }

    const authCheck = await this.authenticateUser(client.cnpj_cpf || clientId, oldPassword);
    if (!authCheck.success) {
      return { success: false, message: 'Senha atual incorreta.' };
    }

    const passwordHash = CryptoUtils.hashPassword(newPassword);
    await userRepository.updatePasswordHash(clientId, passwordHash);

    // Revoga tokens antigos: toda emissão futura embute a nova versão de sessão
    // e a validação (ver assertTokenSessionVersion) rejeita versões anteriores.
    tokenVersions.set(clientId, currentTokenVersion(clientId) + 1);

    return {
      success: true,
      message: 'Senha alterada com sucesso! Utilize sua nova senha nos próximos acessos. Sessões abertas foram encerradas por segurança.',
    };
  }

  /**
   * Solicita envio de código OTP por SMS ou WhatsApp
   *
   * Fora do modo demonstração NÃO existe integração real de entrega
   * (SMS/WhatsApp). O endpoint responde 501 NOT_IMPLEMENTED (não-retentável)
   * em vez de 503, que sugeriria uma falha de configuração transitória.
   */
  async requestOtp(identifier: string, channel: 'SMS' | 'WHATSAPP' = 'WHATSAPP'): Promise<OtpRequestResult> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);
    const normalizedChannel = channel === 'SMS' ? 'SMS' : 'WHATSAPP';

    // Fail-closed: fora do modo demonstração não há provedor de entrega
    // (SMS/WhatsApp) integrado. Responder "código enviado" seria mentir para
    // o cliente e tornaria o fluxo OTP inutilizável silenciosamente.
    if (!CONFIG.demoMode) {
      return {
        success: false,
        message: 'O acesso por código (SMS/WhatsApp) ainda não está disponível. Utilize seu CPF e senha.',
        channel: normalizedChannel,
        expiresInMinutes: 0,
        notImplemented: true,
      };
    }

    // Throttle by account identifier in addition to the route/IP limiter. This
    // prevents repeatedly triggering a costly SMS/WhatsApp delivery.
    const now = Date.now();
    const recentRequests = await userRepository.countRecentOtpRequests(normalizedIdentifier, now - 10 * 60 * 1000);
    if (recentRequests >= 3) {
      return {
        success: false,
        message: 'Muitas solicitações de código. Aguarde alguns minutos e tente novamente.',
        channel: normalizedChannel,
        expiresInMinutes: 0,
        rateLimited: true,
      };
    }

    const latestCreatedAt = await userRepository.getLatestOtpCreatedAt(normalizedIdentifier);
    if (latestCreatedAt && now - latestCreatedAt < 30 * 1000) {
      return {
        success: false,
        message: 'Aguarde alguns segundos antes de solicitar outro código.',
        channel: normalizedChannel,
        expiresInMinutes: 0,
        rateLimited: true,
      };
    }

    const client = await ixcService.findClientByCpfCnpj(identifier);
    if (!client) {
      return {
        success: false,
        message: 'Cliente não encontrado com o CPF/documento informado.',
        channel: normalizedChannel,
        expiresInMinutes: 0,
      };
    }

    // Registra/sincroniza usuário
    await this.registerUserAccount(client);

    const otpCode = CryptoUtils.generateOtpCode();
    const otpHash = CryptoUtils.hashOtp(otpCode, normalizedIdentifier);
    await userRepository.saveOtp(normalizedIdentifier, otpHash, normalizedChannel, 10);
    if (CONFIG.demoMode) {
      this.demoOtpCodes.set(normalizedIdentifier, otpCode);
    }

    const rawPhone = client.fone || client.telefone_celular || '';
    const digitsOnly = rawPhone.replace(/\D/g, '');
    const maskedPhone = digitsOnly.length >= 8
      ? `(${digitsOnly.slice(0, 2)}) *****-${digitsOnly.slice(-4)}`
      : 'número cadastrado';

    // Never log OTP values. A real delivery provider should consume the code
    // here; test/demo mode can inspect the test adapter instead.
    console.info(`[UserService] OTP solicitado para cliente ${client.id} via ${normalizedChannel} (${maskedPhone})`);

    return {
      success: true,
      message: `Código de verificação enviado via ${normalizedChannel === 'WHATSAPP' ? 'WhatsApp' : 'SMS'} para ${maskedPhone}.`,
      channel: normalizedChannel,
      maskedPhone,
      expiresInMinutes: 10,
    };
  }

  /**
   * Valida código OTP e autentica o cliente
   */
  async verifyOtp(identifier: string, code: string): Promise<OtpVerifyResult> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);
    const normalizedCode = code.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      return {
        success: false,
        message: 'Código de verificação inválido ou expirado. Solicite um novo código.',
      };
    }

    const activeOtp = await userRepository.getActiveOtp(normalizedIdentifier);
    if (!activeOtp || !CryptoUtils.verifyOtp(normalizedCode, normalizedIdentifier, activeOtp.codeHash)) {
      if (activeOtp) {
        await userRepository.incrementOtpAttempt(activeOtp.id);
      }
      return {
        success: false,
        message: 'Código de verificação invalidado ou expirado. Solicite um novo código.',
      };
    }

    const client = await ixcService.findClientByCpfCnpj(identifier);
    if (!client) {
      return {
        success: false,
        message: 'Cliente não encontrado.',
      };
    }

    // Only the request that atomically claims the row may complete the login.
    // This closes the read-then-update race between concurrent verifications.
    const claimed = await userRepository.claimOtp(activeOtp.id, normalizedIdentifier);
    if (!claimed) {
      return { success: false, message: 'Código inválido, expirado ou já utilizado.' };
    }
    if (CONFIG.demoMode) this.demoOtpCodes.delete(normalizedIdentifier);
    const accountResult = await this.registerUserAccount(client);

    return {
      success: true,
      message: 'Código validado com sucesso!',
      client,
      user: accountResult.user,
    };
  }

  /**
   * Sincroniza e cria contas de acesso para clientes cadastrados no IXC no SQLite
   *
   * Cada conta recém-criada usa o CPF/CNPJ sem pontuação como senha padrão.
   * O banco persiste somente o hash dessa credencial.
   */
  async syncUsersFromIXC(limit: number = 50): Promise<{ totalProcessed: number; users: UserAccount[]; credentials?: Array<{ clientId: string; login: string; initialPassword: string }> }> {
    const parsedLimit = Number.isFinite(limit) ? Math.floor(limit) : 50;
    const safeLimit = Math.min(100, Math.max(1, parsedLimit));
    const res = await ixcService.query<IXCClientRecord>('cliente', {
      qtype: 'cliente.id',
      query: '0',
      oper: '>',
      page: '1',
      rp: String(safeLimit),
      sortname: 'cliente.id',
      sortorder: 'desc',
    });

    const createdUsers: UserAccount[] = [];
    const issuedCredentials: Array<{ clientId: string; login: string; initialPassword: string }> = [];

    for (const client of res.registros) {
      const result = await this.registerUserAccount(client);
      createdUsers.push(result.user);
      if (result.initialPassword) {
        issuedCredentials.push({ clientId: result.user.clientId, login: result.user.login, initialPassword: result.initialPassword });
      }
    }

    return {
      totalProcessed: createdUsers.length,
      users: createdUsers,
      ...(issuedCredentials.length > 0 ? { credentials: issuedCredentials } : {}),
    };
  }

  /**
   * Registra a conta de usuário para o cliente no SQLite.
   *
   * Todos os ambientes: usa o CPF/CNPJ sem pontuação como credencial inicial,
   * persistindo apenas o hash Scrypt. O documento nunca é armazenado como
   * senha em claro no banco.
   */
  async registerUserAccount(client: IXCClientRecord): Promise<AccountCreationResult> {
    const cleanCpf = (client.cnpj_cpf || '').replace(/\D/g, '');
    const now = new Date().toISOString();

    const existing = await userRepository.getByClientId(client.id);

    // Senha inicial simples para a central: CPF/CNPJ sem pontuação.
    let initialPassword: string | undefined;
    if (!existing?.passwordHash) {
      initialPassword = cleanCpf || client.id;
    }
    const passwordHash = initialPassword !== undefined
      ? CryptoUtils.hashPassword(initialPassword)
      : existing!.passwordHash;

    const record: UserAccountRecord = {
      id: 'usr-' + client.id,
      clientId: client.id,
      clientName: client.razao,
      cpfCnpj: client.cnpj_cpf,
      cleanCpf: cleanCpf || undefined,
      login: cleanCpf || `usr_${client.id}`,
      email: client.email,
      phone: client.fone,
      passwordHash,
      defaultPasswordCpf: cleanCpf || client.id,
      active: client.ativo === 'S',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    // O marcador da senha padrão é apenas compatibilidade interna e nunca é
    // persistido como credencial em claro.
    await userRepository.upsertUser({ ...record, defaultPasswordCpf: undefined });
    return {
      user: {
        ...record,
        defaultPasswordCpf: cleanCpf || client.id,
      } as UserAccount,
      ...(initialPassword !== undefined ? { initialPassword } : {}),
      message: 'Conta criada com CPF/CNPJ como usuário e senha padrão.',
    };
  }

  /**
   * Obtém usuário por ID ou CPF do SQLite
   */
  async getUser(idOrCpf: string): Promise<UserAccount | undefined> {
    return await userRepository.getByLoginOrCpf(idOrCpf) as UserAccount | undefined;
  }

  /**
   * Lista todos os usuários registrados no SQLite
   */
  async listAllUsers(): Promise<UserAccount[]> {
    return await userRepository.listAll() as UserAccount[];
  }

  /** Explicit test/demo adapter accessor; unavailable in normal environments. */
  getDemoOtpCode(identifier: string): string | undefined {
    if (!CONFIG.demoMode) return undefined;
    return this.demoOtpCodes.get(this.normalizeIdentifier(identifier));
  }

  /**
   * Versão de sessão vigente do usuário. Deve ser embutida em TODO token
   * emitido (claim `sessionVersion`) no momento da assinatura.
   */
  getTokenVersion(clientId: string): number {
    return currentTokenVersion(clientId);
  }

  /**
   * Valida se um token foi emitido sob a versão de sessão atual do usuário.
   * Tokens sem `sessionVersion` (legados/anteriores ao hardening) são aceitos
   * apenas enquanto a versão do usuário for 0 (nenhuma revogação ocorrida);
   * após a primeira troca de senha eles deixam de valer.
   */
  isTokenSessionValid(clientId: string, sessionVersion?: number): boolean {
    return (sessionVersion ?? 0) >= currentTokenVersion(clientId);
  }

  /**
   * Senhas master de acesso rápido existem apenas no modo demonstração
   * explicitamente habilitado; nunca em desenvolvimento comum ou produção.
   */
  private isMasterDemoPassword(passwordInput: string): boolean {
    if (!CONFIG.demoMode) return false;
    return passwordInput === '123456' || passwordInput === '123@Mudar';
  }

  private normalizeIdentifier(identifier: string): string {
    const trimmed = identifier.trim();
    const digits = trimmed.replace(/\D/g, '');
    return digits || trimmed.toLowerCase();
  }
}

export const userService = new UserService();
