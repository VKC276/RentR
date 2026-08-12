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

`setup.sh` gör: install + systemd (`vkk-rental-door`) + **interaktiv .env** (ingen nano) + test/omstart.

> GitHub-repot heter fortfarande `RentR` (URL/mapp). Produkten heter **VKK Rental**.

## Ändra .env senare (utan nano)

```bash
cd ~/RentR/pi
./configure.sh
```

```bash
./configure.sh --set PI_API_KEY=dinNyckel --restart --test
./configure.sh --set GPIO_PIN=17 --set RELAY_ACTIVE_HIGH=0 --restart
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
| `setup.sh` | Ny install: install + configure |
| `configure.sh` | Visa/ändra env utan nano |
| `install.sh` | venv, deps, systemd |
| `update.sh` | `git pull` + `install.sh` |
| `door_listener.py` | Pollar Worker + GPIO-puls |
| `test_api.py` | Testar `pollDoor` |
| `vkk-rental-door.env.example` | Mall |

## Kabeldragning

| Relämodul | Pi 5 |
|-----------|------|
| VCC | 5V (fysisk pin 2 eller 4) |
| GND | GND (fysisk pin 6) |
| IN | BCM **17** = fysisk pin **11** |

## Secrets

`PI_API_KEY` = Worker-secret `DOOR_API_KEY`:

```bash
npx wrangler secret put DOOR_API_KEY
./configure.sh --set PI_API_KEY=sammaNyckel --restart --test
```

## Felsökning

```bash
./configure.sh --show
./.venv/bin/python test_api.py
sudo systemctl status vkk-rental-door
sudo journalctl -u vkk-rental-door -n 50 --no-pager
```
