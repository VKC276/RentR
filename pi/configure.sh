#!/usr/bin/env bash
# Interactive helper to view/edit /etc/vkk-rental-door.env without nano.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-/etc/vkk-rental-door.env}"
LEGACY_ENV="/etc/rentr-door.env"
EXAMPLE="$DIR/vkk-rental-door.env.example"
USER_NAME="$(id -un)"
SERVICE_NAME="vkk-rental-door"

DEFAULT_API_URL="https://rentr-api.muddy-rice-38d4.workers.dev"

usage() {
  cat <<EOF
Usage: ./configure.sh [options]

Interactive (default):
  ./configure.sh

Non-interactive:
  ./configure.sh --set PI_API_KEY=yourSecret
  ./configure.sh --set GPIO_PIN=25 --set RELAY_ACTIVE_HIGH=0
  ./configure.sh --set HEADER_PIN=22
  ./configure.sh --show
  ./configure.sh --test
  ./configure.sh --restart

Options:
  --show           Show current settings (API key masked)
  --set KEY=VALUE  Set one or more values, then save
  --test           Run test_api.py
  --restart        Restart ${SERVICE_NAME} service
  -h, --help       This help
EOF
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" && -f "$LEGACY_ENV" ]]; then
    echo "Migrerar $LEGACY_ENV → $ENV_FILE"
    sudo cp "$LEGACY_ENV" "$ENV_FILE"
  fi
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "Skapar $ENV_FILE från mall…"
    sudo cp "$EXAMPLE" "$ENV_FILE"
  fi
  sudo chown "root:${USER_NAME}" "$ENV_FILE"
  sudo chmod 640 "$ENV_FILE"
}

read_env() {
  ensure_env_file
  API_URL="$DEFAULT_API_URL"
  PI_API_KEY=""
  GPIO_PIN="25"
  HEADER_PIN=""
  RELAY_ACTIVE_HIGH="0"
  PULSE_MS="1000"
  POLL_SEC="2.5"

  # shellcheck disable=SC2162
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *=* ]] && continue
    key="${line%%=*}"
    val="${line#*=}"
    key="$(echo "$key" | xargs)"
    val="$(echo "$val" | xargs)"
    val="${val%\"}"
    val="${val#\"}"
    val="${val%\'}"
    val="${val#\'}"
    case "$key" in
      API_URL) API_URL="$val" ;;
      PI_API_KEY) PI_API_KEY="$val" ;;
      GPIO_PIN) GPIO_PIN="$val" ;;
      HEADER_PIN) HEADER_PIN="$val" ;;
      RELAY_ACTIVE_HIGH) RELAY_ACTIVE_HIGH="$val" ;;
      PULSE_MS) PULSE_MS="$val" ;;
      POLL_SEC) POLL_SEC="$val" ;;
    esac
  done < <(sudo cat "$ENV_FILE")
}

mask_key() {
  local k="${1:-}"
  if [[ -z "$k" ]]; then
    echo "(tom)"
    return
  fi
  if [[ ${#k} -le 6 ]]; then
    echo "***"
    return
  fi
  echo "${k:0:3}…${k: -3} (len=${#k})"
}

physical_pin() {
  case "${1:-}" in
    2) echo 3 ;;
    3) echo 5 ;;
    4) echo 7 ;;
    14) echo 8 ;;
    15) echo 10 ;;
    17) echo 11 ;;
    18) echo 12 ;;
    27) echo 13 ;;
    22) echo 15 ;;
    23) echo 16 ;;
    24) echo 18 ;;
    10) echo 19 ;;
    9) echo 21 ;;
    25) echo 22 ;;
    11) echo 23 ;;
    8) echo 24 ;;
    7) echo 26 ;;
    5) echo 29 ;;
    6) echo 31 ;;
    12) echo 32 ;;
    13) echo 33 ;;
    19) echo 35 ;;
    16) echo 36 ;;
    26) echo 37 ;;
    20) echo 38 ;;
    21) echo 40 ;;
    *) echo "?" ;;
  esac
}

