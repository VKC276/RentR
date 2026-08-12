#!/usr/bin/env bash
# Pull latest from git and reinstall the door listener package.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

echo "==> Git pull ($ROOT)"
if git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git -C "$ROOT" pull --ff-only
else
  echo "Inte ett git-repo. Klona först:" >&2
  echo "  git clone https://github.com/VKC276/RentR.git" >&2
  exit 1
fi

echo "==> Reinstall"
exec "$DIR/install.sh" "$@"
