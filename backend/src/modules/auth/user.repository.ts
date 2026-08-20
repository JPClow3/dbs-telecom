import { getDatabase } from '../../database/db.js';

export interface UserAccountRecord {
  id: string;
  clientId: string;
  clientName: string;
  cpfCnpj?: string;
  cleanCpf?: string;
  login: string;
  email?: string;
  phone?: string;
  passwordHash?: string;
  defaultPasswordCpf?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export class UserRepository {
  async upsertUser(user: UserAccountRecord): Promise<void> {
    await getDatabase().prepare(`
      INSERT INTO user_accounts (
        id, client_id, client_name, cpf_cnpj, clean_cpf,
        login, email, phone, password_hash, default_password_cpf,
        active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(client_id) DO UPDATE SET
        client_name = excluded.client_name, cpf_cnpj = excluded.cpf_cnpj,
        clean_cpf = excluded.clean_cpf, login = excluded.login, email = excluded.email,
        phone = excluded.phone, default_password_cpf = excluded.default_password_cpf,
        active = excluded.active, updated_at = excluded.updated_at
    `).run(user.id, user.clientId, user.clientName, user.cpfCnpj || null, user.cleanCpf || null,
      user.login, user.email || null, user.phone || null, user.passwordHash || null,
      user.defaultPasswordCpf || null, user.active ? 1 : 0, user.createdAt,
      user.updatedAt || new Date().toISOString());
  }

  async updatePasswordHash(clientId: string, passwordHash: string): Promise<void> {
    await getDatabase().prepare(`UPDATE user_accounts SET password_hash = ?, updated_at = ? WHERE client_id = ?`)
      .run(passwordHash, new Date().toISOString(), clientId);
  }

  async getByClientId(clientId: string): Promise<UserAccountRecord | undefined> {
    const row = await getDatabase().prepare(`
      SELECT id, client_id, client_name, cpf_cnpj, clean_cpf, login, email, phone,
             password_hash, default_password_cpf, active, created_at, updated_at
      FROM user_accounts WHERE client_id = ?
    `).get<any>(clientId);
    return row ? this.mapRow(row) : undefined;
  }

  async getByLoginOrCpf(identifier: string): Promise<UserAccountRecord | undefined> {
    const clean = identifier.replace(/\D/g, '');
    const row = await getDatabase().prepare(`
      SELECT id, client_id, client_name, cpf_cnpj, clean_cpf, login, email, phone,
             password_hash, default_password_cpf, active, created_at, updated_at
      FROM user_accounts
      WHERE client_id = ? OR clean_cpf = ? OR login = ? OR (clean_cpf != '' AND clean_cpf = ?)
      LIMIT 1
    `).get<any>(identifier, clean, identifier, clean);
    return row ? this.mapRow(row) : undefined;
  }

  async listAll(): Promise<UserAccountRecord[]> {
    const rows = await getDatabase().prepare(`
      SELECT id, client_id, client_name, cpf_cnpj, clean_cpf, login, email, phone,
             password_hash, default_password_cpf, active, created_at, updated_at
      FROM user_accounts ORDER BY client_name ASC
    `).all<any>();
    return rows.map((row) => this.mapRow(row));
  }

  async saveOtp(identifier: string, codeHash: string, channel: string, expiresInMinutes = 10): Promise<string> {
    const id = `otp-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    await getDatabase().prepare(`
      INSERT INTO otp_codes (id, identifier, code, code_hash, channel, expires_at, used, attempts, created_at)
      VALUES (?, ?, '[REDACTED]', ?, ?, ?, 0, 0, ?)
    `).run(id, identifier, codeHash, channel, Date.now() + expiresInMinutes * 60 * 1000, new Date().toISOString());
    return id;
  }

  async getActiveOtp(identifier: string): Promise<{ id: string; channel: string; codeHash: string; attempts: number } | undefined> {
    const row = await getDatabase().prepare(`
      SELECT id, channel, code_hash, attempts FROM otp_codes
      WHERE identifier = ? AND used = 0 AND expires_at > ? AND attempts < 5 AND code_hash IS NOT NULL
      ORDER BY expires_at DESC LIMIT 1
    `).get<any>(identifier, Date.now());
    return row ? { id: row.id, channel: row.channel, codeHash: row.code_hash, attempts: Number(row.attempts || 0) } : undefined;
  }

  async countRecentOtpRequests(identifier: string, sinceMs: number): Promise<number> {
    const row = await getDatabase().prepare(`SELECT COUNT(*) AS count FROM otp_codes WHERE identifier = ? AND created_at >= ?`)
      .get<any>(identifier, new Date(sinceMs).toISOString());
    return Number(row?.count || 0);
  }

  async getLatestOtpCreatedAt(identifier: string): Promise<number | undefined> {
    const row = await getDatabase().prepare(`SELECT created_at FROM otp_codes WHERE identifier = ? ORDER BY created_at DESC LIMIT 1`)
      .get<any>(identifier);
    return row ? Date.parse(row.created_at) : undefined;
  }

  async incrementOtpAttempt(id: string): Promise<void> {
    await getDatabase().prepare(`UPDATE otp_codes SET attempts = attempts + 1, last_attempt_at = ? WHERE id = ? AND used = 0`)
      .run(Date.now(), id);
  }

  async markOtpUsed(id: string): Promise<void> {
    await getDatabase().prepare(`UPDATE otp_codes SET used = 1 WHERE id = ?`).run(id);
  }

  async clearAll(): Promise<void> {
    await getDatabase().transaction([{ text: 'DELETE FROM user_accounts' }, { text: 'DELETE FROM otp_codes' }]);
  }

  private mapRow(row: any): UserAccountRecord {
    return {
      id: row.id, clientId: row.client_id, clientName: row.client_name,
      cpfCnpj: row.cpf_cnpj || undefined, cleanCpf: row.clean_cpf || undefined,
      login: row.login, email: row.email || undefined, phone: row.phone || undefined,
      passwordHash: row.password_hash || undefined, defaultPasswordCpf: row.default_password_cpf || undefined,
      active: Number(row.active) === 1, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }
}

export const userRepository = new UserRepository();