bcm_from_header() {
  case "${1:-}" in
    3) echo 2 ;;
    5) echo 3 ;;
    7) echo 4 ;;
    8) echo 14 ;;
    10) echo 15 ;;
    11) echo 17 ;;
    12) echo 18 ;;
    13) echo 27 ;;
    15) echo 22 ;;
    16) echo 23 ;;
    18) echo 24 ;;
    19) echo 10 ;;
    21) echo 9 ;;
    22) echo 25 ;;
    23) echo 11 ;;
    24) echo 8 ;;
    26) echo 7 ;;
    29) echo 5 ;;
    31) echo 6 ;;
    32) echo 12 ;;
    33) echo 13 ;;
    35) echo 19 ;;
    36) echo 16 ;;
    37) echo 26 ;;
    38) echo 20 ;;
    40) echo 21 ;;
    *) echo "?" ;;
  esac
}

sync_pins() {
  # HEADER_PIN (physical hole) is the human setting; GPIO_PIN is BCM for gpiozero.
  if [[ -n "${HEADER_PIN:-}" ]]; then
    local bcm
    bcm="$(bcm_from_header "$HEADER_PIN")"
    if [[ "$bcm" == "?" ]]; then
      echo "HEADER_PIN=${HEADER_PIN} är inte GPIO. Pin 25 är GND; relä IN på pin 22 = BCM 25." >&2
      exit 1
    fi
    GPIO_PIN="$bcm"
  elif [[ -n "${GPIO_PIN:-}" ]]; then
    HEADER_PIN="$(physical_pin "$GPIO_PIN")"
    if [[ "$HEADER_PIN" == "?" ]]; then
      HEADER_PIN=""
    fi
  fi
}

show_env() {
  read_env
  sync_pins
  echo "Fil: $ENV_FILE"
  echo "  API_URL           = $API_URL"
  echo "  PI_API_KEY        = $(mask_key "$PI_API_KEY")"
  echo "  HEADER_PIN        = ${HEADER_PIN:-?}  (fysiskt hål 1–40 på headern)"
  echo "  GPIO_PIN          = $GPIO_PIN  (BCM, gpiozero-nummer — samma på Zero W och Pi 5)"
  echo "  RELAY_ACTIVE_HIGH = $RELAY_ACTIVE_HIGH  (0=active-low, idle pin HIGH)"
  echo "  PULSE_MS          = $PULSE_MS"
  echo "  POLL_SEC          = $POLL_SEC"
}

write_env() {
  sync_pins
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp" <<EOF
# VKK Rental door listener — managed by configure.sh / install
API_URL=${API_URL}
PI_API_KEY=${PI_API_KEY}

GPIO_PIN=${GPIO_PIN}
HEADER_PIN=${HEADER_PIN}
RELAY_ACTIVE_HIGH=${RELAY_ACTIVE_HIGH}
PULSE_MS=${PULSE_MS}
POLL_SEC=${POLL_SEC}
EOF
  sudo cp "$tmp" "$ENV_FILE"
  rm -f "$tmp"
  sudo chown "root:${USER_NAME}" "$ENV_FILE"
  sudo chmod 640 "$ENV_FILE"
  if [[ -f "$DIR/.env" ]]; then
    rm -f "$DIR/.env"
    echo "Tog bort $DIR/.env (använd $ENV_FILE)."
  fi
  echo "Sparat → $ENV_FILE"
}

prompt_value() {
  local label="$1"
  local current="$2"
  local input
  if [[ -n "$current" ]]; then
    read -r -p "$label [$current]: " input || true
  else
    read -r -p "$label: " input || true
  fi
  if [[ -n "${input:-}" ]]; then
    echo "$input"
  else
    echo "$current"
  fi
}

