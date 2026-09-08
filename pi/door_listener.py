#!/usr/bin/env python3
"""
VKK Rental — poll Cloudflare Worker for Open door commands and pulse a 5V relay.

Designed for Raspberry Pi Zero W + Pi OS (gpiozero / lgpio or RPi.GPIO).
Falls back to dry-run when GPIO libraries are missing (useful on a laptop
while testing the API).

Required env:
  API_URL      https://rentr-api.muddy-rice-38d4.workers.dev
  PI_API_KEY   same value as Worker secret DOOR_API_KEY

Optional env:
  GPIO_PIN=25           # BCM number (gpiozero default)
  HEADER_PIN=22         # physical 40-pin header hole; if set, gpiozero uses BOARD*
  RELAY_ACTIVE_HIGH=0   # 0 = active-low (most 5V relay boards)
  PULSE_MS=1000         # fallback if Worker omits pulseMs
  POLL_SEC=2.5
  ENV_FILE=/etc/vkk-rental-door.env
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_API_URL = "https://rentr-api.muddy-rice-38d4.workers.dev"
USER_AGENT = "VKK-Rental-Pi/2.1"
CANONICAL_ENV = "/etc/vkk-rental-door.env"
LEGACY_ENV = "/etc/rentr-door.env"


def bootstrap_env() -> None:
    """Load env files. Later files override earlier ones.

    Priority (highest last): package .env → legacy rentr → vkk-rental → ENV_FILE.
    """
    explicit = os.environ.get("ENV_FILE", "").strip()
    candidates = [
        Path(__file__).resolve().parent / ".env",
        LEGACY_ENV,
        CANONICAL_ENV,
    ]
    if explicit:
        candidates.append(explicit)
    for c in candidates:
        load_env_file(c, override=True)


def load_env_file(path: str | Path, override: bool = False) -> None:
    """Load KEY=VALUE lines into os.environ."""
    p = Path(path)
    if not p.is_file():
        return
    try:
        lines = p.read_text(encoding="utf-8").splitlines()
    except PermissionError:
        print(
            f"Kan inte läsa {p} (behörighet). Kör: sudo chown root:\"$USER\" {p} && sudo chmod 640 {p}",
            file=sys.stderr,
            flush=True,
        )
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if not key:
            continue
        if override or key not in os.environ:
            os.environ[key] = value


def env_bool(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


bootstrap_env()

API_URL = os.environ.get("API_URL", DEFAULT_API_URL).rstrip("/")
API_KEY = os.environ.get("PI_API_KEY", "").strip().strip("'").strip('"')
RELAY_ACTIVE_HIGH = env_bool("RELAY_ACTIVE_HIGH", "0")
DEFAULT_PULSE_MS = int(os.environ.get("PULSE_MS", "1000"))
POLL_SEC = float(os.environ.get("POLL_SEC", "2.5"))

# BCM ↔ physical pin on the 40-pin header. Same map on Pi Zero W, 3, 4 and 5.
# gpiozero integers are BCM; "BOARD22" is the hole you count on the header.
BCM_PHYSICAL = {
    2: 3,
    3: 5,
    4: 7,
    17: 11,
    27: 13,
    22: 15,
    10: 19,
    9: 21,
    11: 23,
    5: 29,
    6: 31,
    13: 33,
    19: 35,
    26: 37,
    14: 8,
    15: 10,
    18: 12,
    23: 16,
    24: 18,
    25: 22,
    8: 24,
    7: 26,
    12: 32,
    16: 36,
    20: 38,
    21: 40,
}
PHYSICAL_BCM = {phys: bcm for bcm, phys in BCM_PHYSICAL.items()}
# Header holes that are power, ground, or ID EEPROM — not GPIO.
HEADER_NOT_GPIO = frozenset({1, 2, 4, 6, 9, 14, 17, 20, 25, 27, 28, 30, 34, 39})


def physical_pin(bcm: int) -> str:
    n = BCM_PHYSICAL.get(int(bcm))
    return str(n) if n else "?"


def _parse_board_token(raw: str) -> int | None:
    s = raw.strip().upper().replace(" ", "")
    if s.startswith("BOARD"):
        s = s[5:]
    elif s.startswith("P"):
        s = s[1:]
    if s.isdigit():
        return int(s)
    return None


def resolve_pins(header_raw: str, gpio_raw: str) -> tuple[int, int, int | str]:
    """Return (bcm, header, gpiozero_spec).

    gpiozero_spec is an int (BCM) or 'BOARDn' (physical). Prefer BOARD when
    HEADER_PIN is set so the library maps the header hole.
    """
    header_raw = (header_raw or "").strip()
    gpio_raw = (gpio_raw or "").strip() or "25"

    if header_raw:
        header = _parse_board_token(header_raw)
        if header is None:
            raise SystemExit(f"Ogiltig HEADER_PIN={header_raw!r}")
        if header in HEADER_NOT_GPIO:
            raise SystemExit(
                f"HEADER_PIN={header} är inte GPIO "
                f"(pin 25 är GND, pin 1/2/4 är ström). Relä IN: pin 22 = BCM 25."
            )
        bcm = PHYSICAL_BCM.get(header)
        if bcm is None:
            raise SystemExit(f"HEADER_PIN={header} finns inte på 40-pinners headern")
        return bcm, header, f"BOARD{header}"

    board = _parse_board_token(gpio_raw) if not gpio_raw.isdigit() else None
    if board is not None and not gpio_raw.isdigit():
        return resolve_pins(str(board), "25")

    bcm = int(gpio_raw)
    header_n = BCM_PHYSICAL.get(bcm)
    spec: int | str = bcm
    return bcm, int(header_n) if header_n else 0, spec


GPIO_PIN, HEADER_PIN, GPIOZERO_SPEC = resolve_pins(
    os.environ.get("HEADER_PIN", ""),
    os.environ.get("GPIO_PIN", "25"),
)


def api_call(action: str, **extra):
    """POST JSON to the Worker (same contract as the web client)."""
    payload = {"action": action, "apiKey": API_KEY}
    payload.update({k: v for k, v in extra.items() if v is not None})
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        API_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail or exc.reason}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Network error: {exc.reason}") from exc

    data = json.loads(raw) if raw else {}
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(str(data.get("error")))
    return data


def _load_gpio_device():
    """Import gpiozero only when needed — import can hang/block on some Pi setups."""
    from gpiozero import DigitalOutputDevice  # type: ignore

    return DigitalOutputDevice(
        GPIOZERO_SPEC,
        active_high=RELAY_ACTIVE_HIGH,
        initial_value=False,
    )


class Relay:
    def __init__(self) -> None:
        self._dev = None
        try:
            self._dev = _load_gpio_device()
            mode = "active-high" if RELAY_ACTIVE_HIGH else "active-low"
            print(
                f"GPIO ready gpiozero={GPIOZERO_SPEC!s} → BCM{GPIO_PIN} = fysisk pin {HEADER_PIN or physical_pin(GPIO_PIN)} ({mode}, idle=off)",
                flush=True,
            )
        except ImportError:
            print("gpiozero not available — dry-run mode (no hardware pulse)", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"GPIO init failed ({exc}) — dry-run mode", flush=True)
            self._dev = None

    def pulse(self, pulse_ms: int) -> None:
        ms = max(50, int(pulse_ms))
        if self._dev is None:
            print(
                f"[dry-run] pulse {ms}ms gpiozero={GPIOZERO_SPEC!s} "
                f"(BCM{GPIO_PIN} / fysisk pin {HEADER_PIN or physical_pin(GPIO_PIN)})",
                flush=True,
            )
            time.sleep(ms / 1000.0)
            return
        self._dev.on()
        try:
            time.sleep(ms / 1000.0)
        finally:
            self._dev.off()

    def close(self) -> None:
        if self._dev is not None:
            self._dev.close()
            self._dev = None


def main() -> None:
    if not API_KEY:
        raise SystemExit(
            "Sätt PI_API_KEY (samma värde som Worker-secret DOOR_API_KEY).\n"
            "Exempel: export PI_API_KEY=… eller /etc/vkk-rental-door.env"
        )
    if not API_URL:
        raise SystemExit("Sätt API_URL till Worker-URL:en")

    print(f"API {API_URL}", flush=True)
    print(f"Poll every {POLL_SEC}s · fallback pulse {DEFAULT_PULSE_MS}ms", flush=True)
    relay = Relay()
    print("Listening for Open door…", flush=True)

    try:
        while True:
            try:
                data = api_call("pollDoor")
                cmd = data.get("command") if isinstance(data, dict) else None
                if cmd:
                    cmd_id = cmd.get("id")
                    pulse = int(cmd.get("pulseMs") or DEFAULT_PULSE_MS)
                    print(f"Command {cmd_id} → pulse {pulse}ms", flush=True)
                    relay.pulse(pulse)
                    api_call("completeDoor", commandId=cmd_id)
                    print(f"Command {cmd_id} marked done", flush=True)
            except Exception as exc:  # noqa: BLE001
                print(f"Poll error: {exc}", file=sys.stderr, flush=True)
            time.sleep(POLL_SEC)
    except KeyboardInterrupt:
        print("\nStopped", flush=True)
    finally:
        relay.close()


if __name__ == "__main__":
    main()
