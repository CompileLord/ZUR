ALTER TABLE product_analytics_events ADD COLUMN idempotency_key TEXT;
CREATE UNIQUE INDEX idx_product_analytics_idempotency_key
  ON product_analytics_events(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE invitations ADD COLUMN email_delivery_status TEXT NOT NULL DEFAULT 'not_applicable'
  CHECK (email_delivery_status IN ('not_applicable', 'pending', 'sent', 'failed', 'not_configured'));
ALTER TABLE invitations ADD COLUMN email_sent_at TEXT;
