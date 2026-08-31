import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config/env.js';
import { GeminiProvider } from '../src/modules/ai/gemini.provider.js';
import { IXCService } from '../src/modules/ixc/ixc.service.js';

const liveEnabled = process.env.RUN_LIVE_CONTRACTS === 'true';
const describeLive = liveEnabled ? describe : describe.skip;

describeLive('live provider contracts (opt-in)', () => {
  it('reads a configured IXC client without using demo fixtures', async () => {
    const clientId = process.env.LIVE_IXC_CLIENT_ID?.trim();
    expect(CONFIG.demoMode).toBe(false);
    expect(CONFIG.ixc.token, 'IXC_TOKEN is required').not.toBe('');
    expect(clientId, 'LIVE_IXC_CLIENT_ID is required').toBeTruthy();

    const client = await new IXCService().findClientById(clientId!);
    expect(client?.id).toBe(clientId);
  });

  it('receives a schema-valid response from the configured Gemini model', async () => {
    const provider = new GeminiProvider();
    expect(provider.isConfigured(), 'GEMINI_API_KEY is required').toBe(true);

    const response = await provider.generateResponse({
      message: 'Responda com uma saudação curta e classifique esta mensagem de atendimento.',
    });
    expect(response).not.toBeNull();
    expect(response?.friendlyMessage).toBeTruthy();
  });
});
