export type DepartmentType = 'COMERCIAL' | 'SUPORTE' | 'FINANCEIRO' | 'GERAL';

export interface Customer {
  id: string;
  nome: string;
  fantasia?: string;
  cpfCnpj: string;
  email: string;
  telefone: string;
  endereco: string;
}

export interface AuthResponse {
  found: boolean;
  authenticated: boolean;
  token?: string;
  expiresIn?: string;
  client: Customer;
  contracts?: Contract[];
}

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
  obs?: string;
  isOverdue: boolean;
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
