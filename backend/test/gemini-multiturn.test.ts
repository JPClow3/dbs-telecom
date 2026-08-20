import { describe, it, expect } from 'vitest';
import { geminiProvider } from '../src/modules/ai/gemini.provider.js';

describe('🧠 Suite de Histórico Conversacional Multi-Turn do Google Gemini', () => {
  it('deve formatar uma mensagem individual simples sem histórico', () => {
    const contents = geminiProvider.formatGeminiContents('Olá, quero ver planos de internet');

    expect(contents).toHaveLength(1);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toContain('<user_message>\nOlá, quero ver planos de internet\n</user_message>');
  });

  it('deve mapear histórico conversacional com turnos alternados estritos (user -> model -> user)', () => {
    const history = [
      { sender: 'USER', text: 'Boa tarde!' },
      { sender: 'BOT', text: 'Olá! Sou o assistente da DBS Telecom. Como posso ajudar?' },
      { sender: 'USER', text: 'Minha internet está lenta' },
      { sender: 'BOT', text: 'Vamos iniciar o teste nos seus equipamentos.' },
    ];

    const contents = geminiProvider.formatGeminiContents('Já reiniciei o modem por 30s', history);

    // Deve ter 5 turnos alternados estritamente: user -> model -> user -> model -> user
    expect(contents).toHaveLength(5);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toBe('Boa tarde!');

    expect(contents[1].role).toBe('model');
    expect(contents[1].parts[0].text).toContain('DBS Telecom');

    expect(contents[2].role).toBe('user');
    expect(contents[2].parts[0].text).toBe('Minha internet está lenta');

    expect(contents[3].role).toBe('model');
    expect(contents[3].parts[0].text).toContain('teste nos seus equipamentos');

    expect(contents[4].role).toBe('user');
    expect(contents[4].parts[0].text).toContain('<user_message>\nJá reiniciei o modem por 30s\n</user_message>');
  });

  it('deve agrupar mensagens consecutivas do mesmo emissor para respeitar as regras da API do Gemini', () => {
    const history = [
      { sender: 'USER', text: 'Oi' },
      { sender: 'USER', text: 'Quero tirar uma dúvida' },
      { sender: 'BOT', text: 'Pois não!' },
      { sender: 'BOT', text: 'Qual a sua dúvida?' },
    ];

    const contents = geminiProvider.formatGeminiContents('Quanto custa o Wi-Fi 6?', history);

    // 1 user agrupado, 1 model agrupado, 1 user final
    expect(contents).toHaveLength(3);
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toBe('Oi\nQuero tirar uma dúvida');

    expect(contents[1].role).toBe('model');
    expect(contents[1].parts[0].text).toBe('Pois não!\nQual a sua dúvida?');

    expect(contents[2].role).toBe('user');
    expect(contents[2].parts[0].text).toContain('Quanto custa o Wi-Fi 6?');
  });

  it('deve ignorar turno inicial de modelo caso a conversa comece com saudação do bot', () => {
    const history = [
      { sender: 'BOT', text: 'Olá, bem vindo à DBS Telecom!' },
      { sender: 'USER', text: 'Preciso do meu boleto' },
      { sender: 'BOT', text: 'Aqui está sua fatura de R$ 119,90' },
    ];

    const contents = geminiProvider.formatGeminiContents('Como pago com PIX?', history);

    // O primeiro turno deve ser obrigatoriamente 'user'
    expect(contents[0].role).toBe('user');
    expect(contents[0].parts[0].text).toBe('Preciso do meu boleto');

    expect(contents[1].role).toBe('model');
    expect(contents[1].parts[0].text).toContain('R$ 119,90');

    expect(contents[2].role).toBe('user');
    expect(contents[2].parts[0].text).toContain('Como pago com PIX?');
  });
});
