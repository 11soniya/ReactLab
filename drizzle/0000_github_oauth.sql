CREATE TABLE github_oauth_states (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, browser_hash TEXT NOT NULL, payload TEXT NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX github_oauth_expiry ON github_oauth_states (expires_at);
--> statement-breakpoint
CREATE TABLE github_sessions (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, github_id TEXT NOT NULL, token_cipher TEXT NOT NULL, expires_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX github_sessions_owner ON github_sessions (owner_id);
--> statement-breakpoint
CREATE TABLE github_accounts (owner_id TEXT PRIMARY KEY NOT NULL, connection_json TEXT NOT NULL);
