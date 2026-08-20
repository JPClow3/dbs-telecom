import { describe, it, expect, beforeEach } from 'vitest';
import { ixcCache, IxcCacheService } from '../src/modules/ixc/ixc.cache.js';
import { ixcService } from '../src/modules/ixc/ixc.service.js';

describe('⚡ Suite de Cache em Memória com TTL para Consultas IXC', () => {
  beforeEach(() => {
    ixcCache.clear();
  });

  describe('📦 1. Operações Básicas de Cache e TTL', () => {
    it('deve armazenar e recuperar dados dentro do tempo de vida (TTL)', () => {
      const mockClient = { id: '2270', razao: 'Emanuel da Silva' };
      ixcCache.set('client:id:2270', mockClient, 30);

      const retrieved = ixcCache.get<typeof mockClient>('client:id:2270');
      expect(retrieved).toEqual(mockClient);

      const stats = ixcCache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(1);
    });

    it('deve expirar e descartar dados quando o TTL for ultrapassado', async () => {
      const shortTtlCache = new IxcCacheService(0.01); // 10ms
      shortTtlCache.set('temp-key', { foo: 'bar' }, 0.01);

      await new Promise((r) => setTimeout(r, 25));

      const res = shortTtlCache.get('temp-key');
      expect(res).toBeNull();

      const stats = shortTtlCache.getStats();
      expect(stats.misses).toBe(1);
    });

    it('deve invalidar cache por chave específica', () => {
      ixcCache.set('test-key', 'data-val', 60);
      expect(ixcCache.get('test-key')).toBe('data-val');

      const deleted = ixcCache.invalidate('test-key');
      expect(deleted).toBe(true);
      expect(ixcCache.get('test-key')).toBeNull();
    });

    it('deve invalidar todas as chaves associadas a um cliente (ID ou CPF)', () => {
      ixcCache.set('client:id:2270', { id: '2270' }, 60);
      ixcCache.set('client:doc:15429370789', { id: '2270' }, 60);
      ixcCache.set('contracts:2270', [{ id: '101' }], 60);
      ixcCache.set('invoices:2270', [{ id: '501' }], 60);
      ixcCache.set('other:client:9999', { id: '9999' }, 60);

      const deletedCount = ixcCache.invalidateClient('2270');
      expect(deletedCount).toBeGreaterThanOrEqual(3);

      expect(ixcCache.get('client:id:2270')).toBeNull();
      expect(ixcCache.get('contracts:2270')).toBeNull();
      expect(ixcCache.get('invoices:2270')).toBeNull();
      expect(ixcCache.get('other:client:9999')).toBeDefined();
    });
  });

  describe('🌐 2. Integração do Cache no IXCService', () => {
    it('deve utilizar o cache nas consultas repetidas de cliente evitando requisições HTTP adicionais', async () => {
      // 1ª Consulta (Preenche cache)
      const client1 = await ixcService.findClientByCpfCnpj('154.293.707-89');
      expect(client1).toBeDefined();

      const statsAfterFirst = ixcCache.getStats();

      // 2ª Consulta (Deve vir do cache gerando um hit)
      const client2 = await ixcService.findClientByCpfCnpj('154.293.707-89');
      expect(client2).toEqual(client1);

      const statsAfterSecond = ixcCache.getStats();
      expect(statsAfterSecond.hits).toBeGreaterThan(statsAfterFirst.hits);
    });

    it('deve invalidar o cache automaticamente ao executar desbloqueio em confiança', async () => {
      // Cache de faturas e contratos
      ixcCache.set('invoices:2270', [{ id: 'inv-1' }], 60);
      expect(ixcCache.get('invoices:2270')).toBeDefined();

      // Executa mutação (unblockPromise)
      await ixcService.unblockPromise('2270');

      // Cache de faturas do cliente deve ter sido invalidado
      expect(ixcCache.get('invoices:2270')).toBeNull();
    });
  });
});
