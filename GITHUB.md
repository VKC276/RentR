# GitHub Pages — VKK Rental

Live site: **https://rent.vastervikclimbing.se/**

## Structure

Frontend ligger i **repo-roten** (`index.html`, `admin/`, `js/`, `css/`, …).  
GAS-kod i `gas/`, Pi i `pi/`.

## Pages

Settings → Pages → Deploy from branch → `main` → folder **`/` (root)**.

## Sheet Config

Sätt (eller behåll):

| key | value |
|-----|-------|
| `pagesBaseUrl` | `https://rent.vastervikclimbing.se` |

Ingen trailing slash. Mejllänkar byggs som `{pagesBaseUrl}/booking.html?t=…` m.m.

## GAS

`js/config.js` innehåller redan `/exec`-URL:n.
