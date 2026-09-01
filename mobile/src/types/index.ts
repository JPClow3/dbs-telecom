export type DepartmentType = 'COMERCIAL' | 'SUPORTE' | 'FINANCEIRO' | 'GERAL';

export interface Customer {
  id: string;
  nome: string;
  fantasia?: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
  endereco: string;
  /** True only for an explicitly selected local/demo customer. */
  isDemo?: boolean;
}

export type SessionMode = 'live' | 'demo';

/**
 * The customer object is display data; the token is the authentication proof.
 * A session is never valid when the token is absent.
 */
export interface AuthSession {
  customer: Customer;
  token: string;
  expiresAt?: number;
  mode?: SessionMode;
}

export interface AuthResponse {
  found: boolean;
  authenticated: boolean;
  mode?: SessionMode;
  dataState?: ApiDataState;
  token?: string;
  expiresIn?: string;
  client?: Customer;
  contracts?: Contract[];
}

/** Minimal PII returned by the authenticated identification endpoint. */
export interface IdentifiedCustomer {
  nome: string;
  cpfCnpjMascarado: string;
}

export interface IdentifyResponse {
  found: boolean;
  client?: IdentifiedCustomer;
  message?: string;
}

export type ApiDataState = 'LIVE' | 'UNAVAILABLE' | 'UNAUTHORIZED' | 'DEMO';

export interface Contract {
  id: string;
  id_cliente: string;
  status: string;
  id_vd_plano?: string;
  descricao?: string;
}

export interface FormattedInvoice {
  id: string;
  documento: string;
  valor: number;
  valorFormatado: string;
  dataEmissao: string;
  dataVencimento: string;
  dataVencimentoFormatada: string;
  status: 'PENDENTE' | 'PAGO' | 'VENCIDO';
  linhaDigitavel: string;
  linhaDigitavelFormatada: string;
  pixCopiaECola: string;
  clienteId?: string;
  obs?: string;
  isOverdue: boolean;
  /** Backend marks explicitly configured demo data; never inferred client-side. */
  simulated?: boolean;
  dataState?: ApiDataState;
}

export interface DBSPlan {
  id: string;
  name: string;
  speed: string;
  downloadMbps: number;
  uploadMbps: number;
  price: number;
  priceOnTime?: number;
  description: string;
  type: 'URBANO' | 'WIFI6' | 'RETENCAO';
  isPopular?: boolean;
  recommendedForDevices?: string;
  features: string[];
  dataState?: ApiDataState;
}

export interface TicketRecord {
  id?: string;
  id_cliente: string;
  id_contrato?: string;
  tipo?: string;
  assunto: string;
  mensagem: string;
  status?: 'A' | 'AN' | 'EN' | 'EC' | 'C' | 'F';
  statusLabel: string;
  prioridade?: 'B' | 'M' | 'A' | 'U';
  protocolo: string;
  data_abertura?: string;
  data_fechamento?: string;
  nome_tecnico?: string;
  previsao_visita?: string;
  etapas?: {
    titulo: string;
    descricao: string;
    concluido: boolean;
    dataHora?: string;
  }[];
}

export interface UnblockPromiseResult {
  success: boolean;
  message: string;
  protocolo: string;
  unblockUntil: string;
  unblockHours: number;
  contractId?: string;
}

export interface DailyTraffic {
  date: string;
  dayLabel: string;
  downloadGB: number;
  uploadGB: number;
  totalGB: number;
}

export interface TrafficConsumptionSummary {
  clientId: string;
  period: string;
  totalDownloadGB: number;
  totalUploadGB: number;
  totalConsumedGB: number;
  dailyAverageGB: number;
  highestConsumptionDay: {
    date: string;
    dayLabel: string;
    totalGB: number;
  };
  planFranchise: string;
  dailyUsage: DailyTraffic[];
}

export interface SpeedTestMetrics {
  pingMs: number;
  jitterMs: number;
  downloadMbps: number;
  uploadMbps: number;
  packetLossPercent: number;
  status: string;
  timestamp: string;
}

export interface CSATCardData {
  id: string;
  question: string;
  context: 'DIAGNOSTIC' | 'HIRING' | 'FINANCIAL' | 'GENERAL';
  targetProtocol?: string;
  submitted?: boolean;
  selectedRating?: number;
}

export interface QueueCardData {
  queueId: string;
  position: number;
  estimatedWaitMinutes: number;
  department: DepartmentType;
  status: 'IDLE' | 'QUEUED' | 'ASSIGNED' | 'IN_SERVICE' | 'COMPLETED' | 'CANCELLED';
  assignedAgent?: {
    name: string;
    role: string;
    department: DepartmentType;
  };
}

export interface AudioCardData {
  transcript: string;
  durationSeconds?: number;
  mimeType?: string;
  audioUrl?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'USER' | 'BOT' | 'SYSTEM';
  text: string;
  timestamp: string;
  department?: DepartmentType;
  quickOptions?: string[];
  aiProvider?: string;
  aiModel?: string;
  guardrailApplied?: boolean;
  /** Indicates whether this message came from the live API or an explicit non-live state. */
  dataState?: ApiDataState;
  cards?: {
    type: 'INVOICE' | 'PLANS' | 'DIAGNOSTIC' | 'TICKET' | 'CSAT' | 'QUEUE' | 'AUDIO';
    invoices?: FormattedInvoice[];
    plans?: DBSPlan[];
    ticketProtocol?: string;
    csat?: CSATCardData;
    queue?: QueueCardData;
    audio?: AudioCardData;
  };
}

// 📶 Wi-Fi & Rede Visitas
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

// 🔍 Diagnóstico Ótico (dBm)
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

// 🔔 Notificações Inteligentes
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

// 🎁 Programa Indique e Ganhe 50% OFF
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

export interface PixPaymentEvent {
  event: 'PIX_CONFIRMED';
  invoiceId: string;
  clientId: string;
  amount: number;
  paidAt: string;
  message: string;
}
