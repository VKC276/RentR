# VKK Rental — dörrpaket till Raspberry Pi 5

Klona/pulla från git och kör. Pi pollar Cloudflare Worker och pulsar ett 5 V-relä när gästen trycker **Öppna dörr**.

```
Webb → Worker openDoor → D1
Pi   → pollDoor → GPIO → completeDoor
```

## Ny installation

```bash
cd ~
git clone https://github.com/VKC276/RentR.git
cd RentR/pi
chmod +x setup.sh install.sh update.sh configure.sh
./setup.sh
```

`setup.sh` gör: install + systemd + **interaktiv .env** (ingen nano) + test/omstart.

## Ändra .env senare (utan nano)

```bash
cd ~/RentR/pi
./configure.sh
```

Eller direkt:

```bash
./configure.sh --set PI_API_KEY=dinNyckel --restart --test
./configure.sh --set GPIO_PIN=17 --set RELAY_ACTIVE_HIGH=0 --restart
./configure.sh --show
```

## Uppdatera från git

```bash
cd ~/RentR/pi
./update.sh --enable
# vid behov:
./configure.sh
```

## Innehåll

| Fil | Syfte |
|-----|--------|
| `setup.sh` | Ny install: install + configure |
| `configure.sh` | Visa/ändra `/etc/rentr-door.env` utan nano |
| `install.sh` | venv, deps, systemd |
| `update.sh` | `git pull` + `install.sh` |
| `door_listener.py` | Pollar Worker + GPIO-puls |
| `test_api.py` | Testar `pollDoor` |
| `rentr-door.env.example` | Mall |
| `requirements.txt` | gpiozero (lgpio via apt) |

Canonical config: **`/etc/rentr-door.env`** (inte `pi/.env`).

## Kabeldragning

| Relämodul | Pi 5 |
|-----------|------|
| VCC | 5V (fysisk pin 2 eller 4) |
| GND | GND (fysisk pin 6) |
| IN | BCM **17** = fysisk pin **11** |

De flesta kort är **active-low** (`RELAY_ACTIVE_HIGH=0`).

## Secrets

`PI_API_KEY` = Worker-secret `DOOR_API_KEY` (ASCII, utan konstiga tecken):

```bash
# på PC
npx wrangler secret put DOOR_API_KEY
# på Pi
./configure.sh --set PI_API_KEY=sammaNyckel --restart --test
```

## Felsökning

```bash
./configure.sh --show
./.venv/bin/python test_api.py
sudo systemctl status rentr-door
sudo journalctl -u rentr-door -n 50 --no-pager
```

- `Unauthorized` → fel nyckel; kör `./configure.sh` och sätt om `PI_API_KEY`
- `lgpio` / `swig` → `rm -rf .venv && ./update.sh --enable`
- Relä klickar inte → `./configure.sh --set RELAY_ACTIVE_HIGH=1 --restart`
