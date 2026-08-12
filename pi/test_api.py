#!/usr/bin/env python3
"""One-shot API check: pollDoor against the Worker (no GPIO)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

print("test_api starting…", flush=True)

sys.path.insert(0, str(Path(__file__).resolve().parent))
import door_listener as dl  # noqa: E402

print("env loaded", flush=True)


def main() -> None:
    key = dl.API_KEY
    if not key:
        print(
            "PI_API_KEY saknas. Sätt i /etc/rentr-door.env eller ta bort gammal pi/.env",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(1)

    # Show fingerprint only — never print the full secret.
    print(f"API_URL = {dl.API_URL}", flush=True)
    print(
        f"PI_API_KEY length={len(key)} prefix={key[:3]!r} suffix={key[-3:]!r}",
        flush=True,
    )
    print("Calling pollDoor (timeout 30s)…", flush=True)
    try:
        data = dl.api_call("pollDoor")
    except Exception as exc:  # noqa: BLE001
        print(f"FAIL: {exc}", file=sys.stderr, flush=True)
        print(
            "Tips: samma ASCII-nyckel i Worker DOOR_API_KEY och /etc/rentr-door.env; "
            "ta bort ~/RentR/pi/.env om den har en gammal nyckel.",
            file=sys.stderr,
            flush=True,
        )
        sys.exit(2)
    print(json.dumps(data, indent=2, ensure_ascii=False), flush=True)
    cmd = data.get("command") if isinstance(data, dict) else None
    if cmd:
        print(f"Pending command: {cmd.get('id')} pulseMs={cmd.get('pulseMs')}", flush=True)
        print("(Kör door_listener / tjänsten för att pulsa reläet.)", flush=True)
    else:
        print("Inget pending-kommando just nu (det är OK).", flush=True)
    print("OK", flush=True)


if __name__ == "__main__":
    main()
