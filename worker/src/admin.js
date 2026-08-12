import { listBookingsAdmin, purgeOldClosedBookings } from './bookings.js';
import { listPadsAdmin } from './pads.js';
import { listPricingRulesAdmin } from './pricing-admin.js';
import { listUsers } from './users.js';
import { listDoorPasses } from './door.js';
import { getAdminConfig } from './config.js';
import { kick } from './util.js';

/** Whole admin page payload in one round trip. */
export async function adminOverview(env, query, ctx) {
  kick(ctx, purgeOldClosedBookings(env.DB));
  return {
    bookings: await listBookingsAdmin(env.DB, query || {}),
    pads: await listPadsAdmin(env.DB),
    rules: await listPricingRulesAdmin(env.DB),
    users: await listUsers(env.DB),
    passes: await listDoorPasses(env.DB),
    adminConfig: await getAdminConfig(env.DB),
  };
}
