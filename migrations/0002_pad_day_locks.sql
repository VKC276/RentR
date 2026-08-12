-- Per-day pad locks: UNIQUE(pad_id, day) makes double-booking impossible
-- even under concurrent submits. Calendar/availability read from this table.
CREATE TABLE IF NOT EXISTS pad_day_locks (
  pad_id TEXT NOT NULL,
  day TEXT NOT NULL,
  booking_id TEXT NOT NULL,
  PRIMARY KEY (pad_id, day),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pad_day_locks_booking ON pad_day_locks(booking_id);
CREATE INDEX IF NOT EXISTS idx_pad_day_locks_day ON pad_day_locks(day);
