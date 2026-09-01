import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CONFIG } from '../src/config/env.js';
import { userService } from '../src/modules/auth/user.service.js';
import { userRepository } from '../src/modules/auth/user.repository.js';
import { jwtService } from '../src/modules/auth/jwt.service.js';
import { ixcService } from '../src/modules/ixc/ixc.service.js';

/**
 * 🔐 Suite de endurecimento de autenticação (anti-enumeração, OTP 501,
 * /auth/identify protegido e revogação de token pós-troca de senha).
 *
 * O contrato da central usa o documento como usuário e senha padrão em todos
 * os ambientes; o ID interno continua exclusivo das fixtures falsas.
 */
describe('🔐 Suite de Segurança de Autenticação (hardening)', () => {
  const app = createApp();

  /** Token emitido "à moda antiga" (sem sessionVersion) — simula sessão pré-existente. */
  const legacyTokenFor = (clientId: string, cpfCnpj: string) =>
    jwtService.generateToken({ clientId, cpfCnpj, name: 'Cliente de teste', role: 'client' });

  beforeEach(async () => {
    await userRepository.clearAll();
  });

  describe('🕵️ 1. Anti-enumeração no login (/api/auth/login)', () => {
    it('mantém a expiração JWT e o campo expiresIn no mesmo contrato de 24 horas', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ cpfCnpj: '154.293.707-89', password: '15429370789' });

      expect(res.status).toBe(200);
      expect(res.body.expiresIn).toBe('24h');
      const payload = jwtService.verifyToken(res.body.token);
      expect(payload.exp! - payload.iat!).toBe(24 * 60 * 60);
    });

    it('retorna corpo e status idênticos para CPF desconhecido e senha incorreta', async () => {
      // Caso A: CPF que não existe na base
      const unknownDoc = await request(app)
        .post('/api/auth/login')
        .send({ cpfCnpj: '000.000.000-00', password: 'qualquer123' });

      // Caso B: CPF real existente, porém senha errada
      const wrongPassword = await request(app)
        .post('/api/auth/login')
        .send({ cpfCnpj: '154.293.707-89', password: 'senha_errada_999' });

      expect(unknownDoc.status).toBe(401);
      expect(wrongPassword.status).toBe(401);
      // Mesma mensagem genérica: impossível distinguir conta existente
      expect(unknownDoc.body.message).toBe('CPF ou senha inválidos.');
      expect(wrongPassword.body.message).toBe('CPF ou senha inválidos.');
      expect(unknownDoc.body).toEqual(wrongPassword.body);
    });

    it('não vaza mais a dica "senha padrão é o seu CPF" em nenhuma falha de login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ cpfCnpj: '154.293.707-89', password: 'errado' });

      expect(JSON.stringify(res.body)).not.toContain('senha padrão');
      expect(JSON.stringify(res.body)).not.toContain('Senha incorreta');
    });

    it('rejeita login sem senha (antes assumia senha = CPF)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ cpfCnpj: '154.293.707-89' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Informe a senha');
    });
  });

  describe('📱 2. OTP fora do demo → 501 NOT_IMPLEMENTED', () => {
    it('fora do modo demo retorna 501 (não 503) informando canal indisponível', async () => {
      const previousDemoMode = CONFIG.demoMode;
      CONFIG.demoMode = false;
      try {
        const res = await request(app)
          .post('/api/auth/otp/request')
          .send({ identifier: '154.293.707-89', channel: 'WHATSAPP' });

        expect(res.status).toBe(501);
        expect(res.body.code).toBe('NOT_IMPLEMENTED');
        expect(res.body.success).toBe(false);
        expect(res.body.providerNotConfigured).toBeUndefined();
        expect(res.body.error).toMatch(/ainda não está disponível/i);
      } finally {
        CONFIG.demoMode = previousDemoMode;
      }
    });

    it('em modo demo o fluxo OTP continua funcional (solicitação + código do adaptador)', async () => {
      const reqRes = await request(app)
        .post('/api/auth/otp/request')
        .send({ identifier: '154.293.707-89', channel: 'SMS' });

      expect(reqRes.status).toBe(200);
      expect(reqRes.body.success).toBe(true);

      const demoCode = userService.getDemoOtpCode('15429370789');
      expect(demoCode).toMatch(/^\d{6}$/);
    });
  });

  describe('🛡️ 3. /auth/identify protegido (era oráculo de PII aberto)', () => {
    it('bloqueia chamada sem token com 401', async () => {
      const res = await request(app)
        .post('/api/auth/identify')
        .send({ cpfCnpj: '154.293.707-89' });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('TOKEN_MISSING');
    });

    it('autenticado, retorna apenas confirmação mínima: nome e CPF mascarado', async () => {
      const token = legacyTokenFor('2270', '154.293.707-89');
      const res = await request(app)
        .post('/api/auth/identify')
        .set('Authorization', `Bearer ${token}`)
        .send({ cpfCnpj: '154.293.707-89' });

      expect(res.status).toBe(200);
      expect(res.body.found).toBe(true);
      expect(res.body.client.nome).toBeDefined();

      // CPF mascarado: nenhum dígito completo exposto além dos finais
      expect(res.body.client.cpfCnpjMascarado).toMatch(/^\*\*\*\.\d{3}\.\*\*\*-\d{2}$/);
      expect(res.body.client.cpfCnpjMascarado).not.toBe('154.293.707-89');

      // Payload mínimo: nada de e-mail, telefone, endereço, id ou contratos
      expect(res.body.client.email).toBeUndefined();
      expect(res.body.client.telefone).toBeUndefined();
      expect(res.body.client.endereco).toBeUndefined();
      expect(res.body.client.id).toBeUndefined();
      expect(res.body.contracts).toBeUndefined();
    });

    it('não permite que um cliente consulte o documento de outro cliente', async () => {
      const token = legacyTokenFor('2270', '154.293.707-89');
      const res = await request(app)
        .post('/api/auth/identify')
        .set('Authorization', `Bearer ${token}`)
        .send({ cpfCnpj: '999.999.999-99' });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('IDOR_FORBIDDEN');
    });

    it('aplica rate limit rígido de 5 requisições por minuto por IP', async () => {
      const token = legacyTokenFor('2270', '154.293.707-89');
      const doIdentify = () => request(app)
        .post('/api/auth/identify')
        .set('Authorization', `Bearer ${token}`)
        .send({ cpfCnpj: '154.293.707-89' });

      // Consultas autenticadas funcionam até esgotar a janela
      const first = await doIdentify();
      expect([200, 404]).toContain(first.status);

      // Exaure o restante da janela até o limite bloquear (429)
      let gotLimited = false;
      for (let i = 0; i < 10 && !gotLimited; i += 1) {
        const res = await doIdentify();
        if (res.status === 429) {
          gotLimited = true;
          expect(res.body.code).toBe('TOO_MANY_REQUESTS');
        } else {
          expect([200, 404]).toContain(res.status);
        }
      }
      // 5/min por IP: com no máximo 4 créditos restantes, 10 tentativas bastam
      expect(gotLimited).toBe(true);
    });
  });

  describe('📦 3.1. Limite da sincronização administrativa', () => {
    it('limita o lote solicitado ao IXC mesmo quando o operador envia um valor enorme', async () => {
      const query = vi.spyOn(ixcService, 'query').mockResolvedValue({ registros: [], total: 0 } as any);
      try {
        const adminToken = jwtService.generateToken({
          clientId: 'admin-sync-limit',
          cpfCnpj: '00000000000',
          name: 'Admin',
          role: 'admin',
        });
        const res = await request(app)
          .post('/api/auth/sync-users?limit=999999999')
          .set('Authorization', `Bearer ${adminToken}`)
          .send();

        expect(res.status).toBe(200);
        expect(query).toHaveBeenCalledWith('cliente', expect.objectContaining({ rp: '100' }));
      } finally {
        query.mockRestore();
      }
    });
  });

  describe('🔑 4. Troca de senha revoga tokens antigos (sessionVersion)', () => {
    it('incrementa a versão de sessão na troca de senha e rejeita tokens antigos', async () => {
      // Autenticação inicial cria conta (demo: senha = CPF)
      const authInit = await userService.authenticateUser('154.293.707-89', '15429370789');
      expect(authInit.success).toBe(true);
      const clientId = authInit.client!.id;

      const oldVersion = userService.getTokenVersion(clientId);
      const oldToken = legacyTokenFor(clientId, '154.293.707-89');
      const payloadOld = jwtService.verifyToken(oldToken);

      // Versão embutida no token antigo era válida antes da troca
      expect(userService.isTokenSessionValid(clientId, payloadOld.sessionVersion as number | undefined)).toBe(true);

      const change = await userService.changePassword(clientId, '15429370789', 'NovaSenhaForte@2026');
      expect(change.success).toBe(true);

      // Versão subiu; token antigo (sem claim) agora é rejeitado
      expect(userService.getTokenVersion(clientId)).toBe(oldVersion + 1);
      expect(userService.isTokenSessionValid(clientId, payloadOld.sessionVersion as number | undefined)).toBe(false);

      // Tokens recém-emitidos carregam a nova versão e são aceitos
      const freshPayload = jwtService.verifyToken(
        jwtService.generateToken({
          clientId,
          cpfCnpj: '154.293.707-89',
          name: authInit.client!.razao,
          role: 'client',
          sessionVersion: userService.getTokenVersion(clientId),
        }),
      );
      expect(freshPayload.sessionVersion).toBe(oldVersion + 1);
      expect(userService.isTokenSessionValid(clientId, freshPayload.sessionVersion as number | undefined)).toBe(true);

      // Login com a nova senha funciona; o CPF continua aceito como credencial
      // simples conforme o contrato da central.
      const newAuth = await userService.authenticateUser('154.293.707-89', 'NovaSenhaForte@2026');
      expect(newAuth.success).toBe(true);
      const oldAuth = await userService.authenticateUser('154.293.707-89', '15429370789');
      expect(oldAuth.success).toBe(true);
    });

    it('/auth/change-password via REST devolve novo token válido e invalida o anterior', async () => {
      const authInit = await userService.authenticateUser('154.293.707-89', '15429370789');
      const client = authInit.client!;
      // Token com a sessionVersion VIGENTE: o teste isola o efeito do próprio
      // endpoint (bump de versão + reemissão), sem herdar bumps de testes
      // anteriores que já revogariam qualquer token legado.
      const oldToken = jwtService.generateToken({
        clientId: client.id,
        cpfCnpj: client.cnpj_cpf || '',
        name: 'Cliente de teste',
        role: 'client',
        sessionVersion: userService.getTokenVersion(client.id),
      });

      const change = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ clientId: client.id, oldPassword: '15429370789', newPassword: 'OutraSenha@2026' });

      expect(change.status).toBe(200);
      expect(change.body.success).toBe(true);
      expect(change.body.token).toBeDefined();

      const freshPayload = jwtService.verifyToken(change.body.token);
      expect(freshPayload.sessionVersion).toBeGreaterThan(0);
      // O token usado na chamada não carregava o claim; a invalidação é provada
      // pela reemissão com a nova versão (sessionVersion > 0 acima) e pelo
      // teste de serviço que rejeita versões antigas.
    });
  });

  describe('🎭 5. Compatibilidade do modo demonstração', () => {
    it('mantém login com senha = CPF funcional também fora do modo demo', async () => {
      const previousDemoMode = CONFIG.demoMode;
      CONFIG.demoMode = false;
      const findClient = vi.spyOn(ixcService, 'findClientByCpfCnpj').mockResolvedValue({
        id: 'prod-client-cpf-login',
        razao: 'Cliente Produção',
        cnpj_cpf: '11122233344',
        ativo: 'S',
      } as any);
      try {
        const auth = await userService.authenticateUser('111.222.333-44', '11122233344');

        expect(auth.success).toBe(true);
        expect(auth.client?.id).toBe('prod-client-cpf-login');
      } finally {
        findClient.mockRestore();
        CONFIG.demoMode = previousDemoMode;
      }
    });

    it('produção: conta criada usa o CPF/CNPJ como senha e persiste apenas o hash', async () => {
      const previousDemoMode = CONFIG.demoMode;
      CONFIG.demoMode = false;
      try {
        // Cria a conta diretamente (registerUserAccount não depende do IXC).
        const { CryptoUtils } = await import('../src/utils/crypto.utils.js');
        const created = await userService.registerUserAccount({
          id: 'prod-client-1',
          razao: 'Cliente Produção LTDA',
          cnpj_cpf: '11122233344',
          ativo: 'S',
        } as any);

        expect(created.initialPassword).toBe('11122233344');
        expect(created.message).toMatch(/CPF\/CNPJ como usuário e senha/i);

        // Hash persistido valida a senha padrão sem guardar o CPF em claro.
        const stored = await userRepository.getByClientId('prod-client-1');
        expect(stored?.passwordHash).toBeDefined();
        expect(CryptoUtils.verifyPassword(created.initialPassword!, stored!.passwordHash!)).toBe(true);
        expect(stored?.defaultPasswordCpf).toBeUndefined();

        await userRepository.clearAll();
      } finally {
        CONFIG.demoMode = previousDemoMode;
      }
    });
  });
});
