# VKK Rental — dörrpaket till Raspberry Pi Zero W

Klona/pulla från git och kör **ett kommando**. Pi pollar Cloudflare Worker och pulsar ett 5 V-relä när gästen trycker **Öppna dörr**. Standard-GPIO är **BCM 25**.

```
Webb → Worker openDoor → D1
Pi   → pollDoor → GPIO → completeDoor
```

## En kommandorad (rekommenderat)

På Pi:n, med git redan klonat:

```bash
cd ~/RentR/pi
chmod +x bootstrap.sh
./bootstrap.sh --key 'DIN_DOOR_API_KEY'
```

Ny Pi utan att klona först:

```bash
curl -fsSL https://raw.githubusercontent.com/VKC276/RentR/main/pi/bootstrap.sh | bash -s -- --key 'DIN_DOOR_API_KEY'
```

Det kommandot: klonar vid behov, installerar venv + systemd (`vkk-rental-door`), skriver `/etc/vkk-rental-door.env` (GPIO **25**, active-low) och startar tjänsten.

```bash
# Samma script, bara inställningar (ingen ominstall)
./bootstrap.sh --test
./bootstrap.sh --skip-install --key 'nyNyckel' --gpio 25 --test

# Visa hjälp
./bootstrap.sh --help
```

> GitHub-repot heter fortfarande `RentR` (URL/mapp). Produkten heter **VKK Rental**.

## Interaktiv install (valfritt)

```bash
cd ~
git clone https://github.com/VKC276/RentR.git
cd RentR/pi
chmod +x setup.sh install.sh update.sh configure.sh bootstrap.sh
./setup.sh
```

## Ändra .env senare (utan nano)

```bash
cd ~/RentR/pi
./configure.sh
```

```bash
./configure.sh --set PI_API_KEY=dinNyckel --restart --test
./configure.sh --set GPIO_PIN=25 --set RELAY_ACTIVE_HIGH=0 --restart
./configure.sh --show
```

Canonical config: **`/etc/vkk-rental-door.env`**  
(äldre `/etc/rentr-door.env` migreras automatiskt vid install/configure)

## Uppdatera från git

```bash
cd ~/RentR/pi
./update.sh --enable
```

## Innehåll

| Fil | Syfte |
|-----|--------|
| `bootstrap.sh` | **Ett kommando:** install + GPIO 25 + nyckel |
| `setup.sh` | Ny install: install + interaktiv configure |
| `configure.sh` | Visa/ändra env utan nano |
| `install.sh` | venv, deps, systemd |
| `update.sh` | `git pull` + `install.sh` |
| `door_listener.py` | Pollar Worker + GPIO-puls |
| `test_api.py` | Testar `pollDoor` |
| `vkk-rental-door.env.example` | Mall |

## Kabeldragning (Pi Zero W)

**BCM 25 är inte samma pin som BCM 17.** På 40-pinners headern:

| BCM (mjukvara) | Fysisk pin (räkna på kortet) |
|----------------|------------------------------|
| **25** (nu) | **22** — jämna raden, 11:e pinnen från SD-kort-änden (pin 2 = 5V … 22) |
| 17 (gamla Pi 5-paketet) | **11** — udda raden, 6:e pinnen från SD-kort-änden (pin 1 = 3.3V … 11) |

| Relämodul | Pi Zero W |
|-----------|-----------|
| VCC | 5V (fysisk pin 2 eller 4) |
| GND | GND (fysisk pin 6) |
| IN | BCM **25** = fysisk pin **22** |

Om IN-kabeln sitter kvar på pin **11** styr scriptet fel pin. Active-low-reläer drar då **hela tiden** (GPIO 17 ligger låg när den inte initieras). Flytta IN till pin **22**, eller kör `./configure.sh --set GPIO_PIN=17 --restart` om du vill behålla den gamla kabeln.

Reläet ska vara **av** när tjänsten körs och ingen har tryckt Öppna dörr. Om det fortfarande drar med kabeln på pin 22: prova `./bootstrap.sh --skip-install --gpio 25 --active-high` (vissa kort är high-level trigger).

## Secrets

`PI_API_KEY` = Worker-secret `DOOR_API_KEY`:

```bash
npx wrangler secret put DOOR_API_KEY
./bootstrap.sh --skip-install --key 'sammaNyckel' --test
```

## Felsökning

```bash
./configure.sh --show
./.venv/bin/python test_api.py
sudo systemctl status vkk-rental-door
sudo journalctl -u vkk-rental-door -n 50 --no-pager
```
