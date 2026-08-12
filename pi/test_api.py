#!/usr/bin/env python3
"""One-shot API check: pollDoor against the Worker (no GPIO pulse)."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Reuse env loading from the listener without importing GPIO side effects heavily.
sys.path.insert(0, str(Path(__file__).resolve().parent))

import door_listener as dl  # noqa: E402


def main() -> None:
    if not dl.API_KEY:
        print("PI_API_KEY saknas. Sätt i /etc/rentr-door.env eller pi/.env", file=sys.stderr)
        sys.exit(1)
    print(f"API_URL = {dl.API_URL}")
    print("Calling pollDoor…")
    try:
        data = dl.api_call("pollDoor")
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(2)
    print(json.dumps(data, indent=2, ensure_ascii=False))
    cmd = data.get("command") if isinstance(data, dict) else None
    if cmd:
        print(f"Pending command: {cmd.get('id')} pulseMs={cmd.get('pulseMs')}")
        print("(Kör door_listener.py för att pulsa reläet och markera done.)")
    else:
        print("Inget pending-kommando just nu (det är OK).")
    print("OK")


if __name__ == "__main__":
    main()
