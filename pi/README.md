# Raspberry Pi — Open door relay

## Wiring

- Relay module IN → BCM GPIO pin (default **17**)
- Relay VCC/GND according to module (often 5V; use transistor/optocoupler if needed)
- Many relay boards are **active-low** (default in script)

## Config

```bash
export GAS_URL="https://script.google.com/macros/s/XXXX/exec"
export PI_API_KEY="same-value-as-GAS-Script-Property-PI_API_KEY"
export GPIO_PIN=17
export RELAY_ACTIVE_HIGH=0
export PULSE_MS=1000
export POLL_SEC=2.5
```

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python door_listener.py
```

Without GPIO libraries the script runs in dry-run mode (prints pulses only).
