-- Door pulses are ephemeral; drop accumulated history so pollDoor scans 0–1 rows.
DELETE FROM door_commands;
