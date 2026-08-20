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
}

export interface OtpVerifyResult {
  success: boolean;
  message: string;
  client?: IXCClientRecord;
  user?: UserAccount;
}

export class UserService {
  /** Raw OTPs exist only in the explicit test/demo adapter and in memory. */
  private readonly demoOtpCodes = new Map<string, string>();

  /**
   * Autentica cliente via CPF/Login e Senha
   * Suporta:
   * 1. Senha customizada com hash criptográfico seguro (Scrypt/Salt)
   * 2. Senha padrão (CPF com/sem pontuação ou ID)
   * 3. Senha master de desenvolvimento (em ambiente não-produção)
   */
  async authenticateUser(loginOrCpf: string, passwordInput: string): Promise<{ success: boolean; client?: IXCClientRecord; message?: string }> {
    const cleanDoc = loginOrCpf.replace(/\D/g, '');
    const cleanPass = passwordInput.trim().replace(/\D/g, '');

    // 1. Busca cliente no IXC
    const client = await ixcService.findClientByCpfCnpj(loginOrCpf);
    if (!client) {
      return {
        success: false,
        message: 'Cliente não encontrado na base IXC da DBS Telecom.',
      };
    }

    const clientCpfClean = (client.cnpj_cpf || '').replace(/\D/g, '');

    // Busca usuário registrado no SQLite para checar se possui senha customizada com hash
    let existingUser = await userRepository.getByClientId(client.id);
    if (!existingUser) {
      existingUser = await this.registerUserAccount(client);
    }

    // A. Se tiver hash criptográfico salvo, valida estritamente pelo hash (e master de dev)
    if (existingUser.passwordHash) {
      const isPasswordValid = CryptoUtils.verifyPassword(passwordInput, existingUser.passwordHash);
      const isMasterDemoMatch = CONFIG.nodeEnv !== 'production' && (passwordInput === '123456' || passwordInput === '123@Mudar');

      if (isPasswordValid || isMasterDemoMatch) {
        return { success: true, client };
      }

      return {
        success: false,
        message: 'Senha incorreta. Utilize a senha personalizada cadastrada para o seu usuário.',
      };
    }

    // B. Validação da senha padrão caso não possua hash customizado (onde a senha padrão é o CPF do cliente ou ID)
    const isCpfMatch = (cleanPass.length > 0 && clientCpfClean.length > 0 && cleanPass === clientCpfClean) ||
      Boolean(client.cnpj_cpf?.trim() && passwordInput.trim() === client.cnpj_cpf.trim());
    const isIdMatch = Boolean(client.id && passwordInput.trim() === client.id);
    const isMasterDemoMatch = CONFIG.nodeEnv !== 'production' && (passwordInput === '123456' || passwordInput === '123@Mudar');

    if (isCpfMatch || isIdMatch || isMasterDemoMatch) {
      return {
        success: true,
        client,
      };
    }

    return {
      success: false,
      message: 'Senha incorreta. A senha padrão do seu acesso é o seu CPF (apenas números) ou sua senha personalizada.',
    };
  }

  /**
   * Altera a senha do usuário com hash criptográfico seguro
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

    return {
      success: true,
      message: 'Senha alterada com sucesso! Utilize sua nova senha nos próximos acessos.',
    };
  }

  /**
   * Solicita envio de código OTP por SMS ou WhatsApp
   */
  async requestOtp(identifier: string, channel: 'SMS' | 'WHATSAPP' = 'WHATSAPP'): Promise<OtpRequestResult> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);
    const normalizedChannel = channel === 'SMS' ? 'SMS' : 'WHATSAPP';

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
        message: 'Código de verificação inválido ou expirado. Solicite um novo código.',
      };
    }

    const client = await ixcService.findClientByCpfCnpj(identifier);
    if (!client) {
      return {
        success: false,
        message: 'Cliente não encontrado.',
      };
    }

    await userRepository.markOtpUsed(activeOtp.id);
    if (CONFIG.demoMode) this.demoOtpCodes.delete(normalizedIdentifier);
    const user = await this.registerUserAccount(client);

    return {
      success: true,
      message: 'Código validado com sucesso!',
      client,
      user,
    };
  }

  /**
   * Sincroniza e cria contas de acesso para clientes cadastrados no IXC no SQLite
   */
  async syncUsersFromIXC(limit: number = 50): Promise<{ totalProcessed: number; users: UserAccount[] }> {
    const res = await ixcService.query<IXCClientRecord>('cliente', {
      qtype: 'cliente.id',
      query: '0',
      oper: '>',
      page: '1',
      rp: String(limit),
      sortname: 'cliente.id',
      sortorder: 'desc',
    });

    const createdUsers: UserAccount[] = [];

    for (const client of res.registros) {
      const user = await this.registerUserAccount(client);
      createdUsers.push(user);
    }

    return {
      totalProcessed: createdUsers.length,
      users: createdUsers,
    };
  }

  /**
   * Registra a conta de usuário para o cliente no SQLite
   */
  async registerUserAccount(client: IXCClientRecord): Promise<UserAccount> {
    const cleanCpf = (client.cnpj_cpf || '').replace(/\D/g, '');
    const now = new Date().toISOString();

    const existing = await userRepository.getByClientId(client.id);

    const record: UserAccountRecord = {
      id: 'usr-' + client.id,
      clientId: client.id,
      clientName: client.razao,
      cpfCnpj: client.cnpj_cpf,
      cleanCpf: cleanCpf || undefined,
      login: cleanCpf || `usr_${client.id}`,
      email: client.email,
      phone: client.fone,
      passwordHash: existing?.passwordHash,
      defaultPasswordCpf: cleanCpf || client.id,
      active: client.ativo === 'S',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    // The legacy CPF-default marker is returned only by the explicit demo
    // adapter for compatibility with the prototype. It is never persisted as
    // credential material in normal environments.
    await userRepository.upsertUser({ ...record, defaultPasswordCpf: undefined });
    return {
      ...record,
      defaultPasswordCpf: CONFIG.demoMode ? (cleanCpf || client.id) : undefined,
    } as UserAccount;
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

  private normalizeIdentifier(identifier: string): string {
    const trimmed = identifier.trim();
    const digits = trimmed.replace(/\D/g, '');
    return digits || trimmed.toLowerCase();
  }
}

export const userService = new UserService();
