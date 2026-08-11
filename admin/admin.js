(function () {
  var session = localStorage.getItem('adminSession') || '';
  var bookings = [];
  var selectedId = null;

  function $(id) { return document.getElementById(id); }

  /**
   * Statuses are stored and filtered on as English keys; this is the only place
   * that turns one into the Swedish text the admin reads. CancelPending can no
   * longer arise — a guest cancellation is immediate — but rows from the old
   * flow may still carry it.
   */
  var STATUS_LABELS = {
    Requested: 'Förfrågan',
    Approved: 'Godkänd',
    ChangePending: 'Ändring väntar',
    CancelPending: 'Avbokning väntar',
    HandedOut: 'Utlämnad',
    Returned: 'Återlämnad',
    Cancelled: 'Avbokad',
    Rejected: 'Avslagen'
  };

  function statusLabel(status) {
    return STATUS_LABELS[status] || status;
  }

  /** Only statuses a booking can still reach are worth filtering on. */
  var FILTER_STATUSES = ['Requested', 'Approved', 'ChangePending', 'HandedOut', 'Returned', 'Cancelled', 'Rejected'];

  var BUSY = {
    login: 'Loggar in…',
    logout: 'Loggar ut…',
    me: 'Kontrollerar inloggning…',
    adminOverview: 'Hämtar bokningar…',
    listBookings: 'Hämtar bokningar…',
    adminUpdateBooking: 'Sparar bokningen…',
    availablePadsForBooking: 'Kontrollerar ledig utrustning…',
    listPads: 'Hämtar utrustning…',
    updatePad: 'Sparar pris…',
    listPricingRules: 'Hämtar rabattregler…',
    savePricingRule: 'Sparar rabattregel…',
    deletePricingRule: 'Tar bort rabattregel…',
    listUsers: 'Hämtar användare…',
    createUser: 'Skapar användare…',
    deleteUser: 'Tar bort användare…',
    listDoorPasses: 'Hämtar dörrlänkar…',
    createDoorPass: 'Skickar dörrlänk…',
    revokeDoorPass: 'Spärrar dörrlänk…'
  };

  function api(action, payload, btn) {
    var label = BUSY[action] || 'Arbetar…';
    var call = Api.call(action, payload || {}, session);
    return btn ? Status.button(btn, label, call) : Status.during(label, call);
  }

  function showLogin(show) {
    if (show) closeDetail();
    $('loginPanel').hidden = !show;
    $('app').hidden = show;
    $('nav').hidden = show;
  }

  function requireSession() {
    if (!session) {
      showLogin(true);
      return false;
    }
    return true;
  }

  $('btnLogin').onclick = function () {
    $('loginErr').hidden = true;
    api('login', {
      email: $('email').value.trim(),
      password: $('password').value
    }, $('btnLogin')).then(function (res) {
      session = res.session.token;
      localStorage.setItem('adminSession', session);
      showLogin(false);
      refreshAll();
    }).catch(function (err) {
      $('loginErr').hidden = false;
      $('loginErr').textContent = err.message || 'Login misslyckades';
    });
  };

  $('logout').onclick = function (e) {
    e.preventDefault();
    api('logout', {}).catch(function () {});
    session = '';
    localStorage.removeItem('adminSession');
    showLogin(true);
  };

  /**
   * One request for the whole page. Five separate calls cost five redirect
   * round trips, which dwarfs the time Apps Script spends producing the data.
   */
  function refreshAll() {
    return api('adminOverview', {
      bookingNumber: $('searchNo').value.trim(),
      status: $('filterStatus').value
    }).then(function (res) {
      renderBookings(res.bookings || []);
      renderPads(res.pads || []);
      renderRules(res.rules || []);
      renderUsers(res.users || []);
      renderPasses(res.passes || []);
    }).catch(function (e) {
      if (e.status === 401) showLogin(true);
      else alert(e.message);
    });
  }

  function loadBookings() {
    return api('listBookings', {
      bookingNumber: $('searchNo').value.trim(),
      status: $('filterStatus').value
    }).then(function (res) {
      renderBookings(res.bookings || []);
    }).catch(function (e) {
      if (e.status === 401) showLogin(true);
      else alert(e.message);
    });
  }

  function renderBookings(list) {
    bookings = list;
    var wrap = $('bookingsList');
    wrap.innerHTML = bookings.map(function (b) {
      return '<button type="button" class="booking-row" data-id="' + b.id + '">' +
        '<span class="b-no">' + escapeHtml(b.bookingNumber) + '</span>' +
        '<span class="b-guest">' + escapeHtml(b.firstName + ' ' + b.lastName) +
          '<span class="sub">' + escapeHtml(b.email) + '</span></span>' +
        '<span class="b-period">' + b.startDate + ' – ' + b.endDate +
          '<span class="sub">' + b.days + ' dygn</span></span>' +
        '<span class="b-status"><span class="badge">' + escapeHtml(statusLabel(b.status)) + '</span></span>' +
        '<span class="b-price">' + b.priceTotal + ' SEK' +
          '<span class="sub"><span class="badge ' + (b.paid ? 'paid' : 'unpaid') + '">' +
          (b.paid ? 'Betald' : 'Obetald') + '</span></span></span>' +
        '</button>';
    }).join('');
    $('bookingsEmpty').hidden = bookings.length > 0;
    wrap.querySelectorAll('.booking-row').forEach(function (row) {
      row.onclick = function () { openDetail(row.getAttribute('data-id')); };
    });
  }

  function closeDetail() {
    selectedId = null;
    $('detailModal').hidden = true;
    document.body.classList.remove('modal-open');
  }

  document.querySelectorAll('[data-close-detail]').forEach(function (el) {
    el.onclick = closeDetail;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('detailModal').hidden) closeDetail();
  });

  function openDetail(id) {
    selectedId = id;
    var b = bookings.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    $('detailModal').hidden = false;
    document.body.classList.add('modal-open');
    $('detailTitle').textContent = b.bookingNumber;
    var html = '';
    html += '<p><strong>' + b.bookingNumber + '</strong> — ' + escapeHtml(statusLabel(b.status)) + '</p>';
    html += '<p>' + escapeHtml(b.firstName + ' ' + b.lastName) + ' · ' + escapeHtml(b.phone) + ' · ' + escapeHtml(b.email) + '</p>';
    html += '<p>Utrustning: ' + escapeHtml((b.pads || []).map(function (p) { return p.name; }).join(', ')) + '</p>';
    html += '<p>' + b.startDate + ' – ' + b.endDate + ' (' + b.days + ' dygn inkl.)</p>';
    html += '<p>Summa: <strong>' + b.priceTotal + ' SEK</strong></p>';
    html += '<div class="check-row">';
    html += '<label class="check"><input type="checkbox" id="flagPickup"' + (b.allowSelfPickup ? ' checked' : '') + '> Tillåt egen hämtning</label>';
    html += '<label class="check"><input type="checkbox" id="flagReturn"' + (b.allowSelfReturn ? ' checked' : '') + '> Tillåt egen återlämning</label>';
    html += '</div>';
    html += '<div class="actions">';
    if (b.status === 'Requested' || b.status === 'ChangePending') {
      html += '<button type="button" id="actApprove">Godkänn</button>';
      html += '<button type="button" class="ghost" id="actReject">Avslå</button>';
    }
    if (b.status === 'Approved') {
      html += '<button type="button" class="warn" id="actHandOut">Lämna ut</button>';
    }
    if (b.status === 'HandedOut') {
      html += '<button type="button" id="actReturn">Återlämnad</button>';
    }
    html += '<button type="button" class="secondary" id="actPaid">' + (b.paid ? 'Markera obetald' : 'Betald') + '</button>';
    html += '<button type="button" class="ghost" id="actFlags">Spara flaggor</button>';
    html += '</div>';
    html += '<div id="handOutBox" hidden style="margin-top:1rem;padding:1rem;border:1px solid var(--line);border-radius:12px;"></div>';
    html += '<p class="err" id="detailErr" hidden></p>';
    $('detail').innerHTML = html;

    // 'op', not 'action': Api.call reserves 'action' for the route name and
    // would overwrite it, leaving the server with nothing to dispatch on.
    function act(op, extra, btn) {
      var payload = Object.assign({ op: op, bookingId: b.id }, extra || {});
      api('adminUpdateBooking', payload, btn).then(function () {
        return loadBookings();
      }).then(function () {
        openDetail(b.id);
      }).catch(function (e) {
        $('detailErr').hidden = false;
        $('detailErr').textContent = e.message;
      });
    }

    /** The button reports its own progress, which the status banner cannot do
     *  from behind the dialog. `extra` is read on click so it sees current
     *  checkbox values. */
    function onAct(id, op, extra) {
      var btn = $(id);
      if (!btn) return;
      btn.onclick = function () {
        act(op, typeof extra === 'function' ? extra() : extra, btn);
      };
    }

    onAct('actApprove', 'approve');
    onAct('actReject', 'reject');
    onAct('actReturn', 'return');
    onAct('actPaid', 'setPaid', { paid: !b.paid });
    onAct('actFlags', 'setFlags', function () {
      return {
        allowSelfPickup: $('flagPickup').checked,
        allowSelfReturn: $('flagReturn').checked
      };
    });
    if ($('actHandOut')) {
      $('actHandOut').onclick = function () {
        var box = $('handOutBox');
        box.hidden = false;
        box.innerHTML = '<p><strong>Lämna ut</strong></p><p id="hoPads">Laddar ledig utrustning…</p>';
        api('availablePadsForBooking', { bookingId: b.id }, $('actHandOut')).then(function (res) {
          var pads = res.pads || [];
          var opts = pads.map(function (p) {
            var sel = (b.padIds || [])[0] === p.id ? ' selected' : '';
            return '<option value="' + p.id + '"' + sel + '>' + escapeHtml(p.name) + '</option>';
          }).join('');
          box.innerHTML =
            '<p>Detaljer: ' + escapeHtml(b.firstName + ' ' + b.lastName) + ', ' + escapeHtml((b.pads || []).map(function (p) { return p.name; }).join(', ')) +
            ', ' + b.startDate + '–' + b.endDate + '</p>' +
            '<label>Utrustning</label><select id="hoSelect">' + opts + '</select>' +
            '<div class="actions"><button type="button" id="hoOk">OK</button>' +
            '<button type="button" class="ghost" id="hoChange">Ändra &amp; lämna ut</button></div>';
          onAct('hoOk', 'handOut', function () { return { padId: $('hoSelect').value }; });
          onAct('hoChange', 'handOut', function () { return { padId: $('hoSelect').value }; });
        });
      };
    }
  }

  function renderPads(pads) {
    var html = '<div class="table-scroll"><table class="table"><thead><tr><th>Namn</th><th>Pris/dygn</th><th></th></tr></thead><tbody>';
    pads.forEach(function (p) {
      html += '<tr><td>' + escapeHtml(p.name) + '</td><td><input data-pad="' + p.id + '" type="number" value="' + p.pricePerDay + '" style="max-width:120px" /></td>' +
        '<td><button type="button" class="secondary" data-save-pad="' + p.id + '">Spara</button></td></tr>';
    });
    html += '</tbody></table></div>';
    $('padsList').innerHTML = html;
    $('padsList').querySelectorAll('[data-save-pad]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-save-pad');
        var input = $('padsList').querySelector('[data-pad="' + id + '"]');
        api('updatePad', { padId: id, pricePerDay: Number(input.value) }, btn).then(refreshAll);
      };
    });
  }

  function renderRules(rules) {
    var html = '<div class="table-scroll"><table class="table"><thead><tr><th>Dim</th><th>Min</th><th>%</th><th>Label</th><th></th></tr></thead><tbody>';
    rules.forEach(function (r) {
      html += '<tr><td>' + r.dimension + '</td><td>' + r.minValue + '</td><td>' + r.percentOff + '</td><td>' + escapeHtml(r.label) +
        '</td><td><button type="button" class="ghost" data-del-rule="' + r.id + '">Ta bort</button></td></tr>';
    });
    html += '</tbody></table></div>';
    $('rulesList').innerHTML = html;
    $('rulesList').querySelectorAll('[data-del-rule]').forEach(function (btn) {
      btn.onclick = function () {
        api('deletePricingRule', { id: btn.getAttribute('data-del-rule') }, btn).then(refreshAll);
      };
    });
  }

  $('btnAddRule').onclick = function () {
    api('savePricingRule', {
      dimension: $('ruleDim').value,
      minValue: Number($('ruleMin').value),
      percentOff: Number($('rulePct').value),
      label: $('ruleLabel').value,
      active: true
    }, $('btnAddRule')).then(refreshAll);
  };

  function renderUsers(users) {
    var html = '<div class="table-scroll"><table class="table"><thead><tr><th>Namn</th><th>E-post</th><th>Aktiv</th><th></th></tr></thead><tbody>';
    users.forEach(function (u) {
      html += '<tr><td>' + escapeHtml(u.firstName + ' ' + u.lastName) + '</td><td>' + escapeHtml(u.email) + '</td><td>' + (u.active ? 'Ja' : 'Nej') +
        '</td><td><button type="button" class="ghost" data-del-user="' + u.id + '">Radera</button></td></tr>';
    });
    html += '</tbody></table></div>';
    $('usersList').innerHTML = html;
    $('usersList').querySelectorAll('[data-del-user]').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('Radera användare?')) return;
        api('deleteUser', { userId: btn.getAttribute('data-del-user') }, btn).then(refreshAll).catch(function (e) {
          $('userErr').hidden = false;
          $('userErr').textContent = e.message;
        });
      };
    });
  }

  $('btnCreateUser').onclick = function () {
    $('userErr').hidden = true;
    api('createUser', {
      firstName: $('uFirst').value.trim(),
      lastName: $('uLast').value.trim(),
      email: $('uEmail').value.trim(),
      password: $('uPass').value
    }, $('btnCreateUser')).then(function () {
      $('uFirst').value = $('uLast').value = $('uEmail').value = $('uPass').value = '';
      return refreshAll();
    }).catch(function (e) {
      $('userErr').hidden = false;
      $('userErr').textContent = e.message;
    });
  };

  function renderPasses(passes) {
    var html = '<div class="table-scroll"><table class="table"><thead><tr><th>Namn</th><th>E-post</th><th>Giltig</th><th>Status</th><th></th></tr></thead><tbody>';
    passes.forEach(function (p) {
      html += '<tr><td>' + escapeHtml(p.recipientName) + '</td><td>' + escapeHtml(p.recipientEmail) + '</td>' +
        '<td>' + p.startDate + ' – ' + p.endDate + '</td>' +
        '<td>' + (p.revoked ? 'Återkallad' : (p.validToday ? 'Gäller idag' : 'Utanför period')) + '</td>' +
        '<td>' + (p.revoked ? '' : '<button type="button" class="ghost" data-revoke-pass="' + p.id + '">Återkalla</button>') + '</td></tr>';
    });
    html += '</tbody></table></div>';
    $('dpList').innerHTML = html;
    $('dpList').querySelectorAll('[data-revoke-pass]').forEach(function (btn) {
      btn.onclick = function () {
        if (!confirm('Återkalla dörrlänk?')) return;
        api('revokeDoorPass', { passId: btn.getAttribute('data-revoke-pass') }, btn).then(refreshAll);
      };
    });
  }

  $('btnSendDoorPass').onclick = function () {
    $('dpOk').hidden = true;
    $('dpErr').hidden = true;
    api('createDoorPass', {
      recipientName: $('dpName').value.trim(),
      recipientEmail: $('dpEmail').value.trim(),
      startDate: $('dpStart').value,
      endDate: $('dpEnd').value,
      locale: $('dpLocale').value
    }, $('btnSendDoorPass')).then(function (res) {
      $('dpOk').hidden = false;
      $('dpOk').textContent = 'Mejl skickat till ' + res.sentTo;
      $('dpName').value = $('dpEmail').value = '';
      return refreshAll();
    }).catch(function (e) {
      $('dpErr').hidden = false;
      $('dpErr').textContent = e.message;
    });
  };

  function fillStatusFilter() {
    var select = $('filterStatus');
    FILTER_STATUSES.forEach(function (status) {
      var opt = document.createElement('option');
      opt.value = status;
      opt.textContent = statusLabel(status);
      select.appendChild(opt);
    });
  }

  $('btnReload').onclick = loadBookings;
  $('searchNo').onchange = loadBookings;
  $('filterStatus').onchange = loadBookings;

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  fillStatusFilter();

  if (session) {
    // adminOverview already rejects an invalid session, so no separate 'me' call.
    showLogin(false);
    refreshAll();
  } else {
    showLogin(true);
  }
})();
