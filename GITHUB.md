# GitHub Pages — RentR

Live site: **http://ledinfo.vastervikclimbing.se/RentR/**

## Structure

Frontend ligger i **repo-roten** (`index.html`, `admin/`, `js/`, `css/`, …).  
GAS-kod i `gas/`, Pi i `pi/`.

## Pages

Settings → Pages → Deploy from branch → `main` → folder **`/` (root)**.

## Sheet Config

Sätt (eller behåll):

| key | value |
|-----|-------|
| `pagesBaseUrl` | `http://ledinfo.vastervikclimbing.se/RentR` |

Ingen trailing slash. Mejllänkar byggs som `{pagesBaseUrl}/booking.html?t=…` m.m.

## GAS

`js/config.js` innehåller redan `/exec`-URL:n.
