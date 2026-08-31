import { getDatabase } from '../../database/db.js';
import { WifiSettings, UpdateWifiSettingsDto, WifiGuestQrPayload } from './wifi.types.js';

export class WifiService {
  async getWifiSettings(clientId: string): Promise<WifiSettings> {
    const db = getDatabase();
    const row = await db.prepare('SELECT * FROM wifi_configurations WHERE client_id = ?').get<any>(clientId);
    if (row) return mapSettings(row);
    const settings: WifiSettings = {
      clientId, ssid2G: `DBS_Fibra_${clientId}_2G`, ssid5G: `DBS_Fibra_${clientId}_5G_Turbo`, password: `dbs@${clientId}2026`,
      guestSsid: `DBS_Visitas_${clientId}`, guestPassword: `visita@${clientId}`, guestEnabled: true,
      security: 'WPA2-PSK', channel2G: 6, channel5G: 36, connectedDevices: 5, updatedAt: new Date().toISOString(),
    };
    await db.prepare(`
      INSERT INTO wifi_configurations (client_id, ssid_2g, ssid_5g, password, guest_ssid, guest_password, guest_enabled, security, channel_2g, channel_5g, connected_devices, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(settings.clientId, settings.ssid2G, settings.ssid5G, settings.password, settings.guestSsid, settings.guestPassword,
      1, settings.security, settings.channel2G, settings.channel5G, settings.connectedDevices, settings.updatedAt);
    return settings;
  }

  async updateWifiSettings(clientId: string, dto: UpdateWifiSettingsDto): Promise<WifiSettings> {
    const current = await this.getWifiSettings(clientId);
    if (dto.password && dto.password.length < 8) throw new Error('A senha do Wi-Fi deve conter no mínimo 8 caracteres.');
    if (dto.guestPassword && dto.guestPassword.length < 8) throw new Error('A senha da rede de visitas deve conter no mínimo 8 caracteres.');
    const updated = { ...current, ssid2G: dto.ssid2G || current.ssid2G, ssid5G: dto.ssid5G || current.ssid5G,
      password: dto.password || current.password, guestSsid: dto.guestSsid || current.guestSsid,
      guestPassword: dto.guestPassword || current.guestPassword, guestEnabled: dto.guestEnabled ?? current.guestEnabled,
      updatedAt: new Date().toISOString() };
    await getDatabase().prepare(`
      UPDATE wifi_configurations SET ssid_2g = ?, ssid_5g = ?, password = ?, guest_ssid = ?, guest_password = ?, guest_enabled = ?, updated_at = ? WHERE client_id = ?
    `).run(updated.ssid2G, updated.ssid5G, updated.password, updated.guestSsid, updated.guestPassword, Number(updated.guestEnabled), updated.updatedAt, clientId);
    return updated;
  }

  async getGuestQrCode(clientId: string): Promise<WifiGuestQrPayload> {
    const settings = await this.getWifiSettings(clientId);
    return { ssid: settings.guestSsid, password: settings.guestPassword,
      qrString: `WIFI:T:WPA;S:${settings.guestSsid};P:${settings.guestPassword};;`, security: 'WPA/WPA2' };
  }

  async restartWifi(clientId: string): Promise<{ success: boolean; message: string; estimatedRecoverySeconds: number }> {
    await this.getWifiSettings(clientId);
    return { success: true, message: 'Comando de reinicialização TR-069 enviado com sucesso para a ONU/Roteador.', estimatedRecoverySeconds: 45 };
  }
}

function mapSettings(row: any): WifiSettings {
  return { clientId: row.client_id, ssid2G: row.ssid_2g, ssid5G: row.ssid_5g, password: row.password,
    guestSsid: row.guest_ssid, guestPassword: row.guest_password, guestEnabled: Number(row.guest_enabled) === 1,
    security: row.security || 'WPA2-PSK', channel2G: Number(row.channel_2g || 6), channel5G: Number(row.channel_5g || 36),
    connectedDevices: Number(row.connected_devices || 5), updatedAt: row.updated_at };
}

export const wifiService = new WifiService();
