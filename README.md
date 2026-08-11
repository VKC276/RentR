# Crashpad booking system

Hybrid **GitHub Pages** UI + **Google Apps Script** JSON API with data in **Google Sheets**.

## Features

- Calendar availability for ~10–15 crashpads
- 15-minute hold lock while booking
- Booking request → admin approval workflow
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
6. Deploy → **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Copy the `/exec` URL.

Default admin after seed: `admin@example.com` / `Admin123!` — **change immediately**.

## 2. GitHub Pages

Live: **http://ledinfo.vastervikclimbing.se/RentR/**

1. `js/config.js` is already set to the GAS `/exec` URL.
2. In Sheet `Config`, set `pagesBaseUrl` to `http://ledinfo.vastervikclimbing.se/RentR` (no trailing slash).
3. Pages: deploy from branch `main`, folder **`/` (root)**.
4. Open the site and book a test period.

API calls use JSONP (GET + `callback`) so the browser can talk to Apps Script without CORS.

## 3. Raspberry Pi

See [pi/README.md](pi/README.md).

## Status flow

`Requested` → `Approved` → `HandedOut` → `Returned`  
(+ `ChangePending` / `CancelPending` / `Rejected` / `Cancelled`)

## Security notes

- Never put pepper, Pi key, or spreadsheet id in the Pages repo.
- Frontend is public; all authorization is enforced in GAS.
- Change the default admin password after first login.
