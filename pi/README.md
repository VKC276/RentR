# VKK Rental — dörr på Raspberry Pi Zero W

```
Webb → Worker openDoor → D1
Pi   → pollDoor → BCM 25 → completeDoor
```

Relä: **BCM 25** (hål 22), **active-high** (pin låg i vila).

## Install / uppdatering

```bash
cd ~/RentR
git pull
cd pi
./setup.sh 'DIN_DOOR_API_KEY'
```

Första gången, om repot inte finns:

```bash
git clone https://github.com/VKC276/RentR.git
cd ~/RentR/pi
./setup.sh 'DIN_DOOR_API_KEY'
```

`./setup.sh` gör git pull, venv, systemd (`vkk-rental-door`) och skriver nyckeln. Utan argument (när nyckeln redan finns):

```bash
cd ~/RentR/pi && ./setup.sh
```

Nyckel = Worker-secret `DOOR_API_KEY` (sätts med `npx wrangler secret put DOOR_API_KEY`).

## Kabel

| Relä | Pi Zero W |
|------|-----------|
| VCC | 5V (pin 2 eller 4) |
| GND | GND (pin 6) |
| IN | hål **22** = BCM **25** |

Hål 25 på headern är GND.

## Stabilitet (UPS täcker ström — det här täcker OS)

Pi Zero W:s vanliga självmål är **Wi-Fi som somnar**, **SD-kortet fylls av loggar**, **tjänsten ger upp efter kraschloop**, och **fel klocka** (TLS mot Worker). `./setup.sh` kör `harden.sh` som:

- stänger av Wi-Fi power save
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
