# VKK Rental

Booking system for Västerviks klätterklubb — **GitHub Pages** UI + **Cloudflare Worker/D1** API (legacy GAS mail relay).

## Features

- Calendar availability for ~10–15 rentable items (crashpads and other equipment)
- Nothing is reserved while a guest fills in the form. The selection is rechecked when
  the request is sent, and a collision refuses the whole request — no booking row, no
  booking number, no mail — while naming the equipment that was taken so the guest can
  choose again
- Booking request → admin approval workflow
- Guest cancellation takes effect immediately and frees the dates
- Unique booking number (`2026-00042`)
- Guest magic link + lookup by number + email
- Pricing per day + discount tiers (days / pads)
- i18n: Swedish / English / German
- Admin users with hashed passwords (last admin protected)
- Hand-out flow, paid toggle, self pickup/return Open door
- Confirm return after Open door; then Open door is removed
- Admin door-only email links (name + validity dates → page with only Open door)
- Raspberry Pi relay listener

## Repo layout

```
/                GitHub Pages frontend (index.html, admin/, js/, css/)
gas/             Apps Script backend (clasp)
pi/              Door relay poller
templates/       Sheet xlsx template
```

## 1. Google Sheet + Apps Script

1. Create an empty Google Spreadsheet (or upload `templates/crashpad-booking-sheets.xlsx`).
2. Create a new Apps Script project (or `npm i -g @google/clasp && clasp login && clasp create`).
3. Copy `gas/*` into the project (`clasp push` with `.clasp.json` from `.clasp.json.example`).
4. Set **Script properties**:
   - `SPREADSHEET_ID` — spreadsheet id from the URL
   - `PASSWORD_PEPPER` — long random string (auto-created on first seed if missing)
   - `PI_API_KEY` — shared secret for the Pi
5. Run `setupSpreadsheet` once in the editor (or call API `action=setup`).
   Schema creation is skipped on later requests via the `SCHEMA_READY` script property,
   since re-checking every sheet added seconds to each call. Run `setupSpreadsheet`
   again after changing `HEADERS` (or bump `SCHEMA_VERSION` in `Sheets.gs`).
6. Deploy → **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the `/exec` URL.

Default admin after seed: `admin@example.com` / `Admin123!` — **change immediately**.

## 2. GitHub Pages

Live: **https://rent.vastervikclimbing.se/**

1. `js/config.js` is already set to the GAS `/exec` URL.
2. In D1 `config`, set `pagesBaseUrl` to `https://rent.vastervikclimbing.se` (no trailing slash).
3. Pages: deploy from branch `main`, folder **`/` (root)**.
4. Open the site and book a test period.

API calls use plain `fetch`. GAS sends `Access-Control-Allow-Origin: *` on both the
`/exec` redirect and the `script.googleusercontent.com` response, so cross-origin works
as long as requests stay CORS-"simple" — the client posts a `text/plain` body and sets no
custom headers, since Apps Script cannot answer a preflight `OPTIONS`. If POST is blocked,
the client falls back to GET and then JSONP (`?callback=`), picking the transport once per
page load.

## Performance notes

Sheets round trips dominate response time, so the backend avoids them where it can:

- Sessions live in `CacheService` with a `PropertiesService` backstop, not in a tab.
  Each session stores a snapshot of the user, so an authenticated request reads no sheet
  at all. There is deliberately no `Sessions` tab — delete it if your spreadsheet has one.
- `readAllObjects_` memoises each tab for the duration of one request. Any new write path
  must call `invalidateTable_`, or later reads in the same request will be stale.
- `getConfig_` reads the `Config` tab once per request instead of once per lookup.
- `updateObjectById_` writes the whole row in one call rather than one call per field.
- Schema creation runs once, guarded by the `SCHEMA_READY` script property.

## 3. Raspberry Pi

See [pi/README.md](pi/README.md).

## Status flow

`Requested` → `Approved` → `HandedOut` → `Returned`  
(+ `ChangePending` / `Rejected` / `Cancelled`)

Statuses are stored as these English keys everywhere. The admin UI shows Swedish labels
from `STATUS_LABELS` in `admin/admin.js`, the guest pages use the `status_*` keys in
`js/i18n.js`. A guest cancels from the manage page up until hand-out; the booking goes
straight to `Cancelled` and admins get a notification mail. `CancelPending` is a leftover
from the old approve-the-cancellation flow and is only kept so existing rows keep
reserving their dates.

## Security notes

- Never put pepper, Pi key, or spreadsheet id in the Pages repo.
- Frontend is public; all authorization is enforced in GAS.
- Change the default admin password after first login.
