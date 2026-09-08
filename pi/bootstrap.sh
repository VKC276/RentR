#!/usr/bin/env bash
# One-command install + settings for VKK Rental door listener (Pi Zero W).
#
# Already cloned:
#   cd ~/RentR/pi && ./bootstrap.sh --key DIN_NYCKEL
#
# Fresh Pi (clones the repo, then installs):
#   curl -fsSL https://raw.githubusercontent.com/VKC276/RentR/main/pi/bootstrap.sh | bash -s -- --key DIN_NYCKEL
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/VKC276/RentR.git}"
CLONE_DIR="${CLONE_DIR:-$HOME/RentR}"
DEFAULT_API_URL="https://rentr-api.muddy-rice-38d4.workers.dev"
DEFAULT_GPIO_PIN="25"
DEFAULT_RELAY_ACTIVE_HIGH="1"
DEFAULT_PULSE_MS="1000"
DEFAULT_POLL_SEC="2.5"

API_URL=""
PI_API_KEY=""
HEADER_PIN=""
GPIO_PIN=""
RELAY_ACTIVE_HIGH=""
PULSE_MS=""
POLL_SEC=""
DO_INSTALL=1
ENABLE_SERVICE=1
DO_TEST=0
SKIP_APT=0
SHOW_ONLY=0
KEY_PROVIDED=0
SETTINGS_PROVIDED=0

usage() {
  cat <<EOF
Usage: ./bootstrap.sh --key DIN_NYCKEL [options]

Installerar dörrlyssnaren och skriver inställningar i ett kommando.
Standard: Raspberry Pi Zero W, GPIO BCM ${DEFAULT_GPIO_PIN} (fysisk pin 22), active-high.

Required (ny install, eller om nyckeln saknas):
  --key, --api-key VALUE   Samma värde som Worker-secret DOOR_API_KEY

Settings:
  --api-url URL            Worker-URL (default: ${DEFAULT_API_URL})
  --gpio N                 BCM-nummer (gpiozero; samma på Zero W och Pi 5)
  --header-pin N           Fysiskt hål 1–40 på headern (22 = BCM 25). gpiozero får BOARDN.
  --active-high            Relä active-high (default; idle = pin LOW)
  --active-low             Relä active-low (idle = pin HIGH)
  --pulse-ms N             Puls om Worker inte skickar pulseMs (default: ${DEFAULT_PULSE_MS})
  --poll-sec N             Poll-intervall sekunder (default: ${DEFAULT_POLL_SEC})

Install:
  --skip-install           Bara skriv .env (ingen apt/venv/systemd)
  --no-enable              Installera men starta inte tjänsten
  --skip-apt               Hoppa över apt-get (vid ominstall)
  --test                   Bara testa pollDoor (ingen ominstall). Med --key: spara + testa
  --show                   Visa inställningar och avsluta
  -h, --help               Denna hjälp

Exempel:
  ./bootstrap.sh --key 'din-hemlighet'
  ./bootstrap.sh --test
  ./bootstrap.sh --key 'din-hemlighet' --gpio 25 --test
  ./bootstrap.sh --skip-install --header-pin 22 --test
  ./bootstrap.sh --skip-install --header-pin 11 --test
  ./bootstrap.sh --skip-install --key 'ny-nyckel' --gpio 25 --test
EOF
}

resolve_dir() {
  local src="${BASH_SOURCE[0]:-}"
  if [[ -n "$src" && -f "$src" ]]; then
    local here
    here="$(cd "$(dirname "$src")" && pwd)"
    if [[ -f "$here/door_listener.py" && -f "$here/install.sh" ]]; then
      echo "$here"
      return 0
    fi
  fi
  return 1
}

ensure_repo() {
  local dir
  if dir="$(resolve_dir)"; then
    echo "$dir"
    return 0
  fi

  echo "==> Scriptet körs utanför repot — klonar ${REPO_URL} → ${CLONE_DIR}" >&2
  if [[ -d "$CLONE_DIR/.git" ]]; then
    git -C "$CLONE_DIR" pull --ff-only
  else
    git clone "$REPO_URL" "$CLONE_DIR"
  fi
  echo "$CLONE_DIR/pi"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --key|--api-key)
      shift
      [[ $# -gt 0 ]] || { echo "--key kräver ett värde" >&2; exit 1; }
      PI_API_KEY="$1"
      KEY_PROVIDED=1
      ;;
    --key=*|--api-key=*)
      PI_API_KEY="${1#*=}"
      KEY_PROVIDED=1
      ;;
    --api-url)
      shift
      [[ $# -gt 0 ]] || { echo "--api-url kräver ett värde" >&2; exit 1; }
      API_URL="$1"
      SETTINGS_PROVIDED=1
      ;;
    --api-url=*)
      API_URL="${1#*=}"
      SETTINGS_PROVIDED=1
      ;;
    --gpio)
      shift
      [[ $# -gt 0 ]] || { echo "--gpio kräver ett pin-nummer" >&2; exit 1; }
      GPIO_PIN="$1"
      HEADER_PIN=""
      SETTINGS_PROVIDED=1
      ;;
    --gpio=*)
      GPIO_PIN="${1#*=}"
      HEADER_PIN=""
      SETTINGS_PROVIDED=1
      ;;
    --header-pin|--board|--header)
      shift
      [[ $# -gt 0 ]] || { echo "--header-pin kräver fysiskt pin-nummer 1-40" >&2; exit 1; }
      HEADER_PIN="$1"
      SETTINGS_PROVIDED=1
      ;;
    --header-pin=*|--board=*|--header=*)
      HEADER_PIN="${1#*=}"
      SETTINGS_PROVIDED=1
      ;;
    --active-low) RELAY_ACTIVE_HIGH="0"; SETTINGS_PROVIDED=1 ;;
    --active-high) RELAY_ACTIVE_HIGH="1"; SETTINGS_PROVIDED=1 ;;
    --pulse-ms)
      shift
      [[ $# -gt 0 ]] || { echo "--pulse-ms kräver ett värde" >&2; exit 1; }
      PULSE_MS="$1"
      SETTINGS_PROVIDED=1
      ;;
    --pulse-ms=*)
      PULSE_MS="${1#*=}"
      SETTINGS_PROVIDED=1
      ;;
    --poll-sec)
      shift
      [[ $# -gt 0 ]] || { echo "--poll-sec kräver ett värde" >&2; exit 1; }
      POLL_SEC="$1"
      SETTINGS_PROVIDED=1
      ;;
    --poll-sec=*)
      POLL_SEC="${1#*=}"
      SETTINGS_PROVIDED=1
      ;;
    --skip-install) DO_INSTALL=0 ;;
    --no-enable) ENABLE_SERVICE=0 ;;
    --skip-apt) SKIP_APT=1 ;;
    --test) DO_TEST=1 ;;
    --show) SHOW_ONLY=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Okänd flagga: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

