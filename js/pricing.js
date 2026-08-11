(function (global) {
  function calcDays(startDate, endDate) {
    var s = new Date(startDate + 'T00:00:00');
    var e = new Date(endDate + 'T00:00:00');
    if (isNaN(s) || isNaN(e) || e < s) return 0;
    return Math.floor((e - s) / 86400000) + 1;
  }

  function bestRule(rules, dimension, value) {
    var best = null;
    (rules || []).forEach(function (r) {
      if (r.dimension !== dimension) return;
      if (value >= Number(r.minValue)) {
        if (!best || Number(r.minValue) > Number(best.minValue)) best = r;
      }
    });
    return best;
  }

  function calculatePrice(config, padIds, startDate, endDate) {
    config = config || {};
    var days = calcDays(startDate, endDate);
    var padMap = {};
    (config.pads || []).forEach(function (p) { padMap[p.id] = p; });
    var perDay = 0;
    var lines = [];
    (padIds || []).forEach(function (id) {
      var p = padMap[id];
      if (!p) return;
      var price = Number(p.pricePerDay) || Number(config.defaultPricePerDay) || 0;
      perDay += price;
      lines.push({ padId: id, name: p.name, pricePerDay: price });
    });
    var base = perDay * days;
    var dayRule = bestRule(config.pricingRules, 'days', days);
    var padRule = bestRule(config.pricingRules, 'pads', lines.length);
    var after = base;
    if (dayRule) after = after * (1 - Number(dayRule.percentOff) / 100);
    if (padRule) after = after * (1 - Number(padRule.percentOff) / 100);
    var discount = Math.round((base - after) * 100) / 100;
    var total = Math.round(after * 100) / 100;
    return {
      days: days,
      priceBase: Math.round(base * 100) / 100,
      priceDiscount: discount,
      priceTotal: total,
      currency: config.currency || 'SEK',
      padLines: lines,
      discounts: { days: dayRule, pads: padRule }
    };
  }

  global.Pricing = { calcDays: calcDays, calculatePrice: calculatePrice };
})(window);
