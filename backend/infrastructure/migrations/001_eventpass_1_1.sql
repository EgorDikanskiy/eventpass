ALTER TABLE events ALTER COLUMN starts_at DROP NOT NULL;
ALTER TABLE events ALTER COLUMN capacity DROP NOT NULL;
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_capacity_check;
ALTER TABLE events ADD COLUMN IF NOT EXISTS ends_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS finished_at timestamptz;
ALTER TABLE events ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]';
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS holder_phone text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS checker_name text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS consent_accepted_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS consent_versions jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_accepted_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_versions jsonb;

CREATE TABLE IF NOT EXISTS event_covers (
    id text PRIMARY KEY,
    owner_id text REFERENCES users ON DELETE SET NULL,
    mime_type text NOT NULL,
    byte_count integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE events ADD COLUMN IF NOT EXISTS cover_asset_id text REFERENCES event_covers;
CREATE INDEX IF NOT EXISTS events_cover_asset ON events (cover_asset_id);

CREATE TABLE IF NOT EXISTS command_results (
    scope text NOT NULL,
    key_hash text NOT NULL,
    fingerprint text NOT NULL,
    outcome jsonb NOT NULL,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
    PRIMARY KEY (scope, key_hash)
);
CREATE INDEX IF NOT EXISTS command_results_expiry ON command_results (expires_at);

CREATE TABLE IF NOT EXISTS rate_limits (
    bucket text NOT NULL,
    window_start bigint NOT NULL,
    attempts integer NOT NULL,
    PRIMARY KEY (bucket, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits (window_start);

ALTER TABLE events ADD COLUMN IF NOT EXISTS attendee_revision bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION update_attendee_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE events SET attendee_revision = attendee_revision + 1
    WHERE id = COALESCE(NEW.event_id, OLD.event_id);
    RETURN NULL;
END
$$;

CREATE OR REPLACE TRIGGER attendee_revision_changed
AFTER INSERT OR UPDATE OR DELETE ON tickets
FOR EACH ROW EXECUTE FUNCTION update_attendee_revision();
