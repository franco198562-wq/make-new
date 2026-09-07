CREATE TABLE IF NOT EXISTS portal_data(id INTEGER PRIMARY KEY CHECK(id=1),data TEXT NOT NULL,updated_at INTEGER NOT NULL);
INSERT OR IGNORE INTO portal_data(id,data,updated_at) VALUES(1,'{"departments":[],"books":[]}',unixepoch());
CREATE TABLE IF NOT EXISTS users(discord_id TEXT PRIMARY KEY,username TEXT NOT NULL,avatar TEXT,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,discord_id TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS role_permissions(role_id TEXT NOT NULL,permission TEXT NOT NULL,PRIMARY KEY(role_id,permission));
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);