import { afterEach, describe, expect, it, vi } from 'vitest';
import { ixcContextBuilder } from '../src/modules/ai/ixc-context.builder.js';
import { ixcService } from '../src/modules/ixc/ixc.service.js';

describe('🧭 Disponibilidade do contexto financeiro IXC', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve marcar o financeiro como indisponível e nunca afirmar adimplência em uma falha do IXC', async () => {
    vi.spyOn(ixcService, 'findClientById').mockRejectedValue(new Error('IXC fora do ar'));

    const bundle = await ixcContextBuilder.buildContext('client-ixc-outage');
    const prompt = ixcContextBuilder.formatContextForPrompt(bundle);

    expect(bundle.financial.status).toBe('UNAVAILABLE');
    expect(prompt).toMatch(/indisponível/i);
    expect(prompt).not.toContain('100% em dia');
    expect(prompt).not.toContain('Nenhuma fatura em aberto');
  });

  it('não deve transformar faturas já pagas em dívida aberta no contexto da IA', async () => {
    vi.spyOn(ixcService, 'findClientById').mockResolvedValue({
      id: 'client-paid', razao: 'Cliente Pago', fantasia: 'Cliente Pago', cnpj_cpf: '12345678901',
      email: '', fone: '', ativo: 'S', endereco: '', numero: '', bairro: '', cidade: '', cep: '',
    });
    vi.spyOn(ixcService, 'getClientContracts').mockResolvedValue([]);
    vi.spyOn(ixcService, 'getClientInvoices').mockResolvedValue([{
      id: 'invoice-paid', id_cliente: 'client-paid', status: 'R', data_emissao: '2026-08-01',
      data_vencimento: '2026-08-10', valor: '120.00', valor_aberto: '0', valor_recebido: '120.00',
    }]);

    const bundle = await ixcContextBuilder.buildContext('client-paid');
    const prompt = ixcContextBuilder.formatContextForPrompt(bundle);

    expect(bundle.financial.status).toBe('AVAILABLE');
    expect(bundle.financial.hasOpenInvoices).toBe(false);
    expect(bundle.financial.openInvoicesCount).toBe(0);
    expect(prompt).toContain('100% em dia');
    expect(prompt).not.toContain('FATURAS EM ABERTO');
  });
});
