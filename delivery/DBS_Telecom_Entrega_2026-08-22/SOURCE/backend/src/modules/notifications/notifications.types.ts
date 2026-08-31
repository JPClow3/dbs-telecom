export type NotificationType =
  | 'INVOICE_REMINDER'
  | 'MAINTENANCE_ALERT'
  | 'TICKET_STATUS'
  | 'REFERRAL_REWARD'
  | 'SYSTEM_NOTICE';

export interface PushNotification {
  id: string;
  clientId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionType?: 'COPY_PIX' | 'VIEW_INVOICE' | 'TICKET_DETAILS' | 'VIEW_REFERRALS' | 'GENERAL';
  actionPayload?: string;
  read: boolean;
  createdAt: string;
}

export interface CreateNotificationDto {
  clientId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionType?: 'COPY_PIX' | 'VIEW_INVOICE' | 'TICKET_DETAILS' | 'VIEW_REFERRALS' | 'GENERAL';
  actionPayload?: string;
}
