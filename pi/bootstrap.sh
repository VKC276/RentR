#!/usr/bin/env bash
# Bakåtkompatibilitet — använd ./setup.sh
exec "$(cd "$(dirname "$0")" && pwd)/setup.sh" "$@"
