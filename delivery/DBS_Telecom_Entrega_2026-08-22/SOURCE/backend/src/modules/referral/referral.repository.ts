import { getDatabase } from '../../database/db.js';
import { ReferredFriend, CreateReferralDto, ReferralStatus } from './referral.types.js';

export class ReferralRepository {
  async create(dto: CreateReferralDto): Promise<ReferredFriend> {
    const id = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const createdAt = new Date().toISOString();
    await getDatabase().prepare(`
      INSERT INTO referrals (id, referrer_client_id, referred_name, referred_phone, status, discount_month, discount_percentage, created_at)
      VALUES (?, ?, ?, ?, 'PENDING_INSTALL', NULL, 50, ?)
    `).run(id, dto.referrerClientId, dto.referredName, dto.referredPhone, createdAt);
    return { id, name: dto.referredName, phone: dto.referredPhone, status: 'PENDING_INSTALL',
      statusLabel: 'Aguardando Instalação', statusBadgeColor: '#F59E0B', discountPercentage: 50, createdAt };
  }

  async findByReferrerId(referrerClientId: string): Promise<ReferredFriend[]> {
    const rows = await getDatabase().prepare(`SELECT * FROM referrals WHERE referrer_client_id = ? ORDER BY created_at DESC`).all<any>(referrerClientId);
    return rows.map((row) => mapFriend(row));
  }

  async updateStatus(referralId: string, status: ReferralStatus, discountMonth?: string): Promise<boolean> {
    return (await getDatabase().prepare(`UPDATE referrals SET status = ?, discount_month = ? WHERE id = ?`).run(status, discountMonth || null, referralId)).changes > 0;
  }

  async clearByReferrerId(referrerClientId: string): Promise<void> {
    await getDatabase().prepare('DELETE FROM referrals WHERE referrer_client_id = ?').run(referrerClientId);
  }
}

function mapFriend(row: any): ReferredFriend {
  const status = row.status as ReferralStatus;
  const active = status === 'ACTIVE_DISCOUNT';
  const completed = status === 'COMPLETED';
  return { id: row.id, name: row.referred_name, phone: row.referred_phone, status,
    statusLabel: active ? `Ativo ➔ Desconto de 50% aplicado na fatura de ${row.discount_month || 'Setembro'}!` : completed ? `Desconto Concluído (${row.discount_month || 'Agosto'})` : 'Aguardando Instalação',
    statusBadgeColor: active ? '#10B981' : completed ? '#6B7280' : '#F59E0B',
    discountMonth: row.discount_month || undefined, discountPercentage: Number(row.discount_percentage || 50), createdAt: row.created_at };
}

export const referralRepository = new ReferralRepository();
