/**
 * Server-side i18n helpers (status labels for mail/admin).
 */

function statusLabel_(status, locale) {
  var map = {
    sv: {
      Requested: 'Förfrågan',
      Approved: 'Godkänd',
      Rejected: 'Avslagen',
      ChangePending: 'Ändring väntar',
      CancelPending: 'Avbokning väntar',
      HandedOut: 'Utlämnad',
      Returned: 'Återlämnad',
      Cancelled: 'Avbokad'
    },
    en: {
      Requested: 'Requested',
      Approved: 'Approved',
      Rejected: 'Rejected',
      ChangePending: 'Change pending',
      CancelPending: 'Cancel pending',
      HandedOut: 'Handed out',
      Returned: 'Returned',
      Cancelled: 'Cancelled'
    },
    de: {
      Requested: 'Angefragt',
      Approved: 'Genehmigt',
      Rejected: 'Abgelehnt',
      ChangePending: 'Änderung ausstehend',
      CancelPending: 'Storno ausstehend',
      HandedOut: 'Ausgegeben',
      Returned: 'Zurückgegeben',
      Cancelled: 'Storniert'
    }
  };
  var dict = map[locale] || map.sv;
  return dict[status] || status;
}
