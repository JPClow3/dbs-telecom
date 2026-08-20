export type OpticalStatus = 'PERFECT' | 'WARNING' | 'CRITICAL';

export interface OpticalDiagnosticResult {
  clientId: string;
  rxPowerDbm: number;
  txPowerDbm: number;
  onuStatus: 'ONLINE' | 'OFFLINE' | 'LOS';
  oltIp: string;
  ponPort: string;
  classification: OpticalStatus;
  statusLabel: string;
  description: string;
  recommendation: string;
  ticketCreated: boolean;
  ticketProtocol?: string;
  checkedAt: string;
}
