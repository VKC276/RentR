#!/usr/bin/env bash
# Idempotent OS tweaks so a Pi Zero W door box does not trip itself.
# Safe to re-run from setup.sh. No-ops on non-Pi hosts.
set -euo pipefail

echo "==> Stabilitet (Wi-Fi, journal, watchdog, wait-online)"

# --- journald: SD-kortet ska inte fyllas av loggar ---
sudo mkdir -p /etc/systemd/journald.conf.d
sudo tee /etc/systemd/journald.conf.d/vkk-rental.conf >/dev/null <<'EOF'
[Journal]
SystemMaxUse=50M
RuntimeMaxUse=20M
MaxFileSec=7day
EOF
sudo systemctl restart systemd-journald 2>/dev/null || true

# --- systemd hardware watchdog (reboot om kärnan hänger) ---
sudo mkdir -p /etc/systemd/system.conf.d
sudo tee /etc/systemd/system.conf.d/vkk-watchdog.conf >/dev/null <<'EOF'
[Manager]
RuntimeWatchdogSec=30s
RebootWatchdogSec=2min
EOF

append_boot_cfg() {
  local line="$1"
  local cfg
  for cfg in /boot/firmware/config.txt /boot/config.txt; do
    if [[ -f "$cfg" ]]; then
      if grep -qE "^${line}$" "$cfg" 2>/dev/null; then
        return 0
      fi
      echo "==> ${cfg}: ${line}"
      echo "$line" | sudo tee -a "$cfg" >/dev/null
      return 0
    fi
  done
}

append_boot_cfg "dtparam=watchdog=on"

# --- Wi-Fi power save: klassisk Zero W-död (wlan somnar, poll slutar) ---
if command -v iw >/dev/null 2>&1 && iw dev wlan0 info >/dev/null 2>&1; then
  sudo iw dev wlan0 set power_save off || true
fi
if [[ -d /etc/NetworkManager/conf.d ]]; then
  sudo tee /etc/NetworkManager/conf.d/vkk-wifi-powersave-off.conf >/dev/null <<'EOF'
[connection]
wifi.powersave = 2
EOF
  sudo systemctl try-reload-or-restart NetworkManager 2>/dev/null || true
fi

# Persist powersave after each wlan up
sudo mkdir -p /etc/networkd-dispatcher/routable.d 2>/dev/null || true
if [[ -d /etc/networkd-dispatcher/routable.d ]]; then
  sudo tee /etc/networkd-dispatcher/routable.d/vkk-wifi-powersave >/dev/null <<'EOF'
#!/bin/sh
[ "$IFACE" = "wlan0" ] || exit 0
command -v iw >/dev/null && iw dev wlan0 set power_save off || true
exit 0
EOF
  sudo chmod +x /etc/networkd-dispatcher/routable.d/vkk-wifi-powersave
fi

# dhcpcd hook (older Pi OS)
if [[ -d /etc/dhcpcd.exit-hooks.d ]]; then
  sudo tee /etc/dhcpcd.exit-hooks.d/vkk-wifi-powersave >/dev/null <<'EOF'
#!/bin/sh
[ "$reason" = "BOUND" ] || [ "$reason" = "RENEW" ] || exit 0
[ "$interface" = "wlan0" ] || exit 0
command -v iw >/dev/null && iw dev wlan0 set power_save off || true
EOF
  sudo chmod +x /etc/dhcpcd.exit-hooks.d/vkk-wifi-powersave
fi

# --- vänta på nät innan dörrtjänsten startar ---
for unit in NetworkManager-wait-online.service systemd-networkd-wait-online.service; do
  if systemctl list-unit-files "$unit" 2>/dev/null | grep -q "$unit"; then
    sudo systemctl enable "$unit" 2>/dev/null || true
  fi
done

# --- klocka: TLS mot Worker kräver ungefär rätt tid ---
sudo systemctl enable --now systemd-timesyncd 2>/dev/null || true

# --- fake-hwclock så tiden inte nollställs vid boot utan RTC ---
if command -v apt-get >/dev/null 2>&1 && ! dpkg -s fake-hwclock >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y fake-hwclock >/dev/null 2>&1 || true
fi
sudo systemctl enable fake-hwclock 2>/dev/null || true

echo "    Wi-Fi powersave av, journal ≤50M, kernel watchdog, wait-online."
echo "    (Nytt dtparam=watchdog kräver omstart en gång.)"
