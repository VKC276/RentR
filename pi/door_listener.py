#!/usr/bin/env python3
"""
Poll GAS for pending Open Door commands and pulse a GPIO relay.

Setup:
  pip install -r requirements.txt
  export GAS_URL="https://script.google.com/macros/s/.../exec"
  export PI_API_KEY="same-as-script-property"
  # optional: GPIO_PIN=17 RELAY_ACTIVE_HIGH=0 PULSE_MS=1000
"""

from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request

try:
    import RPi.GPIO as GPIO  # type: ignore
    HAS_GPIO = True
except ImportError:
    HAS_GPIO = False


GAS_URL = os.environ.get("GAS_URL", "").rstrip("/")
API_KEY = os.environ.get("PI_API_KEY", "")
GPIO_PIN = int(os.environ.get("GPIO_PIN", "17"))
RELAY_ACTIVE_HIGH = os.environ.get("RELAY_ACTIVE_HIGH", "0") == "1"
DEFAULT_PULSE_MS = int(os.environ.get("PULSE_MS", "1000"))
POLL_SEC = float(os.environ.get("POLL_SEC", "2.5"))


def gas_get(action: str, **params):
    """GET /exec — follows Google's security redirect to googleusercontent.com."""
    q = {"action": action, "apiKey": API_KEY}
    q.update({k: v for k, v in params.items() if v is not None})
    url = GAS_URL + "?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"User-Agent": "RentR-Pi/1.0"})
    # urlopen follows redirects by default (script.google.com → googleusercontent.com)
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def pulse_relay(pulse_ms: int) -> None:
    if not HAS_GPIO:
        print(f"[dry-run] pulse {pulse_ms}ms on pin {GPIO_PIN}")
        time.sleep(pulse_ms / 1000.0)
        return
    on = GPIO.HIGH if RELAY_ACTIVE_HIGH else GPIO.LOW
    off = GPIO.LOW if RELAY_ACTIVE_HIGH else GPIO.HIGH
    GPIO.output(GPIO_PIN, on)
    time.sleep(pulse_ms / 1000.0)
    GPIO.output(GPIO_PIN, off)


def main() -> None:
    if not GAS_URL or not API_KEY:
        raise SystemExit("Set GAS_URL and PI_API_KEY environment variables")

    if HAS_GPIO:
        GPIO.setmode(GPIO.BCM)
        GPIO.setup(GPIO_PIN, GPIO.OUT)
        idle = GPIO.LOW if RELAY_ACTIVE_HIGH else GPIO.HIGH
        GPIO.output(GPIO_PIN, idle)
        print(f"GPIO ready on BCM{GPIO_PIN}")
    else:
        print("RPi.GPIO not available — dry-run mode")

    print("Polling for door commands…")
    try:
        while True:
            try:
                data = gas_get("pollDoor")
                cmd = data.get("command")
                if cmd:
                    pulse = int(cmd.get("pulseMs") or DEFAULT_PULSE_MS)
                    print(f"Open door command {cmd.get('id')} pulse={pulse}ms")
                    pulse_relay(pulse)
                    gas_get("completeDoor", commandId=cmd.get("id"))
                    print("Marked done")
            except Exception as exc:  # noqa: BLE001
                print(f"Poll error: {exc}")
            time.sleep(POLL_SEC)
    finally:
        if HAS_GPIO:
            GPIO.cleanup()


if __name__ == "__main__":
    main()
