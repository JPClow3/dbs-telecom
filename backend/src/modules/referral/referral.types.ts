export type ReferralStatus = 'PENDING_INSTALL' | 'ACTIVE_DISCOUNT' | 'COMPLETED';

export interface ReferredFriend {
  id: string;
  name: string;
  phone: string;
  status: ReferralStatus;
  statusLabel: string;
  statusBadgeColor: string;
  discountMonth?: string;
  discountPercentage: number;
  createdAt: string;
}

export interface ReferralSummary {
  clientId: string;
  referralCode: string;
  referralLink: string;
  totalReferred: number;
  activeDiscounts: number;
  totalSaved: number;
  totalSavedFormatado: string;
  friends: ReferredFriend[];
}

export interface CreateReferralDto {
  referrerClientId: string;
  referredName: string;
  referredPhone: string;
}