DIR="$(ensure_repo)"
cd "$DIR"
chmod +x "$DIR"/*.sh 2>/dev/null || true
export ENV_FILE="${ENV_FILE:-/etc/vkk-rental-door.env}"

if [[ "$SHOW_ONLY" -eq 1 ]]; then
  "$DIR/configure.sh" --show
  exit 0
fi

# Bare --test must not reinstall or rewrite .env (stale/placeholder key → 401).
if [[ "$DO_TEST" -eq 1 && "$KEY_PROVIDED" -eq 0 && "$SETTINGS_PROVIDED" -eq 0 ]]; then
  echo "==> Testar pollDoor mot Worker (ingen install, ingen .env-ändring)"
  "$DIR/configure.sh" --show || true
  "$DIR/configure.sh" --test
  exit $?
fi

GPIO_PIN="${GPIO_PIN:-$DEFAULT_GPIO_PIN}"
RELAY_ACTIVE_HIGH="${RELAY_ACTIVE_HIGH:-$DEFAULT_RELAY_ACTIVE_HIGH}"
PULSE_MS="${PULSE_MS:-$DEFAULT_PULSE_MS}"
POLL_SEC="${POLL_SEC:-$DEFAULT_POLL_SEC}"
API_URL="${API_URL:-$DEFAULT_API_URL}"

if [[ -z "$PI_API_KEY" ]]; then
  existing_key=""
  if [[ -f /etc/vkk-rental-door.env ]] || [[ -f /etc/rentr-door.env ]]; then
    existing_key="$("$DIR/configure.sh" --show 2>/dev/null | grep 'PI_API_KEY' || true)"
  fi
  if [[ -z "$existing_key" || "$existing_key" == *"(tom)"* ]]; then
    echo "Saknar --key / PI_API_KEY. Samma värde som Worker-secret DOOR_API_KEY." >&2
    echo "  ./bootstrap.sh --key 'din-hemlighet'" >&2
    exit 1
  fi
fi

if [[ "$DO_INSTALL" -eq 1 ]]; then
  INSTALL_ARGS=()
  if [[ "$ENABLE_SERVICE" -eq 1 ]]; then
    INSTALL_ARGS+=(--enable)
  fi
  if [[ "$SKIP_APT" -eq 1 ]]; then
    INSTALL_ARGS+=(--skip-apt)
  fi
  echo "==> Installerar paketet (Pi Zero W, BCM ${GPIO_PIN}${HEADER_PIN:+ / fysisk pin $HEADER_PIN})"
  "$DIR/install.sh" "${INSTALL_ARGS[@]+"${INSTALL_ARGS[@]}"}"
fi

SET_ARGS=(
  --set "GPIO_PIN=${GPIO_PIN}"
  --set "RELAY_ACTIVE_HIGH=${RELAY_ACTIVE_HIGH}"
  --set "PULSE_MS=${PULSE_MS}"
  --set "POLL_SEC=${POLL_SEC}"
  --set "API_URL=${API_URL}"
)
if [[ -n "$HEADER_PIN" ]]; then
  SET_ARGS+=(--set "HEADER_PIN=${HEADER_PIN}")
fi
if [[ -n "$PI_API_KEY" ]]; then
  SET_ARGS+=(--set "PI_API_KEY=${PI_API_KEY}")
fi

echo "==> Skriver inställningar"
CONFIG_ARGS=("${SET_ARGS[@]}")
if [[ "$ENABLE_SERVICE" -eq 1 ]] && systemctl list-unit-files vkk-rental-door.service 2>/dev/null | grep -q vkk-rental-door; then
  CONFIG_ARGS+=(--restart)
fi
if [[ "$DO_TEST" -eq 1 ]]; then
  CONFIG_ARGS+=(--test)
fi
"$DIR/configure.sh" "${CONFIG_ARGS[@]}"

echo
echo "Klart (BCM ${GPIO_PIN}${HEADER_PIN:+ = fysisk pin $HEADER_PIN})."
echo "  Status:  sudo systemctl status vkk-rental-door"
echo "  Loggar:  sudo journalctl -u vkk-rental-door -f"
echo "  Ändra:   $DIR/bootstrap.sh --skip-install --header-pin 22"
echo "  Visa:    $DIR/configure.sh --show"
