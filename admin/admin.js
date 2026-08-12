(function () {
  var session = localStorage.getItem('adminSession') || '';
  var bookings = [];
  var passes = [];
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
    createPad: 'Lägger till utrustning…',
    setPadActive: 'Uppdaterar utrustning…',
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
    if (show) closeAllModals();
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
      return '<button type="button" class="list-row booking" data-id="' + b.id + '">' +
        '<span class="r-no">' + escapeHtml(b.bookingNumber) + '</span>' +
        '<span class="r-guest">' + escapeHtml(b.firstName + ' ' + b.lastName) +
          '<span class="sub">' + escapeHtml(b.email) + '</span></span>' +
        '<span class="r-period">' + b.startDate + ' – ' + b.endDate +
          '<span class="sub">' + b.days + ' dygn</span></span>' +
        '<span class="r-status"><span class="badge">' + escapeHtml(statusLabel(b.status)) + '</span></span>' +
        '<span class="r-price">' + b.priceTotal + ' SEK' +
          '<span class="sub"><span class="badge ' + (b.paid ? 'paid' : 'unpaid') + '">' +
          (b.paid ? 'Betald' : 'Obetald') + '</span></span></span>' +
        '</button>';
    }).join('');
    $('bookingsEmpty').hidden = bookings.length > 0;
    wrap.querySelectorAll('.list-row').forEach(function (row) {
      row.onclick = function () { openDetail(row.getAttribute('data-id')); };
    });
  }

  function showModal(id) {
    $(id).hidden = false;
    document.body.classList.add('modal-open');
  }

  /** The page only scrolls again once no dialog is left open. */
  function hideModal(id) {
    $(id).hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) {
      document.body.classList.remove('modal-open');
    }
  }

  function closeDetail() {
    selectedId = null;
    hideModal('detailModal');
  }

  function closePass() {
    hideModal('passModal');
  }

  var MODAL_CLOSERS = { detailModal: closeDetail, passModal: closePass };

  function closeAllModals() {
    Object.keys(MODAL_CLOSERS).forEach(function (id) { MODAL_CLOSERS[id](); });
  }

  // Every dialog closes the same three ways: the cross, a click outside and
  // Escape, which takes the topmost one.
  document.querySelectorAll('[data-close-modal]').forEach(function (el) {
    var modal = el.closest('.modal');
    el.onclick = function () { MODAL_CLOSERS[modal.id](); };
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelectorAll('.modal:not([hidden])');
    if (open.length) MODAL_CLOSERS[open[open.length - 1].id]();
  });

  /** The note beside the box is where the receipt for the save belongs. */
  function flagCheckbox(id, label, checked) {
    return '<label class="check"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '> ' +
      label + ' <span class="check-note" id="' + id + 'Note"></span></label>';
  }

  function openDetail(id) {
    selectedId = id;
    var b = bookings.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    showModal('detailModal');
    $('detailTitle').textContent = b.bookingNumber;
    var html = '';
    html += '<p><strong>' + b.bookingNumber + '</strong> — ' + escapeHtml(statusLabel(b.status)) + '</p>';
    html += '<p>' + escapeHtml(b.firstName + ' ' + b.lastName) + ' · ' + escapeHtml(b.phone) + ' · ' + escapeHtml(b.email) + '</p>';
    html += '<p>Utrustning: ' + escapeHtml((b.pads || []).map(function (p) { return p.name; }).join(', ')) + '</p>';
    html += '<p>' + b.startDate + ' – ' + b.endDate + ' (' + b.days + ' dygn inkl.)</p>';
    html += '<p>Summa: <strong>' + b.priceTotal + ' SEK</strong></p>';
    html += '<div class="check-row">';
    html += flagCheckbox('flagPickup', 'Tillåt egen hämtning', b.allowSelfPickup);
    html += flagCheckbox('flagReturn', 'Tillåt egen återlämning', b.allowSelfReturn);
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
     *  from behind the dialog. `extra` is read on click so it sees whatever the
     *  dialog's own fields hold at that moment. */
    function onAct(id, op, extra) {
      var btn = $(id);
      if (!btn) return;
      btn.onclick = function () {
        act(op, typeof extra === 'function' ? extra() : extra, btn);
      };
    }

    /**
     * The checkbox is the control, so it saves itself the moment it changes —
     * the other buttons in the dialog act at once too, and a separate save
     * button only invited a state on screen that was never stored.
     *
     * It is disabled while the call is in flight, so a double click cannot
     * queue a second write and two answers cannot land in the wrong order.
     */
    function autoSaveFlag(id, field) {
      var box = $(id);
      var note = $(id + 'Note');
      var seq = 0;

      function setNote(text, cls) {
        note.className = 'check-note' + (cls ? ' ' + cls : '');
        note.textContent = text;
      }

      box.onchange = function () {
        var value = box.checked;
        var mine = ++seq;
        var payload = { op: 'setFlags', bookingId: b.id };
        payload[field] = value;
        box.disabled = true;
        setNote('Sparar…');
        $('detailErr').hidden = true;
        api('adminUpdateBooking', payload).then(function () {
          if (mine !== seq) return;
          b[field] = value;
          setNote('Sparat', 'is-ok');
          setTimeout(function () {
            if (mine === seq) setNote('');
          }, 3000);
        }).catch(function (e) {
          if (mine !== seq) return;
          // The box must never show a value the server did not accept.
          box.checked = !value;
          setNote('Ej sparat', 'is-err');
          $('detailErr').hidden = false;
          $('detailErr').textContent = e.message;
        }).then(function () {
          box.disabled = false;
        });
      };
    }

    onAct('actApprove', 'approve');
    onAct('actReject', 'reject');
    onAct('actReturn', 'return');
    onAct('actPaid', 'setPaid', { paid: !b.paid });
    autoSaveFlag('flagPickup', 'allowSelfPickup');
    autoSaveFlag('flagReturn', 'allowSelfReturn');
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

  /** The same range the server accepts, so a slip is caught before the call. */
  var MAX_PRICE_PER_DAY = 100000;
  var PRICE_ERROR = 'Pris per dygn måste vara ett tal mellan 0 och ' + MAX_PRICE_PER_DAY + '.';

  function parsePrice(value) {
    var price = Number(value);
    if (String(value).trim() === '' || !isFinite(price) || price < 0 || price > MAX_PRICE_PER_DAY) return null;
    return price;
  }

  function showPadErr(message) {
    $('padErr').hidden = !message;
    $('padErr').textContent = message || '';
  }

  function bookedCount(count) {
    return 'Uppbokad i ' + count + ' kommande bokning' + (count === 1 ? '' : 'ar');
  }

  function renderPads(pads) {
    var list = $('padsList');
    list.innerHTML = pads.map(function (p) {
      var sub = [];
      if (p.description) sub.push(escapeHtml(p.description));
      if (p.openBookings) sub.push(bookedCount(p.openBookings));
      return '<div class="pad-item' + (p.active ? '' : ' is-inactive') + '">' +
        '<div class="pad-name">' + escapeHtml(p.name) +
          (p.active ? '' : ' <span class="badge">Inaktiv</span>') +
          (sub.length ? '<span class="sub">' + sub.join(' · ') + '</span>' : '') +
        '</div>' +
        '<label class="pad-price">Pris/dygn <input data-pad="' + p.id + '" type="number" min="0" step="1" value="' +
          escapeHtml(p.pricePerDay) + '" /></label>' +
        '<div class="pad-actions">' +
          '<button type="button" class="secondary" data-save-pad="' + p.id + '">Spara</button>' +
          (p.active
            ? '<button type="button" class="ghost" data-deactivate-pad="' + p.id + '">Ta bort</button>'
            : '<button type="button" data-activate-pad="' + p.id + '">Aktivera</button>') +
        '</div>' +
        '</div>';
    }).join('');

    function padById(id) {
      return pads.filter(function (p) { return p.id === id; })[0] || {};
    }

    list.querySelectorAll('[data-save-pad]').forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute('data-save-pad');
        var price = parsePrice(list.querySelector('[data-pad="' + id + '"]').value);
        if (price === null) {
          showPadErr(PRICE_ERROR);
          return;
        }
        showPadErr('');
        api('updatePad', { padId: id, pricePerDay: price }, btn).then(refreshAll).catch(function (e) {
          showPadErr(e.message);
        });
      };
    });

    list.querySelectorAll('[data-deactivate-pad]').forEach(function (btn) {
      btn.onclick = function () {
        var p = padById(btn.getAttribute('data-deactivate-pad'));
        // Deactivating a booked resource is allowed — a pad that breaks has to
        // come off the market whether or not it is spoken for — but the admin
        // is told, since the bookings themselves keep it.
        var booked = p.openBookings ? '\n\nOBS: ' + bookedCount(p.openBookings) + '. De bokningarna behåller utrustningen.' : '';
        if (!confirm('Ta bort ' + p.name + '?\n\nUtrustningen avaktiveras: den försvinner ur gästens kalender men finns kvar på tidigare bokningar och kan aktiveras igen.' + booked)) return;
        setPadActive(p.id, false, btn);
      };
    });

    list.querySelectorAll('[data-activate-pad]').forEach(function (btn) {
      btn.onclick = function () {
        setPadActive(btn.getAttribute('data-activate-pad'), true, btn);
      };
    });
  }

  function setPadActive(padId, active, btn) {
    showPadErr('');
    api('setPadActive', { padId: padId, active: active }, btn).then(refreshAll).catch(function (e) {
      showPadErr(e.message);
    });
  }

  $('btnCreatePad').onclick = function () {
    var name = $('padName').value.trim();
    var price = parsePrice($('padPrice').value);
    if (!name) {
      showPadErr('Ange ett namn på utrustningen.');
      return;
    }
    if (price === null) {
      showPadErr(PRICE_ERROR);
      return;
    }
    showPadErr('');
    api('createPad', {
      name: name,
      description: $('padDesc').value.trim(),
      pricePerDay: price
    }, $('btnCreatePad')).then(function () {
      $('padName').value = $('padDesc').value = '';
      return refreshAll();
    }).catch(function (e) {
      showPadErr(e.message);
    });
  };

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

  /** A door pass is not a booking, so its state is not in STATUS_LABELS. */
  function passState(p) {
    if (p.revoked) return 'Återkallad';
    return p.validToday ? 'Gäller idag' : 'Utanför period';
  }

  function renderPasses(list) {
    passes = list;
    var wrap = $('dpList');
    wrap.innerHTML = passes.map(function (p) {
      return '<button type="button" class="list-row pass" data-pass="' + p.id + '">' +
        '<span class="r-who">' + escapeHtml(p.recipientName) +
          '<span class="sub">' + escapeHtml(p.recipientEmail) + '</span></span>' +
        '<span class="r-period">' + p.startDate + ' – ' + p.endDate + '</span>' +
        '<span class="r-status"><span class="badge">' + escapeHtml(passState(p)) + '</span></span>' +
        '</button>';
    }).join('');
    $('dpEmpty').hidden = passes.length > 0;
    wrap.querySelectorAll('.list-row').forEach(function (row) {
      row.onclick = function () { openPass(row.getAttribute('data-pass')); };
    });
  }

  function openPass(id) {
    var p = passes.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    showModal('passModal');
    $('passTitle').textContent = p.recipientName;
    var html = '';
    html += '<p><strong>' + escapeHtml(p.recipientName) + '</strong> — ' + escapeHtml(passState(p)) + '</p>';
    html += '<p>' + escapeHtml(p.recipientEmail) + '</p>';
    html += '<p>Giltig ' + p.startDate + ' – ' + p.endDate + ' (inkl.)</p>';
    if (!p.revoked) {
      html += '<div class="actions"><button type="button" class="ghost" id="passRevoke">Återkalla länken</button></div>';
    }
    html += '<p class="err" id="passErr" hidden></p>';
    $('passDetail').innerHTML = html;

    if ($('passRevoke')) {
      $('passRevoke').onclick = function () {
        if (!confirm('Återkalla dörrlänken till ' + p.recipientName + '? Länken slutar fungera direkt.')) return;
        api('revokeDoorPass', { passId: p.id }, $('passRevoke')).then(function () {
          return refreshAll();
        }).then(function () {
          openPass(p.id);
        }).catch(function (e) {
          $('passErr').hidden = false;
          $('passErr').textContent = e.message;
        });
      };
    }
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
