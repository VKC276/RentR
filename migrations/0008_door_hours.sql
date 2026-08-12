-- Door-pass and self-service opening hours (Europe/Stockholm wall clock).
ALTER TABLE door_passes ADD COLUMN start_time TEXT NOT NULL DEFAULT '06:00';
ALTER TABLE door_passes ADD COLUMN end_time TEXT NOT NULL DEFAULT '22:00';
ALTER TABLE bookings ADD COLUMN self_service_start_time TEXT NOT NULL DEFAULT '06:00';
ALTER TABLE bookings ADD COLUMN self_service_end_time TEXT NOT NULL DEFAULT '22:00';
