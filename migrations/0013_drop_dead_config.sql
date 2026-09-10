-- Unused keys: pulse lives on the Pi, timezone is never read, appName comes from i18n.
DELETE FROM config WHERE key IN ('relayPulseMs', 'timezone', 'appName');
