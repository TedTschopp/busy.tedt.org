CREATE TABLE IF NOT EXISTS download_events (
  event_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS download_events_created ON download_events(created_at);
CREATE TABLE IF NOT EXISTS download_counts (
  app_id TEXT PRIMARY KEY,
  total INTEGER NOT NULL DEFAULT 0 CHECK(total >= 0)
);
CREATE TRIGGER IF NOT EXISTS count_new_download AFTER INSERT ON download_events
BEGIN
  INSERT INTO download_counts(app_id,total) VALUES (NEW.app_id,1)
  ON CONFLICT(app_id) DO UPDATE SET total=total+1;
END;
