(function (global) {
  var STR = {
    sv: {
      appName: 'RentR',
      book: 'Boka',
      find: 'Hitta bokning',
      admin: 'Admin',
      start: 'Startdatum',
      end: 'Slutdatum',
      check: 'Visa lediga',
      pickStart: 'Klicka på ditt startdatum i kalendern',
      pickEnd: 'Klicka nu på ditt slutdatum',
      datesChosen: 'Dina datum är valda',
      sameDayHint: 'Vill du bara hyra en dag? Klicka på samma datum två gånger.',
      pickAgainHint: 'Klicka på ett nytt datum för att välja om.',
      stepOfTwo: 'Steg {{n}} av 2',
      endPending: 'Inte valt än',
      dayUnitOne: 'dygn',
      dayUnitMany: 'dygn',
      fullDaysNote: 'Både start- och slutdatum räknas som hela dygn – fredag till söndag blir 3 dygn.',
      singleDayNote: 'Samma start- och slutdatum betyder att du hyr i ett dygn.',
      priceAfterPads: 'Priset visas när du valt utrustning.',
      clearDates: 'Rensa datum',
      legendFree: 'Ledig',
      legendTaken: 'Upptagen',
      noneAvailable: 'Ingen utrustning är ledig hela perioden. Välj andra datum.',
      available: 'Ledig utrustning',
      unavailable: 'Upptagen',
      perDay: '/dygn',
      continue: 'Fortsätt',
      firstName: 'Förnamn',
      lastName: 'Efternamn',
      email: 'E-post',
      phone: 'Telefon',
      notes: 'Meddelande',
      details: 'Dina uppgifter',
      submit: 'Skicka förfrågan',
      back: 'Tillbaka',
      tryAgainSoon: 'Systemet är upptaget just nu. Försök igen om en stund.',
      slowSubmit: 'Servern svarar ovanligt långsamt och vi vet inte om bokningen hann gå igenom. Kolla din e-post om en minut — kom det en bekräftelse är du bokad. Skicka annars förfrågan igen.',
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
      cancelBooking: 'Avboka bokning',
      confirmCancel: 'Vill du avboka bokningen? Den avbokas direkt och kan inte återskapas.',
      cancelDone: 'Bokningen är avbokad. En bekräftelse har skickats till din e-post.',
      status_Requested: 'Förfrågan',
      status_Approved: 'Godkänd',
      status_ChangePending: 'Ändring väntar',
      status_CancelPending: 'Avbokning väntar',
      status_HandedOut: 'Utlämnad',
      status_Returned: 'Återlämnad',
      status_Cancelled: 'Avbokad',
      status_Rejected: 'Avslagen',
      loading: 'Laddar…',
      error: 'Något gick fel',
      selectPads: 'Välj utrustning att boka',
      doorValid: 'Giltig',
      doorValidHint: 'Start- och slutdatum räknas som hela dygn. Sidan visar endast Open door.',
      doorNotValidToday: 'Open door är inte tillgänglig idag (utanför giltighetsperioden).',
      doorOpened: 'Dörrkommando skickat',
      busyConfig: 'Hämtar priser och utrustning…',
      busyCalendar: 'Hämtar kalendern…',
      busyAvailability: 'Kontrollerar bokningar…',
      busySubmit: 'Skickar din förfrågan…',
      busyLookup: 'Söker din bokning…',
      busyBooking: 'Hämtar bokningen…',
      busyChange: 'Skickar ändringsförfrågan…',
      busyCancel: 'Avbokar…',
      busyDoor: 'Öppnar dörren…',
      busyReturn: 'Registrerar återlämning…',
      busyRetry: 'Google svarade inte — försöker igen…'
    },
    en: {
      appName: 'RentR',
      book: 'Book',
      find: 'Find booking',
      admin: 'Admin',
      start: 'Start date',
      end: 'End date',
      check: 'Show availability',
      pickStart: 'Click your start date in the calendar',
      pickEnd: 'Now click your end date',
      datesChosen: 'Your dates are set',
      sameDayHint: 'Renting for a single day? Click the same date twice.',
      pickAgainHint: 'Click a new date to start over.',
      stepOfTwo: 'Step {{n}} of 2',
      endPending: 'Not picked yet',
      dayUnitOne: 'day',
      dayUnitMany: 'days',
      fullDaysNote: 'Start and end dates both count as full days – Friday to Sunday is 3 days.',
      singleDayNote: 'The same start and end date means a one-day rental.',
      priceAfterPads: 'The price appears once you have picked your equipment.',
      clearDates: 'Clear dates',
      legendFree: 'Free',
      legendTaken: 'Booked',
      noneAvailable: 'No equipment is free for the whole period. Please pick other dates.',
      available: 'Available equipment',
      unavailable: 'Unavailable',
      perDay: '/day',
      continue: 'Continue',
      firstName: 'First name',
      lastName: 'Last name',
      email: 'Email',
      phone: 'Phone',
      notes: 'Message',
      details: 'Your details',
      submit: 'Send request',
      back: 'Back',
      tryAgainSoon: 'The system is busy right now. Please try again in a moment.',
      slowSubmit: 'The server is unusually slow and we cannot tell whether your booking went through. Check your email in a minute — if a confirmation arrived, you are booked. Otherwise send the request again.',
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
      cancelBooking: 'Cancel booking',
      confirmCancel: 'Cancel this booking? It is cancelled right away and cannot be restored.',
      cancelDone: 'The booking is cancelled. A confirmation has been sent to your email.',
      status_Requested: 'Requested',
      status_Approved: 'Approved',
      status_ChangePending: 'Change pending',
      status_CancelPending: 'Cancellation pending',
      status_HandedOut: 'Handed out',
      status_Returned: 'Returned',
      status_Cancelled: 'Cancelled',
      status_Rejected: 'Rejected',
      loading: 'Loading…',
      error: 'Something went wrong',
      selectPads: 'Select equipment to book',
      doorValid: 'Valid',
      doorValidHint: 'Start and end dates each count as a full day. This page only shows Open door.',
      doorNotValidToday: 'Open door is not available today (outside the validity period).',
      doorOpened: 'Door command sent',
      busyConfig: 'Loading prices and equipment…',
      busyCalendar: 'Loading the calendar…',
      busyAvailability: 'Checking bookings…',
      busySubmit: 'Sending your request…',
      busyLookup: 'Searching for your booking…',
      busyBooking: 'Loading the booking…',
      busyChange: 'Sending change request…',
      busyCancel: 'Cancelling…',
      busyDoor: 'Opening the door…',
      busyReturn: 'Registering the return…',
      busyRetry: 'Google did not respond — retrying…'
    },
    de: {
      appName: 'RentR',
      book: 'Buchen',
      find: 'Buchung finden',
      admin: 'Admin',
      start: 'Startdatum',
      end: 'Enddatum',
      check: 'Verfügbarkeit',
      pickStart: 'Klicken Sie im Kalender auf Ihr Startdatum',
      pickEnd: 'Klicken Sie jetzt auf Ihr Enddatum',
      datesChosen: 'Ihre Daten stehen fest',
      sameDayHint: 'Nur einen Tag mieten? Klicken Sie zweimal auf dasselbe Datum.',
      pickAgainHint: 'Für eine neue Auswahl auf ein anderes Datum klicken.',
      stepOfTwo: 'Schritt {{n}} von 2',
      endPending: 'Noch nicht gewählt',
      dayUnitOne: 'Tag',
      dayUnitMany: 'Tage',
      fullDaysNote: 'Start- und Enddatum zählen beide als volle Tage – Freitag bis Sonntag sind 3 Tage.',
      singleDayNote: 'Gleiches Start- und Enddatum bedeutet eine Miete für einen Tag.',
      priceAfterPads: 'Der Preis erscheint, sobald Sie Ihre Ausrüstung gewählt haben.',
      clearDates: 'Daten zurücksetzen',
      legendFree: 'Frei',
      legendTaken: 'Belegt',
      noneAvailable: 'Keine Ausrüstung ist im gesamten Zeitraum frei. Bitte andere Daten wählen.',
      available: 'Verfügbare Ausrüstung',
      unavailable: 'Belegt',
      perDay: '/Tag',
      continue: 'Weiter',
      firstName: 'Vorname',
      lastName: 'Nachname',
      email: 'E-Mail',
      phone: 'Telefon',
      notes: 'Nachricht',
      details: 'Ihre Angaben',
      submit: 'Anfrage senden',
      back: 'Zurück',
      tryAgainSoon: 'Das System ist gerade ausgelastet. Bitte versuchen Sie es in einem Moment erneut.',
      slowSubmit: 'Der Server antwortet ungewöhnlich langsam und wir wissen nicht, ob Ihre Buchung durchging. Prüfen Sie in einer Minute Ihre E-Mail — kam eine Bestätigung, sind Sie gebucht. Andernfalls senden Sie die Anfrage erneut.',
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
      cancelBooking: 'Buchung stornieren',
      confirmCancel: 'Buchung wirklich stornieren? Sie wird sofort storniert und kann nicht wiederhergestellt werden.',
      cancelDone: 'Die Buchung ist storniert. Eine Bestätigung wurde an Ihre E-Mail gesendet.',
      status_Requested: 'Angefragt',
      status_Approved: 'Genehmigt',
      status_ChangePending: 'Änderung ausstehend',
      status_CancelPending: 'Storno ausstehend',
      status_HandedOut: 'Ausgegeben',
      status_Returned: 'Zurückgegeben',
      status_Cancelled: 'Storniert',
      status_Rejected: 'Abgelehnt',
      loading: 'Lädt…',
      error: 'Etwas ist schiefgelaufen',
      selectPads: 'Ausrüstung zum Buchen wählen',
      doorValid: 'Gültig',
      doorValidHint: 'Start- und Enddatum zählen als volle Tage. Diese Seite zeigt nur Open door.',
      doorNotValidToday: 'Open door ist heute nicht verfügbar (außerhalb der Gültigkeit).',
      doorOpened: 'Türbefehl gesendet',
      busyConfig: 'Preise und Ausrüstung werden geladen…',
      busyCalendar: 'Kalender wird geladen…',
      busyAvailability: 'Buchungen werden geprüft…',
      busySubmit: 'Ihre Anfrage wird gesendet…',
      busyLookup: 'Ihre Buchung wird gesucht…',
      busyBooking: 'Buchung wird geladen…',
      busyChange: 'Änderungsanfrage wird gesendet…',
      busyCancel: 'Wird storniert…',
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

  /**
   * Statuses are stored as English keys. The guest should never see the key, so
   * an unknown one falls back to Swedish and only then to the raw value.
   */
  function statusLabel(status) {
    var key = 'status_' + status;
    var dict = STR[locale] || STR.sv;
    return dict[key] || STR.sv[key] || status;
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

  global.I18n = {
    t: t,
    statusLabel: statusLabel,
    setLocale: setLocale,
    getLocale: getLocale,
    renderLangSwitcher: renderLangSwitcher,
    STR: STR
  };
})(window);
