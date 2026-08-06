-- LifeFlow D1 Database Schema

-- Table for storing user data that needs to be synced
CREATE TABLE IF NOT EXISTS user_data (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  content TEXT NOT NULL,  -- JSON string containing the actual data
  timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- Index for faster queries by client_id
CREATE INDEX IF NOT EXISTS idx_user_data_client_id ON user_data(client_id);

-- Index for sorting by creation date
CREATE INDEX IF NOT EXISTS idx_user_data_created_at ON user_data(created_at DESC);

-- Table for tracking sync operations and changes
CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  sync_type TEXT NOT NULL,  -- 'full', 'incremental', 'INSERT', 'UPDATE', 'DELETE'
  record_id TEXT,           -- ID of the affected record (for individual changes)
  metadata TEXT             -- Additional metadata as JSON
);

-- Index for querying sync logs by timestamp and client
CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp ON sync_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_log_client_id ON sync_log(client_id);

-- Table for storing client device information
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT,
  platform TEXT,            -- 'web', 'ios', 'android', etc.
  last_sync_timestamp TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- Insert some sample data for testing (optional)
-- INSERT INTO user_data (id, client_id, content, timestamp, created_at)
-- VALUES ('sample-1', 'client-abc', '{"type":"note","title":"Test Note","content":"Hello World"}', datetime('now'), datetime('now'));
