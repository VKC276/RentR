#!/usr/bin/env bash
# One-shot setup for a new Raspberry Pi: install + configure env + enable service.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== VKK Rental dörrpaket — ny installation ==="
echo

"$DIR/install.sh" --enable

echo
echo "=== Konfigurera API-nyckel och GPIO (utan nano) ==="
"$DIR/configure.sh"

echo
echo "Klart. Följ loggar med:"
echo "  sudo journalctl -u vkk-rental-door -f"
echo
echo "Ändra .env senare:"
echo "  ./configure.sh"
echo "  ./configure.sh --set PI_API_KEY=nyckel --restart --test"
