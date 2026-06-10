-- pg_notify trigger for Outbox table
-- Fires on INSERT to notify the poller worker immediately

CREATE OR REPLACE FUNCTION notify_outbox_new()
RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('outbox_new', NEW.id::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER outbox_insert_notify
  AFTER INSERT ON "Outbox"
  FOR EACH ROW
  EXECUTE FUNCTION notify_outbox_new();
