import crypto from 'crypto';

/**
 * Utilitários criptográficos seguros para Hashing de Senhas e OTP
 */
export class CryptoUtils {
  /**
   * Gera um hash criptográfico seguro da senha usando Scrypt com Salt aleatório
   */
  static hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, salt, 64);
    return `${salt}:${derivedKey.toString('hex')}`;
  }

  /**
   * Valida se a senha fornecida corresponde ao hash armazenado
   */
  static verifyPassword(password: string, storedHash: string): boolean {
    try {
      const [salt, key] = storedHash.split(':');
      if (!salt || !key) return false;

      const derivedKey = crypto.scryptSync(password, salt, 64);
      const keyBuffer = Buffer.from(key, 'hex');
      return crypto.timingSafeEqual(derivedKey, keyBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Gera um código numérico de 6 dígitos para OTP (One-Time Password)
   */
  static generateOtpCode(): string {
    return Math.floor(100000 + crypto.randomInt(0, 900000)).toString();
  }

  /**
   * Hashes a one-time code with a per-code salt. The identifier is included so
   * a leaked hash cannot be replayed for another account.
   */
  static hashOtp(code: string, identifier: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const digest = crypto.createHash('sha256')
      .update(`${salt}:${identifier}:${code}`)
      .digest('hex');
    return `${salt}:${digest}`;
  }

  static verifyOtp(code: string, identifier: string, storedHash: string): boolean {
    try {
      const [salt, expected] = storedHash.split(':');
      if (!salt || !expected || expected.length !== 64) return false;
      const actual = crypto.createHash('sha256')
        .update(`${salt}:${identifier}:${code}`)
        .digest('hex');
      return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  }
}
