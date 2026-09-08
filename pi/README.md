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

Det kommandot: klonar vid behov, installerar venv + systemd (`vkk-rental-door`), skriver `/etc/vkk-rental-door.env` (GPIO **25**, active-high) och startar tjänsten.

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
./configure.sh --set GPIO_PIN=25 --set RELAY_ACTIVE_HIGH=1 --restart
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

**gpiozero** tar **BCM-nummer** som standard (`DigitalOutputDevice(25)` = GPIO 25). Det numret är **samma hål** på Pi Zero W, Pi 3, 4 och 5 (40-pinners header). Biblioteket byter inte pin när du byter Pi-modell. `HEADER_PIN=22` skickas som `BOARD22` så gpiozero mappar det fysiska hålet.

Styr efter hålet du räknar på kortet:

```bash
./bootstrap.sh --skip-install --header-pin 22   # BCM 25
./bootstrap.sh --skip-install --header-pin 11   # BCM 17, gamla Pi 5-kabeln
./configure.sh --set HEADER_PIN=22 --restart
```

**BCM 25 är inte samma pin som BCM 17.**

| HEADER_PIN (hål) | BCM (gpiozero) |
|------------------|----------------|
| **22** | **25** |
| **11** | **17** |

Pin **25** på headern är **GND** — inte GPIO 25.

| Relämodul | Pi Zero W |
|-----------|-----------|
| VCC | 5V (fysisk pin 2 eller 4) |
| GND | GND (fysisk pin 6) |
| IN | hål **22** (BCM 25) |

Om IN-kabeln sitter kvar på hål **11** styr scriptet fel pin. Active-low-reläer drar då **hela tiden**. Antingen flytta IN till hål **22**, eller `./bootstrap.sh --skip-install --header-pin 11`.

Reläet ska vara **av** när tjänsten körs och ingen har tryckt Öppna dörr. Standard är **active-high** (BCM 25 låg i vila). Om reläet drar i vila: `./bootstrap.sh --skip-install --active-low`.

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
