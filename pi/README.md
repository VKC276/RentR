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

## Felsökning

```bash
./setup.sh --show
./setup.sh --test
sudo journalctl -u vkk-rental-door -f
```
