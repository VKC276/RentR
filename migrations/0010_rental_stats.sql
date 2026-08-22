-- Anonymized rental facts that survive GDPR booking deletion.
-- No guest name, email, phone, or notes — only equipment usage and income.
CREATE TABLE IF NOT EXISTS rental_stats (
  id TEXT PRIMARY KEY,
  booking_ref TEXT NOT NULL,
  pad_id TEXT NOT NULL,
  pad_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  days INTEGER NOT NULL,
  amount REAL NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  recorded_at TEXT NOT NULL,
  UNIQUE(booking_ref, pad_id)
);

CREATE INDEX IF NOT EXISTS idx_rental_stats_dates ON rental_stats(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_rental_stats_pad ON rental_stats(pad_id);
CREATE INDEX IF NOT EXISTS idx_rental_stats_ym ON rental_stats(year, month);
CREATE INDEX IF NOT EXISTS idx_rental_stats_ref ON rental_stats(booking_ref);
