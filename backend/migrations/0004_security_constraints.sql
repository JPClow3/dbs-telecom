-- Durable admission invariant: a customer may have only one active queue entry.
CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_one_active_per_client
  ON queue_entries (client_id)
  WHERE status IN ('QUEUED', 'ASSIGNED', 'IN_SERVICE');
