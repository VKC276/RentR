/**
 * Availability for date ranges.
 */

function getAvailability_(startDate, endDate) {
  expireHolds_();
  calcDays_(startDate, endDate);
  var pads = readAllObjects_(SHEET_NAMES.Pads).filter(function (p) {
    return p.active === true || p.active === 'true';
  }).sort(function (a, b) {
    return Number(a.sortOrder) - Number(b.sortOrder);
  });

  var bookings = readAllObjects_(SHEET_NAMES.Bookings).filter(function (b) {
    return BLOCKING_STATUSES[b.status] && datesOverlap_(b.startDate, b.endDate, startDate, endDate);
  });
  var bookingPads = readAllObjects_(SHEET_NAMES.BookingPads);
  var blocked = {};

  bookings.forEach(function (b) {
    bookingPads.forEach(function (bp) {
      if (bp.bookingId === b.id) blocked[bp.padId] = true;
    });
  });

  getActiveHolds_().forEach(function (h) {
    if (!datesOverlap_(h.startDate, h.endDate, startDate, endDate)) return;
    parsePadIds_(h.padIds).forEach(function (pid) {
      blocked[pid] = true;
    });
  });

  return {
    startDate: startDate,
    endDate: endDate,
    days: calcDays_(startDate, endDate),
    pads: pads.map(function (p) {
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        pricePerDay: Number(p.pricePerDay) || Number(getConfig_('defaultPricePerDay', '150')),
        available: !blocked[p.id]
      };
    })
  };
}

function getPublicConfig_() {
  var pads = readAllObjects_(SHEET_NAMES.Pads)
    .filter(function (p) { return p.active === true || p.active === 'true'; })
    .sort(function (a, b) { return Number(a.sortOrder) - Number(b.sortOrder); })
    .map(function (p) {
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        pricePerDay: Number(p.pricePerDay) || Number(getConfig_('defaultPricePerDay', '150')),
        sortOrder: Number(p.sortOrder)
      };
    });

  var rules = getActivePricingRules_().map(function (r) {
    return {
      id: r.id,
      dimension: r.dimension,
      minValue: Number(r.minValue),
      percentOff: Number(r.percentOff),
      label: r.label
    };
  });

  return {
    appName: getConfig_('appName', 'Crashpad Booking'),
    currency: getConfig_('currency', 'SEK'),
    holdMinutes: Number(getConfig_('holdMinutes', '15')),
    defaultPricePerDay: Number(getConfig_('defaultPricePerDay', '150')),
    pagesBaseUrl: getConfig_('pagesBaseUrl', ''),
    pads: pads,
    pricingRules: rules
  };
}
