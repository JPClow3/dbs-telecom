export interface WifiSettings {
  clientId: string;
  ssid2G: string;
  ssid5G: string;
  password: string;
  guestSsid: string;
  guestPassword: string;
  guestEnabled: boolean;
  security: 'WPA2-PSK' | 'WPA3-SAE' | 'WPA2/WPA3-Mixed';
  channel2G: number;
  channel5G: number;
  connectedDevices: number;
  updatedAt: string;
}

export interface UpdateWifiSettingsDto {
  ssid2G?: string;
  ssid5G?: string;
  password?: string;
  guestSsid?: string;
  guestPassword?: string;
  guestEnabled?: boolean;
}

export interface WifiGuestQrPayload {
  ssid: string;
  password: string;
  qrString: string;
  security: string;
}
