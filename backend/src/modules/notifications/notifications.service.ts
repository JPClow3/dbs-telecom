import { notificationsRepository } from './notifications.repository.js';
import { PushNotification, CreateNotificationDto } from './notifications.types.js';
import { CONFIG } from '../../config/env.js';

export class NotificationsService {
  /**
   * Obtém as notificações do cliente
   */
  async getUserNotifications(clientId: string): Promise<PushNotification[]> {
    const list = await notificationsRepository.findByClientId(clientId);
    if (list.length === 0 && CONFIG.demoMode) {
      // Cria notificações de boas-vindas e lembretes contextuais padrão
      const defaultNotifs: CreateNotificationDto[] = [
        {
          clientId,
          type: 'INVOICE_REMINDER',
          title: '💳 Fatura DBS Fibra a Vencer',
          body: 'Sua fatura de R$ 99,90 vence em 3 dias. Pague agora via PIX com aprovação em segundos!',
          actionType: 'COPY_PIX',
          actionPayload: '00020126580014br.gov.bcb.pix0136dbs-telecom-fibra-chave-pix-2026520400005303986540599.905802BR5919DBS TELECOM LTDA6008CHAPECO62070503***6304ABCD',
        },
        {
          clientId,
          type: 'MAINTENANCE_ALERT',
          title: '🛠️ Manutenção Preventiva Programada',
          body: 'Aviso: Melhoria na rede óptica do Bairro Efapi nesta quinta-feira das 02h às 04h (madrugada).',
          actionType: 'GENERAL',
        },
        {
          clientId,
          type: 'TICKET_STATUS',
          title: '🚗 Técnico a Caminho!',
          body: 'O técnico Carlos Eduardo está a caminho do seu endereço para a visita técnica da O.S. DBS-8472.',
          actionType: 'TICKET_DETAILS',
          actionPayload: JSON.stringify({ protocol: 'DBS-8472' }),
        },
      ];

      return await Promise.all(defaultNotifs.map((n) => notificationsRepository.save(n)));
    }

    return list;
  }

  /**
   * Envia uma notificação direta para um cliente
   */
  async sendNotification(dto: CreateNotificationDto): Promise<PushNotification> {
    return await notificationsRepository.save(dto);
  }

  /**
   * Dispara lembrete inteligente de fatura (3 dias antes do vencimento)
   */
  async sendInvoiceReminder(clientId: string, invoiceId: string, daysToDueDate: number, pixCode: string): Promise<PushNotification> {
    return await notificationsRepository.save({
      clientId,
      type: 'INVOICE_REMINDER',
      title: '💳 Lembrete de Vencimento de Fatura',
      body: `Sua mensalidade vence em ${daysToDueDate} dias. Copie a chave PIX e pague instantaneamente.`,
      actionType: 'COPY_PIX',
      actionPayload: pixCode,
    });
  }

  /**
   * Dispara alerta de manutenção programada segmentado
   */
  async sendMaintenanceAlert(clientId: string, neighborhood: string, window: string): Promise<PushNotification> {
    return await notificationsRepository.save({
      clientId,
      type: 'MAINTENANCE_ALERT',
      title: `⚡ Manutenção Preventiva (${neighborhood})`,
      body: `Informamos que realizaremos melhorias no backbone de fibra na sua região (${neighborhood}) na janela das ${window}.`,
      actionType: 'GENERAL',
    });
  }

  /**
   * Dispara atualização de O.S. e técnico em trânsito
   */
  async sendTicketUpdate(clientId: string, protocol: string, technicianName: string): Promise<PushNotification> {
    return await notificationsRepository.save({
      clientId,
      type: 'TICKET_STATUS',
      title: '🚗 Técnico em Deslocamento',
      body: `O especialista ${technicianName} está a caminho do seu endereço referente ao protocolo ${protocol}.`,
      actionType: 'TICKET_DETAILS',
      actionPayload: JSON.stringify({ protocol }),
    });
  }

  /**
   * Marca notificação como lida
   */
  async markAsRead(clientId: string, notificationId: string): Promise<boolean> {
    return await notificationsRepository.markAsRead(clientId, notificationId);
  }

  /**
   * Marca todas as notificações do cliente como lidas
   */
  async markAllAsRead(clientId: string): Promise<number> {
    return await notificationsRepository.markAllAsRead(clientId);
  }
}

export const notificationsService = new NotificationsService();