interactive() {
  read_env
  echo
  echo "=== VKK Rental — konfigurera dörr (.env) ==="
  echo "Enter = behåll nuvarande värde"
  echo
  API_URL="$(prompt_value "API_URL" "$API_URL")"
  echo "PI_API_KEY nu: $(mask_key "$PI_API_KEY")"
  local new_key
  read -r -p "PI_API_KEY (klistra in ny, eller Enter behåll): " new_key || true
  if [[ -n "${new_key:-}" ]]; then
    PI_API_KEY="$new_key"
  fi
  GPIO_PIN="$(prompt_value "GPIO_PIN BCM (eller Enter och sätt HEADER_PIN)" "$GPIO_PIN")"
  HEADER_PIN="$(prompt_value "HEADER_PIN fysisk hål 1-40 (22=BCM25, 11=BCM17)" "${HEADER_PIN:-$(physical_pin "$GPIO_PIN")}")"
  sync_pins
  RELAY_ACTIVE_HIGH="$(prompt_value "RELAY_ACTIVE_HIGH (0=active-low, 1=active-high)" "$RELAY_ACTIVE_HIGH")"
  PULSE_MS="$(prompt_value "PULSE_MS" "$PULSE_MS")"
  POLL_SEC="$(prompt_value "POLL_SEC" "$POLL_SEC")"

  echo
  show_env
  echo
  read -r -p "Spara? [Y/n] " ans || true
  ans="${ans:-Y}"
  if [[ "$ans" =~ ^[Nn] ]]; then
    echo "Avbrutet."
    exit 0
  fi
  write_env

  read -r -p "Testa API nu? [Y/n] " ans || true
  ans="${ans:-Y}"
  if [[ ! "$ans" =~ ^[Nn] ]]; then
    run_test || true
  fi

  if systemctl list-unit-files "$SERVICE_NAME.service" >/dev/null 2>&1; then
    read -r -p "Starta om tjänsten ${SERVICE_NAME}? [Y/n] " ans || true
    ans="${ans:-Y}"
    if [[ ! "$ans" =~ ^[Nn] ]]; then
      restart_service
    fi
  fi
}

run_test() {
  if [[ ! -x "$DIR/.venv/bin/python" ]]; then
    echo "Venv saknas. Kör först: ./install.sh --enable" >&2
    return 1
  fi
  ENV_FILE="$ENV_FILE" "$DIR/.venv/bin/python" "$DIR/test_api.py"
}

restart_service() {
  sudo systemctl restart "$SERVICE_NAME"
  sudo systemctl --no-pager --full status "$SERVICE_NAME" || true
}

SET_ARGS=()
DO_SHOW=0
DO_TEST=0
DO_RESTART=0
DO_INTERACTIVE=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --show) DO_SHOW=1; DO_INTERACTIVE=0 ;;
    --test) DO_TEST=1; DO_INTERACTIVE=0 ;;
    --restart) DO_RESTART=1; DO_INTERACTIVE=0 ;;
    --set)
      shift
      [[ $# -gt 0 ]] || { echo "--set requires KEY=VALUE" >&2; exit 1; }
      SET_ARGS+=("$1")
      DO_INTERACTIVE=0
      ;;
    --set=*)
      SET_ARGS+=("${1#--set=}")
      DO_INTERACTIVE=0
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

if [[ "$DO_INTERACTIVE" -eq 1 ]]; then
  interactive
  exit 0
fi

if [[ ${#SET_ARGS[@]} -gt 0 ]]; then
  read_env
  for pair in "${SET_ARGS[@]}"; do
    [[ "$pair" == *=* ]] || { echo "Ogiltigt --set: $pair (förväntar KEY=VALUE)" >&2; exit 1; }
    key="${pair%%=*}"
    val="${pair#*=}"
    case "$key" in
      API_URL) API_URL="$val" ;;
      PI_API_KEY) PI_API_KEY="$val" ;;
      GPIO_PIN) GPIO_PIN="$val"; HEADER_PIN="" ;;
      HEADER_PIN) HEADER_PIN="$val" ;;
      RELAY_ACTIVE_HIGH) RELAY_ACTIVE_HIGH="$val" ;;
      PULSE_MS) PULSE_MS="$val" ;;
      POLL_SEC) POLL_SEC="$val" ;;
      *) echo "Okänd nyckel: $key" >&2; exit 1 ;;
    esac
  done
  write_env
  show_env
fi

if [[ "$DO_SHOW" -eq 1 ]]; then
  show_env
fi

if [[ "$DO_TEST" -eq 1 ]]; then
  run_test
fi

if [[ "$DO_RESTART" -eq 1 ]]; then
  restart_service
fi
