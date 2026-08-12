#!/usr/bin/env bash
# Install / update VKK Rental door listener on Raspberry Pi OS (Pi 5).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
USER_NAME="$(id -un)"
VENV="$DIR/.venv"
ENV_FILE="${ENV_FILE:-/etc/rentr-door.env}"
SERVICE_NAME="rentr-door"
ENABLE_SERVICE=0
SKIP_APT=0
RUN_CONFIGURE=0

usage() {
  cat <<EOF
Usage: ./install.sh [options]

Options:
  --enable      Install and enable systemd service (starts on boot)
  --configure   Run ./configure.sh after install (env helper, no nano)
  --skip-apt    Do not apt-install python3-venv / python3-lgpio
  -h, --help    Show this help

New Pi tip: ./setup.sh   (install + configure + enable)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --enable) ENABLE_SERVICE=1 ;;
    --configure) RUN_CONFIGURE=1 ;;
    --skip-apt) SKIP_APT=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

echo "==> VKK Rental door package"
echo "    dir:  $DIR"
echo "    user: $USER_NAME"

if [[ "$SKIP_APT" -eq 0 ]]; then
  if command -v apt-get >/dev/null 2>&1; then
    echo "==> System packages"
    sudo apt-get update -qq
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y python3-venv python3-pip python3-lgpio
  else
    echo "apt-get saknas — hoppar över systempaket"
  fi
fi

echo "==> Python venv (system-site-packages so apt python3-lgpio is visible)"
python3 -m venv --system-site-packages "$VENV"
# shellcheck disable=SC1091
source "$VENV/bin/activate"
pip install --upgrade pip
pip install -r "$DIR/requirements.txt"

if ! "$VENV/bin/python" -c "import lgpio" 2>/dev/null; then
  echo "VARNING: python-modulen lgpio hittades inte." >&2
  echo "         Kör: sudo apt-get install -y python3-lgpio" >&2
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "==> Creating $ENV_FILE from example"
  sudo cp "$DIR/rentr-door.env.example" "$ENV_FILE"
else
  echo "==> Env already exists: $ENV_FILE"
fi
sudo chown "root:${USER_NAME}" "$ENV_FILE"
sudo chmod 640 "$ENV_FILE"

# Stale local .env overrides caused 401s — do not create one.
if [[ -f "$DIR/.env" ]]; then
  echo "==> Removing stale $DIR/.env (canonical file is $ENV_FILE)"
  rm -f "$DIR/.env"
fi

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
echo "==> Writing $UNIT_PATH"
sudo tee "$UNIT_PATH" >/dev/null <<EOF
[Unit]
Description=VKK Rental door relay listener
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${USER_NAME}
Group=${USER_NAME}
WorkingDirectory=${DIR}
Environment=ENV_FILE=${ENV_FILE}
ExecStart=${VENV}/bin/python ${DIR}/door_listener.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload

if [[ "$ENABLE_SERVICE" -eq 1 ]]; then
  echo "==> Enabling and restarting ${SERVICE_NAME}"
  sudo systemctl enable "$SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"
  sudo systemctl --no-pager --full status "$SERVICE_NAME" || true
else
  echo "==> Service unit installed"
  echo "    Start:   sudo systemctl enable --now ${SERVICE_NAME}"
  echo "    Logs:    sudo journalctl -u ${SERVICE_NAME} -f"
fi

if [[ "$RUN_CONFIGURE" -eq 1 ]]; then
  echo "==> configure.sh"
  "$DIR/configure.sh"
fi

echo
echo "Klart."
echo "  Konfigurera:  $DIR/configure.sh"
echo "  Testa API:    $VENV/bin/python $DIR/test_api.py"
echo "  Loggar:       sudo journalctl -u ${SERVICE_NAME} -f"
echo "  Uppdatera:    $DIR/update.sh --enable"
