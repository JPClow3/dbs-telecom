import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { validateEnv } from '../src/config/env.js';
import { userService } from '../src/modules/auth/user.service.js';
import { userRepository } from '../src/modules/auth/user.repository.js';
import { jwtService } from '../src/modules/auth/jwt.service.js';

describe('🔐 Suite de Segurança de Produção, Hash de Senhas e OTP', () => {
  const app = createApp();

  beforeEach(async () => {
    await userRepository.clearAll();
  });

  describe('🛡️ 1. Validação de Ambiente de Produção (validateEnv)', () => {
    it('deve lançar erro impeditivo se NODE_ENV=production e JWT_SECRET for o default fallback', () => {
      expect(() => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'dbs-telecom-default-secret',
        });
      }).toThrow(/FATAL SECURITY CONFIG/);
    });

    it('deve lançar erro se NODE_ENV=production e JWT_SECRET tiver menos de 32 caracteres', () => {
      expect(() => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'curto-demais',
        });
      }).toThrow(/FATAL SECURITY CONFIG/);
    });

    it('deve rejeitar o antigo segredo nominal mesmo quando os demais segredos existem', () => {
      expect(() => validateEnv({
        NODE_ENV: 'production',
        JWT_SECRET: 'dbs-telecom-default-secret',
        IXC_TOKEN: 'configured-ixc-token-for-test',
        PIX_WEBHOOK_SECRET: 'configured-pix-webhook-secret-for-test-32',
      })).toThrow(/FATAL SECURITY CONFIG/);
    });

    it('deve passar na validação quando JWT_SECRET for forte em produção', () => {
      expect(() => {
        validateEnv({
          NODE_ENV: 'production',
          JWT_SECRET: 'super-chave-secreta-de-producao-dbs-telecom-2026-ftth-ultra-segura',
          IXC_TOKEN: 'ixc-token-configured-only-for-this-test-run',
          GEMINI_API_KEY: 'gemini-key-configured-only-for-this-test-run',
          PIX_WEBHOOK_SECRET: 'pix-webhook-secret-configured-only-for-this-test-run',
          DATABASE_URL: 'postgresql://test:password@localhost/test?sslmode=require',
        });
      }).not.toThrow();
    });
  });

  describe('🔑 2. Hashing de Senha e Alteração Segura', () => {
    it('deve autenticar inicialmente com a senha padrão (CPF)', async () => {
      const auth = await userService.authenticateUser('154.293.707-89', '15429370789');
      expect(auth.success).toBe(true);
      expect(auth.client).toBeDefined();
    });

    it('deve permitir alterar a senha com hash seguro e impedir login com a senha antiga', async () => {
      const authInit = await userService.authenticateUser('154.293.707-89', '15429370789');
      expect(authInit.success).toBe(true);
      const clientId = authInit.client!.id;

      // 1. Altera senha para 'NovaSenha@2026'
      const changeRes = await userService.changePassword(clientId, '15429370789', 'NovaSenha@2026');
      expect(changeRes.success).toBe(true);

      // 2. Tenta logar com a senha antiga (CPF) -> deve falhar
      const oldAuth = await userService.authenticateUser('154.293.707-89', '15429370789');
      expect(oldAuth.success).toBe(false);

      // 3. Tenta logar com a nova senha customizada -> deve ter sucesso
      const newAuth = await userService.authenticateUser('154.293.707-89', 'NovaSenha@2026');
      expect(newAuth.success).toBe(true);
      expect(newAuth.client?.id).toBe(clientId);
    });

    it('deve alterar senha via endpoint REST /api/auth/change-password com Anti-IDOR', async () => {
      const authInit = await userService.authenticateUser('154.293.707-89', '15429370789');
      const client = authInit.client!;

      const token = jwtService.generateToken({
        clientId: client.id,
        cpfCnpj: client.cnpj_cpf,
        name: client.razao,
        role: 'client',
        // Versão vigente: isola o efeito do endpoint de troca de senha de bumps
        // feitos por testes anteriores (tokens legados já estariam revogados).
        sessionVersion: userService.getTokenVersion(client.id),
      });

      const res = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          clientId: client.id,
          oldPassword: '15429370789',
          newPassword: 'MinhaSenhaForte#2026',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('📱 3. Autenticação via OTP (SMS e WhatsApp)', () => {
    it('deve solicitar código OTP e enviar com telefone mascarado', async () => {
      const res = await request(app)
        .post('/api/auth/otp/request')
        .send({
          identifier: '154.293.707-89',
          channel: 'WHATSAPP',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.channel).toBe('WHATSAPP');
      expect(res.body.maskedPhone).toBeDefined();
    });

    it('deve validar o código OTP e emitir token JWT assinado', async () => {
      // 1. Solicita OTP
      const otpReq = await userService.requestOtp('154.293.707-89', 'SMS');
      expect(otpReq.success).toBe(true);

      const validCode = userService.getDemoOtpCode('154.293.707-89');
      expect(validCode).toMatch(/^\d{6}$/);

      // 2. Valida via endpoint REST
      const verifyRes = await request(app)
        .post('/api/auth/otp/verify')
        .send({
          identifier: '154.293.707-89',
          code: validCode,
        });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.authenticated).toBe(true);
      expect(verifyRes.body.token).toBeDefined();
      expect(verifyRes.body.client).toBeDefined();

      // 3. Tentar reusar o mesmo código OTP -> deve rejeitar
      const reuseRes = await request(app)
        .post('/api/auth/otp/verify')
        .send({
          identifier: '154.293.707-89',
          code: validCode,
        });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.success).toBe(false);
    });
  });
});
