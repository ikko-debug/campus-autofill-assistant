#!/bin/sh
set -eu

chrome_bin="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
error_file=$(mktemp)
trap 'rm -f "$error_file"' EXIT

if [ ! -x "$chrome_bin" ]; then
  echo "Chrome not found: set CHROME_BIN to a Chromium-compatible executable" >&2
  exit 1
fi

for fixture in fixture.html generic-fixture.html feishu-fixture.html profile-fixture.html zhiye-fixture.html popup-fixture.html selection-fixture.html options-fixture.html; do
  if ! output=$(
    "$chrome_bin" \
      --headless=new \
      --disable-gpu \
      --no-first-run \
      --allow-file-access-from-files \
      --virtual-time-budget=2000 \
      --dump-dom "file://$repo_dir/tests/$fixture" 2>"$error_file"
  ); then
    echo "Chrome failed while running $fixture" >&2
    sed -n '1,80p' "$error_file" >&2
    exit 1
  fi
  case "$output" in
    *">PASS "*) echo "PASS $fixture" ;;
    *)
      echo "FAIL $fixture" >&2
      echo "$output" | sed -n '/test-result/p' >&2
      exit 1
      ;;
  esac
done
