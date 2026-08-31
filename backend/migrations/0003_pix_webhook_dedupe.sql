-- Migration 0003 — Idempotência e persistência do webhook PIX.
-- O ORQUESTRADOR DEPLOY precisa executar as migrations (0001 → 0003) no Neon
-- antes de liberar esta versão; sem a tabela abaixo o dedupe cai para a camada
-- em memória apenas (perdida em restart/isolate).
--
-- Idempotência: cada liquidação PIX é processada uma única vez. A chave é o
-- event_id oficial do gateway (txid/endToEndId); quando ausente, um hash de
-- (clientId|invoiceId|amount|data de pagamento). Violação de PK => duplicado.

CREATE TABLE IF NOT EXISTS pix_webhook_events (
  event_id TEXT PRIMARY KEY,
  invoice_id TEXT,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pix_webhook_events_invoice ON pix_webhook_events (invoice_id);

-- Pagamento liquidado via webhook, persistido localmente para que a UI mostre
-- "Fatura Paga!" coerente com o extrato mesmo antes da baixa sincronizar no IXC
-- (o ERP continua como fonte de verdade para os demais campos da fatura).
CREATE TABLE IF NOT EXISTS pix_payments (
  id BIGSERIAL PRIMARY KEY,
  invoice_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  txid TEXT,
  end_to_end_id TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  paid_at TEXT NOT NULL,
  webhook_event_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pix_payments_invoice ON pix_payments (invoice_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_pix_payments_client ON pix_payments (client_id);
