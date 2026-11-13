CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    public_id text NOT NULL UNIQUE,
    full_name text NOT NULL,
    email text NOT NULL UNIQUE,
    password_hash text,
    phone text,
    organization text,
    email_verified boolean NOT NULL DEFAULT false,
    notifications_enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days'
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS email_links (
    token_hash text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    purpose text NOT NULL CHECK (purpose IN ('verify', 'setup', 'reset')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now() + interval '1 day'
);
CREATE INDEX IF NOT EXISTS email_links_user ON email_links (user_id, purpose);

CREATE TABLE IF NOT EXISTS events (
    id text PRIMARY KEY,
    slug text NOT NULL UNIQUE,
    organizer_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    title text NOT NULL,
    description text NOT NULL,
    starts_at timestamptz NOT NULL,
    location text NOT NULL,
    capacity integer NOT NULL CHECK (capacity > 0),
    price_type text NOT NULL CHECK (price_type IN ('free', 'paid')),
    questions jsonb NOT NULL,
    published boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS events_organizer ON events (organizer_id);

CREATE TABLE IF NOT EXISTS tickets (
    id text PRIMARY KEY,
    event_id text NOT NULL REFERENCES events ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    code text NOT NULL UNIQUE,
    qr_token text NOT NULL UNIQUE,
    guest_token text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'cancelled')),
    holder_name text NOT NULL,
    holder_email text NOT NULL,
    category text NOT NULL,
    answers jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    checked_in_at timestamptz,
    checked_in_by text REFERENCES users ON DELETE SET NULL
);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS answer_labels jsonb NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX IF NOT EXISTS tickets_active_registration ON tickets (event_id, user_id)
    WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS tickets_event ON tickets (event_id);
CREATE INDEX IF NOT EXISTS tickets_user ON tickets (user_id);

CREATE TABLE IF NOT EXISTS volunteers (
    event_id text NOT NULL REFERENCES events ON DELETE CASCADE,
    user_id text NOT NULL REFERENCES users ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS volunteers_user ON volunteers (user_id);

CREATE TABLE IF NOT EXISTS scans (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id text NOT NULL REFERENCES events ON DELETE CASCADE,
    scanned_by text NOT NULL REFERENCES users ON DELETE CASCADE,
    ticket_id text REFERENCES tickets ON DELETE SET NULL,
    scanned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    result text NOT NULL CHECK (result IN ('allowed', 'already_used', 'invalid')),
    note text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS scans_recent ON scans (event_id, scanned_by, id DESC);

CREATE TABLE IF NOT EXISTS jobs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('email', 'delete_pdf')),
    payload jsonb NOT NULL,
    available_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    attempts integer NOT NULL DEFAULT 0,
    failed_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_pending ON jobs (available_at, id)
    WHERE published_at IS NULL AND failed_at IS NULL;
