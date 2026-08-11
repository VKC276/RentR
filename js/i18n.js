(function (global) {
  var STR = {
    sv: {
      appName: 'Crashpad-bokning',
      book: 'Boka',
      find: 'Hitta bokning',
      admin: 'Admin',
      start: 'Startdatum',
      end: 'Slutdatum',
      check: 'Visa lediga',
      pickStart: 'Klicka på ditt startdatum i kalendern.',
      pickEnd: 'Klicka på ditt slutdatum.',
      clearDates: 'Rensa datum',
      legendFree: 'Ledig',
      legendTaken: 'Upptagen',
      noneAvailable: 'Ingen crashpad är ledig hela perioden. Välj andra datum.',
      available: 'Lediga crashpads',
      unavailable: 'Upptagen',
      continue: 'Fortsätt',
      firstName: 'Förnamn',
      lastName: 'Efternamn',
      email: 'E-post',
      phone: 'Telefon',
      notes: 'Meddelande',
      submit: 'Skicka förfrågan',
      holdLeft: 'Hold kvar',
      daysExplain: '{{start}} – {{end}} = {{days}} dygn (start- och slutdatum räknas som hela dygn)',
      base: 'Grundpris',
      discount: 'Rabatt',
      total: 'Totalt att betala',
      payNote: 'Betalning sker enligt överenskommelse / på plats.',
      thanks: 'Tack! Din förfrågan är skickad.',
      bookingNo: 'Bokningsnummer',
      manage: 'Hantera bokning',
      lookupTitle: 'Hitta din bokning',
      lookupBtn: 'Sök',
      openDoor: 'Open door',
      confirmReturn: 'Bekräfta återlämning',
      status: 'Status',
      requestChange: 'Begär ändring',
      requestCancel: 'Begär avbokning',
      loading: 'Laddar…',
      error: 'Något gick fel',
      selectPads: 'Välj en eller flera crashpads',
      holdExpired: 'Hold utgången — välj om',
      doorValid: 'Giltig',
      doorValidHint: 'Start- och slutdatum räknas som hela dygn. Sidan visar endast Open door.',
      doorNotValidToday: 'Open door är inte tillgänglig idag (utanför giltighetsperioden).',
      doorOpened: 'Dörrkommando skickat',
      busyConfig: 'Hämtar priser och crashpads…',
      busyCalendar: 'Hämtar kalendern…',
      busyAvailability: 'Kontrollerar bokningar…',
      busyHold: 'Reserverar crashpads…',
      busyRelease: 'Släpper reservationen…',
      busySubmit: 'Skickar din förfrågan…',
      busyLookup: 'Söker din bokning…',
      busyBooking: 'Hämtar bokningen…',
      busyChange: 'Skickar ändringsförfrågan…',
      busyCancel: 'Skickar avbokning…',
      busyDoor: 'Öppnar dörren…',
      busyReturn: 'Registrerar återlämning…',
      busyRetry: 'Google svarade inte — försöker igen…'
    },
    en: {
      appName: 'Crashpad booking',
      book: 'Book',
      find: 'Find booking',
      admin: 'Admin',
      start: 'Start date',
      end: 'End date',
      check: 'Show availability',
      pickStart: 'Click your start date in the calendar.',
      pickEnd: 'Click your end date.',
      clearDates: 'Clear dates',
      legendFree: 'Free',
      legendTaken: 'Booked',
      noneAvailable: 'No crashpad is free for the whole period. Please pick other dates.',
      available: 'Available crashpads',
      unavailable: 'Unavailable',
      continue: 'Continue',
      firstName: 'First name',
      lastName: 'Last name',
      email: 'Email',
      phone: 'Phone',
      notes: 'Message',
      submit: 'Send request',
      holdLeft: 'Hold remaining',
      daysExplain: '{{start}} – {{end}} = {{days}} days (start and end each count as a full day)',
      base: 'Base price',
      discount: 'Discount',
      total: 'Total to pay',
      payNote: 'Payment is arranged separately / on site.',
      thanks: 'Thanks! Your request was sent.',
      bookingNo: 'Booking number',
      manage: 'Manage booking',
      lookupTitle: 'Find your booking',
      lookupBtn: 'Search',
      openDoor: 'Open door',
      confirmReturn: 'Confirm return',
      status: 'Status',
      requestChange: 'Request change',
      requestCancel: 'Request cancellation',
      loading: 'Loading…',
      error: 'Something went wrong',
      selectPads: 'Select one or more crashpads',
      holdExpired: 'Hold expired — please select again',
      doorValid: 'Valid',
      doorValidHint: 'Start and end dates each count as a full day. This page only shows Open door.',
      doorNotValidToday: 'Open door is not available today (outside the validity period).',
      doorOpened: 'Door command sent',
      busyConfig: 'Loading prices and crashpads…',
      busyCalendar: 'Loading the calendar…',
      busyAvailability: 'Checking bookings…',
      busyHold: 'Reserving crashpads…',
      busyRelease: 'Releasing the reservation…',
      busySubmit: 'Sending your request…',
      busyLookup: 'Searching for your booking…',
      busyBooking: 'Loading the booking…',
      busyChange: 'Sending change request…',
      busyCancel: 'Sending cancellation…',
      busyDoor: 'Opening the door…',
      busyReturn: 'Registering the return…',
      busyRetry: 'Google did not respond — retrying…'
    },
    de: {
      appName: 'Crashpad-Buchung',
      book: 'Buchen',
      find: 'Buchung finden',
      admin: 'Admin',
      start: 'Startdatum',
      end: 'Enddatum',
      check: 'Verfügbarkeit',
      pickStart: 'Klicken Sie im Kalender auf Ihr Startdatum.',
      pickEnd: 'Klicken Sie auf Ihr Enddatum.',
      clearDates: 'Daten zurücksetzen',
      legendFree: 'Frei',
      legendTaken: 'Belegt',
      noneAvailable: 'Kein Crashpad ist im gesamten Zeitraum frei. Bitte andere Daten wählen.',
      available: 'Verfügbare Crashpads',
      unavailable: 'Belegt',
      continue: 'Weiter',
      firstName: 'Vorname',
      lastName: 'Nachname',
      email: 'E-Mail',
      phone: 'Telefon',
      notes: 'Nachricht',
      submit: 'Anfrage senden',
      holdLeft: 'Reservierung noch',
      daysExplain: '{{start}} – {{end}} = {{days}} Tage (Start- und Enddatum zählen als volle Tage)',
      base: 'Grundpreis',
      discount: 'Rabatt',
      total: 'Gesamtbetrag',
      payNote: 'Zahlung erfolgt nach Absprache / vor Ort.',
      thanks: 'Danke! Ihre Anfrage wurde gesendet.',
      bookingNo: 'Buchungsnummer',
      manage: 'Buchung verwalten',
      lookupTitle: 'Buchung finden',
      lookupBtn: 'Suchen',
      openDoor: 'Open door',
      confirmReturn: 'Rückgabe bestätigen',
      status: 'Status',
      requestChange: 'Änderung anfragen',
      requestCancel: 'Storno anfragen',
      loading: 'Lädt…',
      error: 'Etwas ist schiefgelaufen',
      selectPads: 'Wählen Sie ein oder mehrere Crashpads',
      holdExpired: 'Reservierung abgelaufen — bitte erneut wählen',
      doorValid: 'Gültig',
      doorValidHint: 'Start- und Enddatum zählen als volle Tage. Diese Seite zeigt nur Open door.',
      doorNotValidToday: 'Open door ist heute nicht verfügbar (außerhalb der Gültigkeit).',
      doorOpened: 'Türbefehl gesendet',
      busyConfig: 'Preise und Crashpads werden geladen…',
      busyCalendar: 'Kalender wird geladen…',
      busyAvailability: 'Buchungen werden geprüft…',
      busyHold: 'Crashpads werden reserviert…',
      busyRelease: 'Reservierung wird freigegeben…',
      busySubmit: 'Ihre Anfrage wird gesendet…',
      busyLookup: 'Ihre Buchung wird gesucht…',
      busyBooking: 'Buchung wird geladen…',
      busyChange: 'Änderungsanfrage wird gesendet…',
      busyCancel: 'Stornierung wird gesendet…',
      busyDoor: 'Tür wird geöffnet…',
      busyReturn: 'Rückgabe wird erfasst…',
      busyRetry: 'Google hat nicht geantwortet — neuer Versuch…'
    }
  };

  function detect() {
    var saved = localStorage.getItem('locale');
    if (saved && STR[saved]) return saved;
    var nav = (navigator.language || 'sv').slice(0, 2).toLowerCase();
    return STR[nav] ? nav : 'sv';
  }

  var locale = detect();

  function t(key, vars) {
    var dict = STR[locale] || STR.sv;
    var text = dict[key] || STR.sv[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        text = text.split('{{' + k + '}}').join(String(vars[k]));
      });
    }
    return text;
  }

  function setLocale(next) {
    if (!STR[next]) return;
    locale = next;
    localStorage.setItem('locale', next);
    document.documentElement.lang = next;
    if (typeof global.onLocaleChange === 'function') global.onLocaleChange(next);
  }

  function getLocale() { return locale; }

  function renderLangSwitcher(el) {
    if (!el) return;
    el.innerHTML = '';
    el.className = 'lang';
    ['sv', 'en', 'de'].forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = code.toUpperCase();
      b.className = code === locale ? 'active' : '';
      b.addEventListener('click', function () { setLocale(code); });
      el.appendChild(b);
    });
  }

  global.I18n = { t: t, setLocale: setLocale, getLocale: getLocale, renderLangSwitcher: renderLangSwitcher, STR: STR };
})(window);
