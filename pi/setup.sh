#!/usr/bin/env bash
# VKK Rental door — the only command you need on the Pi.
#
#   git clone https://github.com/VKC276/RentR.git
#   cd ~/RentR/pi
#   ./setup.sh 'DIN_DOOR_API_KEY'
#
# Later (code update, same key):
#   ./setup.sh
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
REPO_URL="${REPO_URL:-https://github.com/VKC276/RentR.git}"
CLONE_DIR="${CLONE_DIR:-$HOME/RentR}"
ENV_FILE="${ENV_FILE:-/etc/vkk-rental-door.env}"
SERVICE_NAME="vkk-rental-door"

# Hardware for this installation (Pi Zero W relay).
API_URL="https://rentr-api.muddy-rice-38d4.workers.dev"
GPIO_PIN="25"
HEADER_PIN="22"
RELAY_ACTIVE_HIGH="1"
PULSE_MS="1000"
POLL_SEC="2.5"

PI_API_KEY=""
DO_PULL=1
SKIP_APT=0
ONLY_SHOW=0
ONLY_TEST=0
ORIG_ARGS=("$@")

usage() {
  cat <<EOF
Usage: ./setup.sh [API_KEY]

Installerar/uppdaterar dörrlyssnaren och startar den.
Standard: BCM 25 (hål 22), active-high.

  ./setup.sh 'DIN_DOOR_API_KEY'   första gången, eller ny nyckel
  ./setup.sh                      git pull + ominstall (nyckel behålls)
  ./setup.sh --show               visa inställningar
  ./setup.sh --test               testa pollDoor

Ny Pi:
  git clone ${REPO_URL}
  cd ~/RentR/pi && ./setup.sh 'DIN_DOOR_API_KEY'
EOF
}

has_key() {
  local f=""
  if [[ -f "$ENV_FILE" ]]; then
    f="$ENV_FILE"
  elif [[ -f /etc/rentr-door.env ]]; then
    f=/etc/rentr-door.env
  else
    return 1
  fi
  local val
  val="$(sudo grep -E '^[[:space:]]*PI_API_KEY=' "$f" 2>/dev/null | tail -1 | cut -d= -f2- || true)"
  val="${val%\"}"
  val="${val#\"}"
  val="${val%\'}"
  val="${val#\'}"
  val="${val#"${val%%[![:space:]]*}"}"
  val="${val%"${val##*[![:space:]]}"}"
  [[ -n "$val" && "$val" != "replace-with-DOOR_API_KEY-secret" ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --show) ONLY_SHOW=1 ;;
    --test) ONLY_TEST=1 ;;
    --no-pull) DO_PULL=0 ;;
    --skip-apt) SKIP_APT=1 ;;
    --key|--api-key)
      shift
      [[ $# -gt 0 ]] || { echo "--key kräver ett värde" >&2; exit 1; }
      PI_API_KEY="$1"
      ;;
    --key=*|--api-key=*)
      PI_API_KEY="${1#*=}"
      ;;
    --*)
      echo "Okänd flagga: $1 (prova ./setup.sh --help)" >&2
      exit 1
      ;;
    *)
      if [[ -n "$PI_API_KEY" ]]; then
        echo "Oväntat argument: $1" >&2
        exit 1
      fi
      PI_API_KEY="$1"
      ;;
  esac
  shift
done

# Piped from curl: clone repo, then re-run the real setup.sh.
if [[ ! -f "$DIR/door_listener.py" || ! -f "$DIR/install.sh" ]]; then
  echo "==> Klonar ${REPO_URL} → ${CLONE_DIR}"
  if [[ -d "$CLONE_DIR/.git" ]]; then
    git -C "$CLONE_DIR" pull --ff-only
  else
    git clone "$REPO_URL" "$CLONE_DIR"
  fi
  exec "$CLONE_DIR/pi/setup.sh" "${ORIG_ARGS[@]}"
fi

export ENV_FILE
chmod +x "$DIR"/*.sh 2>/dev/null || true

if [[ "$ONLY_SHOW" -eq 1 ]]; then
  exec "$DIR/configure.sh" --show
fi
if [[ "$ONLY_TEST" -eq 1 ]]; then
  exec "$DIR/configure.sh" --test
fi

if [[ "$DO_PULL" -eq 1 ]] && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "==> git pull"
  git -C "$ROOT" pull --ff-only || {
    echo "git pull misslyckades (lokala ändringar?). Fortsätter med nuvarande filer." >&2
  }
fi

if [[ -z "$PI_API_KEY" ]] && ! has_key; then
  if [[ -t 0 ]]; then
    echo "Klistra in Worker-secret DOOR_API_KEY (samma som PI_API_KEY)."
    read -r -p "API-nyckel: " PI_API_KEY
  fi
  if [[ -z "$PI_API_KEY" ]]; then
    echo "Saknar API-nyckel. Kör:" >&2
    echo "  ./setup.sh 'DIN_DOOR_API_KEY'" >&2
    exit 1
  fi
fi

echo "==> Installerar (venv + systemd ${SERVICE_NAME})"
INSTALL_ARGS=(--enable)
if [[ "$SKIP_APT" -eq 1 ]]; then
  INSTALL_ARGS+=(--skip-apt)
fi
"$DIR/install.sh" "${INSTALL_ARGS[@]}"

if [[ -x "$DIR/harden.sh" ]]; then
  "$DIR/harden.sh" || echo "harden.sh varnade — dörrtjänsten installeras ändå." >&2
fi

echo "==> Skriver /etc/vkk-rental-door.env (BCM ${GPIO_PIN}, active-high)"
CONFIG_ARGS=(
  --set "API_URL=${API_URL}"
  --set "GPIO_PIN=${GPIO_PIN}"
  --set "HEADER_PIN=${HEADER_PIN}"
  --set "RELAY_ACTIVE_HIGH=${RELAY_ACTIVE_HIGH}"
  --set "PULSE_MS=${PULSE_MS}"
  --set "POLL_SEC=${POLL_SEC}"
)
if [[ -n "$PI_API_KEY" ]]; then
  CONFIG_ARGS+=(--set "PI_API_KEY=${PI_API_KEY}")
fi
"$DIR/configure.sh" "${CONFIG_ARGS[@]}" --restart
echo "==> Testar pollDoor"
"$DIR/configure.sh" --test

echo
echo "Igång. Relä IN = BCM 25 (hål 22), active-high."
echo "  Loggar:  sudo journalctl -u ${SERVICE_NAME} -f"
echo "  Status:  sudo systemctl status ${SERVICE_NAME}"
echo "  Senare:  cd ~/RentR/pi && ./setup.sh"
