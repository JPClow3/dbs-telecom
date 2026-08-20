export interface IXCQueryParams {
  qtype: string;
  query: string;
  oper?: string;
  page?: string;
  rp?: string;
  sortname?: string;
  sortorder?: string;
}

export interface IXCResponse<T> {
  page?: string;
  total: string | number;
  registros: T[];
}

export interface IXCClientRecord {
  id: string;
  razao: string;
  fantasia: string;
  cnpj_cpf: string;
  email: string;
  fone: string;
  telefone_celular?: string;
  ativo: 'S' | 'N';
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  cep: string;
  data_cadastro?: string;
}

export interface IXCInvoiceRecord {
  id: string;
  id_cliente: string;
  status: 'A' | 'R' | 'C'; // A = Aberto, R = Recebido/Pago, C = Cancelado
  data_emissao: string;
  data_vencimento: string;
  valor: string;
  valor_aberto: string;
  valor_recebido?: string;
  documento?: string;
  linha_digitavel?: string;
  pix_copia_e_cola?: string;
  tipo_recebimento?: string;
  obs?: string;
  id_contrato?: string;
}

export interface IXCContractRecord {
  id: string;
  id_cliente: string;
  status: 'A' | 'I' | 'D'; // A = Ativo, I = Inativo, D = Desistência
  id_vd_plano?: string;
  descricao?: string;
  data_ativacao?: string;
  endereco?: string;
  bairro?: string;
}

export interface IXCTicketRecord {
  id?: string;
  id_cliente: string;
  id_contrato?: string;
  id_filial?: string;
  tipo?: string;
  assunto: string;
  mensagem: string;
  origem_endereco?: string;
  prioridade?: 'B' | 'M' | 'A' | 'U'; // Baixa, Média, Alta, Urgente
  status?: 'A' | 'AN' | 'EN' | 'EC' | 'C' | 'F'; // Aberto, Análise, Encaminhado, Em Campo, Concluído, Fechado
  statusLabel?: string;
  protocolo?: string;
  data_abertura?: string;
  data_fechamento?: string;
  id_tecnico?: string;
  nome_tecnico?: string;
  previsao_visita?: string;
  etapas?: {
    titulo: string;
    descricao: string;
    concluido: boolean;
    dataHora?: string;
  }[];
}

export interface IXCRadacctRecord {
  radacctid: string;
  username: string;
  acctstarttime: string;
  acctstoptime?: string;
  acctsessiontime?: number;
  acctinputoctets: number; // bytes upload
  acctoutputoctets: number; // bytes download
  framedipaddress?: string;
  callingstationid?: string;
}

export interface UnblockPromiseResponse {
  success: boolean;
  message: string;
  protocolo: string;
  unblockUntil: string;
  unblockHours: number;
  contractId?: string;
}

export interface DailyTrafficUsage {
  date: string; // YYYY-MM-DD
  dayLabel: string; // ex: '14/08 (Seg)'
  downloadBytes: number;
  uploadBytes: number;
  totalBytes: number;
  downloadGB: number;
  uploadGB: number;
  totalGB: number;
}

export interface TrafficConsumptionSummary {
  clientId: string;
  period: string; // ex: 'Agosto 2026'
  totalDownloadGB: number;
  totalUploadGB: number;
  totalConsumedGB: number;
  dailyAverageGB: number;
  highestConsumptionDay: {
    date: string;
    dayLabel: string;
    totalGB: number;
  };
  planFranchise: string; // '100% Ilimitado (Sem Franquia)'
  dailyUsage: DailyTrafficUsage[];
}
