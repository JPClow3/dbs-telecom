-- Migração 0002: convergência do índice de leitura de notificações.
--
-- O índice abaixo já existe em 0001_initial_postgres.sql, mas bancos
-- migrados manualmente antes da criação do runner (scripts/run-migrations.mjs)
-- podem não tê-lo aplicado. Com o guard IF NOT EXISTS esta migração é segura
-- tanto para bancos novos (0001 já criou o índice → no-op) quanto para os
-- existentes (cria o índice que faltava), garantindo convergência.
CREATE INDEX IF NOT EXISTS idx_notifications_client_read ON notifications (client_id, read);
