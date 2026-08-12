# VKK Rental — dörrpaket till Raspberry Pi 5

Paket du **pullar/clonar** till Pi och kör. Det lyssnar efter **Öppna dörr** via Cloudflare Worker och pulsar ett 5 V-relä.

```
Webb → Worker openDoor → D1
Pi   → pollDoor → GPIO → completeDoor
```

## Snabbstart på Pi

```bash
# Första gången
cd ~
git clone https://github.com/VKC276/RentR.git
cd RentR/pi
chmod +x install.sh update.sh
./install.sh --enable
sudo nano /etc/rentr-door.env    # sätt PI_API_KEY
./.venv/bin/python test_api.py
sudo systemctl restart rentr-door
sudo journalctl -u rentr-door -f
```

```bash
# Senare uppdateringar
cd ~/RentR/pi
./update.sh --enable
```

Om install faller på `lgpio` / `swig`: ta bort gammal venv och kör om (apt `python3-lgpio` + `--system-site-packages`):

```bash
rm -rf ~/RentR/pi/.venv
cd ~/RentR/pi && ./update.sh --enable
```

## Innehåll

| Fil | Syfte |
|-----|--------|
| `door_listener.py` | Pollar Worker + GPIO-puls |
| `test_api.py` | Testar `pollDoor` utan relä |
| `install.sh` | venv, deps, env, systemd |
| `update.sh` | `git pull` + `install.sh` |
| `rentr-door.env.example` | Mall för secrets |
| `requirements.txt` | gpiozero (lgpio via apt) |
| `rentr-door.service` | Exempel-unit (skrivs om av install) |

## Kabeldragning

| Relämodul | Pi 5 |
|-----------|------|
| VCC | 5V |
| GND | GND |
| IN | BCM **17** (byte via `GPIO_PIN`) |

De flesta kort är **active-low** (`RELAY_ACTIVE_HIGH=0`).

## Secrets

`PI_API_KEY` i `/etc/rentr-door.env` måste vara **samma** som Worker-secret:

```bash
# från utvecklingsdatorn / CI
npx wrangler secret put DOOR_API_KEY
```

`API_URL` defaultar till `https://rentr-api.muddy-rice-38d4.workers.dev`.

Pulslängd: D1-config `relayPulseMs` (fallback `PULSE_MS=1000`).

## Manuell körning

```bash
cd ~/RentR/pi
source .venv/bin/activate
ENV_FILE=/etc/rentr-door.env python door_listener.py
```

Utan gpiozero kör skriptet i **dry-run** (loggar puls, ingen GPIO).

## Felsökning

```bash
./.venv/bin/python test_api.py
sudo systemctl status rentr-door
sudo journalctl -u rentr-door -n 50 --no-pager
```

- `Unauthorized` → fel `PI_API_KEY` / `DOOR_API_KEY`
- `lgpio` / `swig`-fel vid pip → `rm -rf .venv` och `./update.sh --enable` (använd apt `python3-lgpio`)
- Inget kommando → tryck Öppna dörr på giltig länk, vänta ≤ `POLL_SEC`
- Relä klickar inte → prova `RELAY_ACTIVE_HIGH=1`, kontrollera BCM-pin och 5V
