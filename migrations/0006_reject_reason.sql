-- Reason given when admin rejects a booking or change request.
ALTER TABLE bookings ADD COLUMN reject_reason TEXT NOT NULL DEFAULT '';
