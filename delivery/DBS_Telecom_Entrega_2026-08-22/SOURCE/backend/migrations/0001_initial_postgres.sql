-- DBS Telecom initial PostgreSQL schema for Neon.
-- Text timestamps preserve the API's existing ISO-8601 wire format.
CREATE TABLE IF NOT EXISTS chat_sessions (
  session_id TEXT PRIMARY KEY,
  client_id TEXT,
  client_name TEXT,
  current_department TEXT NOT NULL DEFAULT 'GERAL',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  department TEXT,
  quick_options TEXT,
  ai_provider TEXT,
  ai_model TEXT,
  guardrail_applied INTEGER NOT NULL DEFAULT 0,
  cards TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time ON chat_messages (session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_client ON chat_sessions (client_id);

CREATE TABLE IF NOT EXISTS queue_entries (
  queue_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  department TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 1,
  estimated_wait_minutes DOUBLE PRECISION NOT NULL DEFAULT 2,
  joined_at TEXT NOT NULL,
  assigned_at TEXT,
  completed_at TEXT,
  assigned_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_queue_entries_client_status ON queue_entries (client_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_entries_dept_status ON queue_entries (department, status, joined_at);

CREATE TABLE IF NOT EXISTS csat_feedbacks (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  client_name TEXT,
  session_id TEXT,
  rating INTEGER NOT NULL,
  comment TEXT,
  tags TEXT,
  department TEXT,
  context TEXT NOT NULL DEFAULT 'GENERAL',
  target_protocol TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_csat_feedbacks_client ON csat_feedbacks (client_id);
CREATE INDEX IF NOT EXISTS idx_csat_feedbacks_created ON csat_feedbacks (created_at DESC);

CREATE TABLE IF NOT EXISTS support_diagnostics (
  client_id TEXT PRIMARY KEY,
  step TEXT NOT NULL,
  multiple_devices INTEGER,
  cables_checked INTEGER,
  restarted INTEGER,
  protocolo TEXT,
  ticket_id TEXT,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_tickets (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  id_contrato TEXT,
  tipo TEXT,
  assunto TEXT NOT NULL,
  mensagem TEXT,
  status TEXT NOT NULL,
  status_label TEXT,
  prioridade TEXT,
  protocolo TEXT,
  data_abertura TEXT NOT NULL,
  nome_tecnico TEXT,
  previsao_visita TEXT,
  etapas TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_tickets_client ON user_tickets (client_id, data_abertura DESC);

CREATE TABLE IF NOT EXISTS user_accounts (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  cpf_cnpj TEXT,
  clean_cpf TEXT,
  login TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT,
  default_password_cpf TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_accounts_cpf ON user_accounts (clean_cpf);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  code TEXT NOT NULL DEFAULT '[REDACTED]',
  code_hash TEXT,
  channel TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at BIGINT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_ident_exp ON otp_codes (identifier, used, expires_at);

CREATE TABLE IF NOT EXISTS wifi_configurations (
  client_id TEXT PRIMARY KEY,
  ssid_2g TEXT NOT NULL,
  ssid_5g TEXT NOT NULL,
  password TEXT NOT NULL,
  guest_ssid TEXT NOT NULL,
  guest_password TEXT NOT NULL,
  guest_enabled INTEGER NOT NULL DEFAULT 1,
  security TEXT NOT NULL DEFAULT 'WPA2-PSK',
  channel_2g INTEGER NOT NULL DEFAULT 6,
  channel_5g INTEGER NOT NULL DEFAULT 36,
  connected_devices INTEGER NOT NULL DEFAULT 5,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_type TEXT,
  action_payload TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_client ON notifications (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_client_read ON notifications (client_id, read);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_client_id TEXT NOT NULL,
  referred_name TEXT NOT NULL,
  referred_phone TEXT NOT NULL,
  status TEXT NOT NULL,
  discount_month TEXT,
  discount_percentage INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_client_id, created_at DESC);
