#!/usr/bin/env bash
set -euo pipefail

# This check enforces app/js as the canonical runtime tree.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_JS_DIR="$REPO_ROOT/app/js"
ROOT_JS_DIR="$REPO_ROOT/js"

if [[ ! -d "$APP_JS_DIR" || ! -d "$ROOT_JS_DIR" ]]; then
  echo "[guard] app/js or js directory missing; skipping duplicate check."
  exit 0
fi

tmp_app="$(mktemp)"
tmp_root="$(mktemp)"
tmp_dups="$(mktemp)"
cleanup() {
  rm -f "$tmp_app" "$tmp_root" "$tmp_dups"
}
trap cleanup EXIT

find "$APP_JS_DIR" -maxdepth 1 -type f -name '*.js' -exec basename {} \; | sort -u > "$tmp_app"
find "$ROOT_JS_DIR" -maxdepth 1 -type f -name '*.js' -exec basename {} \; | sort -u > "$tmp_root"

comm -12 "$tmp_app" "$tmp_root" > "$tmp_dups"

if [[ -s "$tmp_dups" ]]; then
  echo "[guard] Duplicate runtime modules detected between app/js and js:"
  cat "$tmp_dups" | sed 's/^/  - /'
  echo "[guard] Move runtime code to app/js only (root js is landing-only)."
  exit 1
fi

echo "[guard] No duplicate runtime modules found."
