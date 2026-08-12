#!/usr/bin/env python3
"""
VKK Rental — poll Cloudflare Worker for Open door commands and pulse a 5V relay.

Designed for Raspberry Pi 5 + Pi OS (gpiozero / lgpio). Falls back to dry-run
when GPIO libraries are missing (useful on a laptop while testing the API).

Required env:
  API_URL      https://rentr-api.muddy-rice-38d4.workers.dev
  PI_API_KEY   same value as Worker secret DOOR_API_KEY

Optional env:
  GPIO_PIN=17
  RELAY_ACTIVE_HIGH=0   # 0 = active-low (most 5V relay boards)
  PULSE_MS=1000         # fallback if Worker omits pulseMs
  POLL_SEC=2.5
  ENV_FILE=/etc/rentr-door.env
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
USER_AGENT = "VKK-Rental-Pi/2.0"


def load_env_file(path: str | Path) -> None:
    """Load KEY=VALUE lines into os.environ if the key is not already set."""
    p = Path(path)
    if not p.is_file():
        return
    try:
        lines = p.read_text(encoding="utf-8").splitlines()
    except PermissionError:
        print(f"Kan inte läsa {p} (behörighet). Kör som tjänst eller fixa chmod/chown.", file=sys.stderr)
        return
    for raw in lines:
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def bootstrap_env() -> None:
    explicit = os.environ.get("ENV_FILE", "").strip()
    candidates = []
    if explicit:
        candidates.append(explicit)
    candidates.append(Path(__file__).resolve().parent / ".env")
    candidates.append("/etc/rentr-door.env")
    for c in candidates:
        load_env_file(c)


def env_bool(name: str, default: str = "0") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


bootstrap_env()

API_URL = os.environ.get("API_URL", DEFAULT_API_URL).rstrip("/")
API_KEY = os.environ.get("PI_API_KEY", "").strip()
GPIO_PIN = int(os.environ.get("GPIO_PIN", "17"))
RELAY_ACTIVE_HIGH = env_bool("RELAY_ACTIVE_HIGH", "0")
DEFAULT_PULSE_MS = int(os.environ.get("PULSE_MS", "1000"))
POLL_SEC = float(os.environ.get("POLL_SEC", "2.5"))


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
        GPIO_PIN,
        active_high=RELAY_ACTIVE_HIGH,
        initial_value=False,
    )


class Relay:
    def __init__(self) -> None:
        self._dev = None
        try:
            self._dev = _load_gpio_device()
            mode = "active-high" if RELAY_ACTIVE_HIGH else "active-low"
            print(f"GPIO ready on BCM{GPIO_PIN} ({mode})", flush=True)
        except ImportError:
            print("gpiozero not available — dry-run mode (no hardware pulse)", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"GPIO init failed ({exc}) — dry-run mode", flush=True)
            self._dev = None

    def pulse(self, pulse_ms: int) -> None:
        ms = max(50, int(pulse_ms))
        if self._dev is None:
            print(f"[dry-run] pulse {ms}ms on BCM{GPIO_PIN}", flush=True)
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
            "Exempel: export PI_API_KEY=… eller /etc/rentr-door.env"
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
