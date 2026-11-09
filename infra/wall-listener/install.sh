#!/bin/bash
# Put the wall listener on the Pi. Run from the Mac:
#   infra/wall-listener/install.sh            (pi@symphony-wall.local)
#
# Gentle on purpose: on 2026-10-13 a plain `pip install` of these libraries
# coincided with the Pi's hardware watchdog rebooting it mid-afternoon. So:
# lowest CPU and disk priority, ready-made wheels only (no compiling), one
# package at a time, and the models are downloaded before the service starts.
set -euo pipefail
HOST=${1:-pi@symphony-wall.local}
HERE=$(cd "$(dirname "$0")" && pwd)

ssh "$HOST" 'mkdir -p ~/wall-listener/voices ~/wall-listener/sounds ~/.config/systemd/user'
scp -q "$HERE"/listener.py "$HERE"/endpoint.py "$HERE"/wake.py "$HERE"/requirements.txt "$HOST":wall-listener/
scp -q "$HERE"/sounds/*.wav "$HOST":wall-listener/sounds/
scp -q "$HERE"/wall-listener.service "$HOST":.config/systemd/user/wall-listener.service

ssh "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
cd ~/wall-listener
LOW="nice -n 19 ionice -c3"
[ -x venv/bin/python ] || $LOW python3 -m venv venv
$LOW venv/bin/pip install -q --upgrade pip
while read -r pkg; do
  [ -n "$pkg" ] || continue
  echo "installing $pkg"
  $LOW venv/bin/pip install -q --only-binary=:all: "$pkg"
  sleep 5
done < requirements.txt
# Models now, not on first boot.
$LOW venv/bin/python -c "from faster_whisper import WhisperModel as W; W('tiny.en', compute_type='int8'); W('base.en', compute_type='int8')"
[ -f voices/en_US-lessac-medium.onnx ] || $LOW venv/bin/python -m piper.download_voices --download-dir voices en_US-lessac-medium
systemctl --user daemon-reload
systemctl --user enable --now wall-listener
sleep 3
systemctl --user --no-pager status wall-listener | head -5
REMOTE
