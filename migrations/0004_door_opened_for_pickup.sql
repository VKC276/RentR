-- Self-pickup confirmation after Open door (mirrors door_opened_for_return).
ALTER TABLE bookings ADD COLUMN door_opened_for_pickup INTEGER NOT NULL DEFAULT 0;
