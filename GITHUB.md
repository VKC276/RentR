# GitHub — nästa steg

När repot finns (tomt eller med README):

1. Lägg till remote, t.ex. `git remote add origin https://github.com/USER/REPO.git`
2. Pusha hela projektet (agenten kan köra `git add` / `commit` / `push` om du ber om det)
3. Aktivera **GitHub Pages**: Settings → Pages → Source: Deploy from a branch → Branch `main` → Folder **`/web`**
4. Sätt i Google Sheet **Config** → `pagesBaseUrl` till `https://USER.github.io/REPO` (ingen trailing slash)

Redan klart i repot:
- `web/js/config.js` pekar på GAS `/exec`
- `gas/` = Apps Script-källkod
- `templates/crashpad-booking-sheets.xlsx` = Sheet-mall
- Hemligheter ligger i gitignorerad `script-properties.local.txt` (pusha den inte)
