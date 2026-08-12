-- Seed active pads, pricing rules, config and booking counter.
INSERT OR IGNORE INTO pads (id, name, description, price_per_day, active, sort_order) VALUES
  ('pad-01', 'Crashpad 1', 'Crashpad #1', 150, 1, 1),
  ('pad-02', 'Crashpad 2', 'Crashpad #2', 150, 1, 2),
  ('pad-03', 'Crashpad 3', 'Crashpad #3', 150, 1, 3),
  ('pad-04', 'Crashpad 4', 'Crashpad #4', 150, 1, 4),
  ('pad-05', 'Crashpad 5', 'Crashpad #5', 150, 1, 5),
  ('pad-06', 'Crashpad 6', 'Crashpad #6', 150, 1, 6),
  ('pad-07', 'Crashpad 7', 'Crashpad #7', 150, 1, 7),
  ('pad-08', 'Crashpad 8', 'Crashpad #8', 150, 1, 8),
  ('pad-09', 'Crashpad 9', 'Crashpad #9', 150, 1, 9),
  ('pad-10', 'Crashpad 10', 'Crashpad #10', 150, 1, 10),
  ('pad-11', 'Crashpad 11', 'Crashpad #11', 150, 1, 11),
  ('pad-12', 'Crashpad 12', 'Crashpad #12', 150, 1, 12);

INSERT OR IGNORE INTO pricing_rules (id, dimension, min_value, percent_off, active, label) VALUES
  ('rule-days-3', 'days', 3, 10, 1, '3+ dygn'),
  ('rule-days-7', 'days', 7, 20, 1, '7+ dygn'),
  ('rule-pads-2', 'pads', 2, 5, 1, '2+ pads'),
  ('rule-pads-3', 'pads', 3, 10, 1, '3+ pads');

INSERT OR IGNORE INTO config (key, value) VALUES
  ('defaultPricePerDay', '150'),
  ('currency', 'SEK'),
  ('doorCommandTtlSec', '30'),
  ('relayPulseMs', '1000'),
  ('appName', 'RentR'),
  ('timezone', 'Europe/Stockholm'),
  ('pagesBaseUrl', 'https://rent.vastervikclimbing.se'),
  ('sessionHours', '0'),
  ('magicLinkDays', '90'),
  ('closedBookingRetentionMonths', '6');

INSERT OR IGNORE INTO counters (key, value) VALUES ('bookingNumber', 0);
