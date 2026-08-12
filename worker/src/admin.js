import { listBookingsAdmin } from './bookings.js';
import { listPadsAdmin } from './pads.js';
import { listPricingRulesAdmin } from './pricing-admin.js';
import { listUsers } from './users.js';
import { listDoorPasses } from './door.js';

/** Whole admin page payload in one round trip. */
export async function adminOverview(db, query) {
  return {
    bookings: await listBookingsAdmin(db, query || {}),
    pads: await listPadsAdmin(db),
    rules: await listPricingRulesAdmin(db),
    users: await listUsers(db),
    passes: await listDoorPasses(db),
  };
}
