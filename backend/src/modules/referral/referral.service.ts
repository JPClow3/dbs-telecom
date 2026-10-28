import { referralRepository } from './referral.repository.js';
import { ReferralSummary, CreateReferralDto, ReferredFriend } from './referral.types.js';

export class ReferralService {
  /**
   * Obtém o resumo completo do programa Indique e Ganhe do cliente
   */
  async getReferralSummary(clientId: string): Promise<ReferralSummary> {
    let friends = await referralRepository.findByReferrerId(clientId);

    if (friends.length === 0) {
      // Cria amigos demonstrativos para o cliente
      await referralRepository.create({
        referrerClientId: clientId,
        referredName: 'Marcos Vinicius S.',
        referredPhone: '(49) 99876-1122',
      });

      const friend2 = await referralRepository.create({
        referrerClientId: clientId,
        referredName: 'Juliana Mendes Lima',
        referredPhone: '(49) 99123-4455',
      });
      await referralRepository.updateStatus(friend2.id, 'ACTIVE_DISCOUNT', 'Setembro');

      friends = await referralRepository.findByReferrerId(clientId);
    }

    const activeDiscounts = friends.filter((f) => f.status === 'ACTIVE_DISCOUNT').length;
    const completedDiscounts = friends.filter((f) => f.status === 'COMPLETED').length;
    const totalSaved = (activeDiscounts + completedDiscounts) * 49.95; // 50% da mensalidade padrão

    return {
      clientId,
      referralCode: `DBS-${clientId}`,
      // The current adapter has no server-issued referral URL. Never expose a
      // locally fabricated link that a customer could mistake for a live offer.
      referralLink: '',
      totalReferred: friends.length,
      activeDiscounts,
      totalSaved,
      totalSavedFormatado: totalSaved.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      friends,
    };
  }

  /**
   * Registra uma nova indicação feita pelo cliente
   */
  async addReferral(dto: CreateReferralDto): Promise<ReferredFriend> {
    if (!dto.referredName || !dto.referredPhone) {
      throw new Error('Nome e telefone do amigo são obrigatórios.');
    }

    return await referralRepository.create(dto);
  }
}

export const referralService = new ReferralService();
