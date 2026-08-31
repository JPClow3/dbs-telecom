import { getDatabase } from '../../database/db.js';
import { PushNotification, CreateNotificationDto } from './notifications.types.js';

export class NotificationsRepository {
  async save(dto: CreateNotificationDto): Promise<PushNotification> {
    const id = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = new Date().toISOString();
    await getDatabase().prepare(`
      INSERT INTO notifications (id, client_id, type, title, body, action_type, action_payload, read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(id, dto.clientId, dto.type, dto.title, dto.body, dto.actionType || null, dto.actionPayload || null, createdAt);
    return { id, clientId: dto.clientId, type: dto.type, title: dto.title, body: dto.body,
      actionType: dto.actionType, actionPayload: dto.actionPayload, read: false, createdAt };
  }

  async findByClientId(clientId: string): Promise<PushNotification[]> {
    const rows = await getDatabase().prepare(`SELECT * FROM notifications WHERE client_id = ? ORDER BY created_at DESC LIMIT 50`).all<any>(clientId);
    return rows.map((row) => ({ id: row.id, clientId: row.client_id, type: row.type, title: row.title, body: row.body,
      actionType: row.action_type || undefined, actionPayload: row.action_payload || undefined,
      read: Number(row.read) === 1, createdAt: row.created_at }));
  }

  async markAsRead(clientId: string, notificationId: string): Promise<boolean> {
    return (await getDatabase().prepare(`UPDATE notifications SET read = 1 WHERE id = ? AND client_id = ?`).run(notificationId, clientId)).changes > 0;
  }

  async markAllAsRead(clientId: string): Promise<number> {
    return (await getDatabase().prepare(`UPDATE notifications SET read = 1 WHERE client_id = ?`).run(clientId)).changes;
  }

  async clearByClientId(clientId: string): Promise<void> {
    await getDatabase().prepare('DELETE FROM notifications WHERE client_id = ?').run(clientId);
  }
}

export const notificationsRepository = new NotificationsRepository();
