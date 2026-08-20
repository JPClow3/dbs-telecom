import { ixcService } from '../ixc/ixc.service.js';
import { IXCClientRecord } from '../ixc/ixc.types.js';
import { CONFIG } from '../../config/env.js';

export interface UserAccount {
  id: string;
  clientId: string;
  clientName: string;
  cpfCnpj: string;
  cleanCpf: string;
  login: string;
  email?: string;
  phone?: string;
  defaultPasswordCpf: string;
  active: boolean;
  createdAt: string;
}

export class UserService {
  private userCache: Map<string, UserAccount> = new Map();

  /**
   * Autentica cliente via CPF/Login e Senha (onde a senha padrão é o CPF do cliente)
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

    // 2. Validação da senha:
    // A senha é o CPF do cliente (com ou sem pontuação) ou o ID caso não possua CPF cadastrado
    const isCpfMatch = (cleanPass.length > 0 && clientCpfClean.length > 0 && cleanPass === clientCpfClean) ||
      Boolean(client.cnpj_cpf?.trim() && passwordInput.trim() === client.cnpj_cpf.trim());
    const isIdMatch = Boolean(client.id && passwordInput.trim() === client.id);
    const isMasterDemoMatch = CONFIG.nodeEnv !== 'production' && (passwordInput === '123456' || passwordInput === '123@Mudar');

    if (isCpfMatch || isIdMatch || isMasterDemoMatch) {
      // Registra/atualiza no cache de usuários
      this.registerUserAccount(client);

      return {
        success: true,
        client,
      };
    }

    return {
      success: false,
      message: 'Senha incorreta. A senha padrão do seu acesso é o seu CPF (apenas números).',
    };
  }

  /**
   * Sincroniza e cria contas de acesso para todos os clientes cadastrados no IXC
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
      const user = this.registerUserAccount(client);
      createdUsers.push(user);
    }

    return {
      totalProcessed: createdUsers.length,
      users: createdUsers,
    };
  }

  /**
   * Registra a conta de usuário para o cliente
   */
  registerUserAccount(client: IXCClientRecord): UserAccount {
    const cleanCpf = (client.cnpj_cpf || '').replace(/\D/g, '');
    const user: UserAccount = {
      id: 'usr-' + client.id,
      clientId: client.id,
      clientName: client.razao,
      cpfCnpj: client.cnpj_cpf,
      cleanCpf,
      login: cleanCpf || `usr_${client.id}`,
      email: client.email,
      phone: client.fone,
      defaultPasswordCpf: cleanCpf || client.id,
      active: client.ativo === 'S',
      createdAt: new Date().toISOString(),
    };

    this.userCache.set(client.id, user);
    if (cleanCpf) {
      this.userCache.set(cleanCpf, user);
    }

    return user;
  }

  /**
   * Obtém usuário por ID ou CPF
   */
  getUser(idOrCpf: string): UserAccount | undefined {
    const clean = idOrCpf.replace(/\D/g, '');
    return this.userCache.get(clean) || this.userCache.get(idOrCpf);
  }

  /**
   * Lista todos os usuários registrados
   */
  listAllUsers(): UserAccount[] {
    return Array.from(new Set(this.userCache.values()));
  }
}

export const userService = new UserService();
