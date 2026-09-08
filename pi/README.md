# VKK Rental — dörr på Raspberry Pi Zero W

```
Webb → Worker openDoor → D1
Pi   → pollDoor → BCM 25 → completeDoor
```

Relä: **BCM 25** (hål 22), **active-high** (pin låg i vila).

## Installation (första gången)

På Pi:n, med internet och `git` installerat (Raspberry Pi OS Lite).

**1. Sätt samma dörrnyckel i Cloudflare Worker** (på din dator, i repot, inloggad med wrangler):

```bash
npx wrangler secret put DOOR_API_KEY
```

Klistra in en lång slumpnyckel. Samma värde ska till Pi:n i steg 3.

**2. Klona koden på Pi:n:**

```bash
cd ~
git clone https://github.com/VKC276/RentR.git
cd ~/RentR/pi
```

**3. Installera och starta** (klistra in samma nyckel som i steg 1):

```bash
./setup.sh 'DIN_DOOR_API_KEY'
```

Det gör venv, systemd-tjänsten `vkk-rental-door`, Wi-Fi/watchdog-stabilisering och startar lyssnaren. Första gången: **starta om Pi:n en gång** (`sudo reboot`) så kernel-watchdog slår.

**4. Kolla att det lever:**

```bash
./setup.sh --test
sudo systemctl status vkk-rental-door
iw dev wlan0 get power_save
```

`--test` ska sluta med `OK`. `power_save` ska vara `off`. `status` ska vara `active (running)`.

**5. Deploya Worker** när dörrlogik i molnet har ändrats (på datorn, inte på Pi:n):

```bash
git pull
npx wrangler deploy
```

Utan steg 5 får Pi:n ny kod, men kön/timeout i molnet är oförändrad.

## Uppdatering (senare)

När ni har puschat till `main`:

```bash
cd ~/RentR/pi
./setup.sh
```

Det räcker. Scriptet gör `git pull`, installerar om och startar om tjänsten. Nyckeln i `/etc/vkk-rental-door.env` behålls.

Ny dörrnyckel:

```bash
./setup.sh 'NY_DOOR_API_KEY'
```

Kontrollera att Pi:n fick `main`:

```bash
cd ~/RentR
git fetch origin
git checkout main
git pull origin main
git log -1 --oneline
```

`git status` som säger “up to date” utan `git fetch` kan ljuga — den jämför mot senast hämtade origin.

## Kabel

| Relä | Pi Zero W |
|------|-----------|
| VCC | 5V (pin 2 eller 4) |
| GND | GND (pin 6) |
| IN | hål **22** = BCM **25** |

Hål 25 på headern är GND.

Dörrkommandon lever **30 sekunder**. Äldre pending kasseras. Vid wifi-lucka töms inte en kö av slag — max **en** puls (senaste giltiga trycket). Kräver att Workern är deployad.

## Stabilitet (UPS täcker ström — det här täcker OS)

Pi Zero W:s vanliga självmål är **Wi-Fi som somnar**, **SD-kortet fylls av loggar**, **tjänsten ger upp efter kraschloop**, och **fel klocka** (TLS mot Worker). `./setup.sh` kör `harden.sh` som:

- stänger av Wi-Fi power save **vid varje reconnect** (AP/router-bortfall slår annars på det igen)
- begränsar journald till 50 MB
- sätter kernel-watchdog + systemd-watchdog på dörrtjänsten (omstart om den hänger)
- väntar på nätverk innan tjänsten startar
- slår på timesyncd / fake-hwclock

Dörrlyssnaren backar av vid API-fel (upp till 60 s) och ger inte upp.

Gör också, en gång per Pi:

1. **Lite OS** — Raspberry Pi OS **Lite**, ingen desktop.
2. **Bra microSD** (A2, känd tillverkare). Undvik no-name. SD-korruption är den vanliga “den dog bara”.
3. **Inte `sudo rpi-update`**, inte slumpmässiga `full-upgrade` mitt i säsong. `./setup.sh` räcker för vår kod. OS-uppdateringar medvetet, sen `./setup.sh`.
4. **Statiskt DHCP-lån** på routern för Pi:ns MAC så DNS/Wi-Fi inte byter identitet.
5. **Ingen overlay/read-only** krävs, men om du vill maxa SD-livslängd: `raspi-config` → performance → overlay file system (då måste du stänga av overlay för att köra `./setup.sh`).
6. **USB-kabeln till UPS** ska tåla ström (kort, tjock). Undervoltage ger freeze även med batteri.

Kolla hälsa:

```bash
vcgencmd get_throttled    # 0x0 = bra (ingen throttle/undervoltage)
iw dev wlan0 get power_save
sudo systemctl status vkk-rental-door
sudo journalctl -u vkk-rental-door -n 30 --no-pager
```

## Felsökning

```bash
./setup.sh --show
./setup.sh --test
sudo journalctl -u vkk-rental-door -f
```
