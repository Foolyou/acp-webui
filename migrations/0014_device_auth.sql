CREATE TABLE device_pairing_requests (
  code TEXT PRIMARY KEY NOT NULL,
  client_ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  approved_at TEXT,
  consumed_at TEXT
);

CREATE INDEX idx_device_pairing_requests_pending
ON device_pairing_requests(approved_at, consumed_at, expires_at);

CREATE TABLE approved_devices (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  pairing_code TEXT,
  client_ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  FOREIGN KEY(pairing_code) REFERENCES device_pairing_requests(code) ON DELETE SET NULL
);

CREATE INDEX idx_approved_devices_token_hash
ON approved_devices(token_hash);

CREATE INDEX idx_approved_devices_expires_at
ON approved_devices(expires_at);
