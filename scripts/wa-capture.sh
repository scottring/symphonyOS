#!/usr/bin/env bash
# Send a WhatsApp "Export Chat" to Symphony's capture pipeline.
# Usage: scripts/wa-capture.sh <export.zip|_chat.txt> "<source-key>"
#   e.g. scripts/wa-capture.sh ~/Downloads/"WhatsApp Chat - HEMs Second Graders.zip" "whatsapp:HEMs"
# Reuse the SAME <source-key> for a chat every time -> only NEW messages are processed.
# Reads EMAIL and SECRET from ~/.config/symphony/capture.env  (lines: EMAIL=... and SECRET=...)
set -euo pipefail
SRC="${1:?usage: wa-capture.sh <export.zip|_chat.txt> <source-key>}"
SK="${2:?provide a stable source-key, e.g. whatsapp:HEMs}"
CFG="$HOME/.config/symphony/capture.env"
[ -f "$CFG" ] || { echo "Create $CFG with two lines: EMAIL=you@example.com and SECRET=<capture-shared-secret>"; exit 1; }
# shellcheck disable=SC1090
source "$CFG"
: "${EMAIL:?set EMAIL in $CFG}"; : "${SECRET:?set SECRET in $CFG}"
ENDPOINT="https://mwadppyrqzuzgstmwpuy.supabase.co/functions/v1/capture-to-inbox"
TXT="$SRC"
case "$SRC" in *.zip) TMP="$(mktemp -d)"; unzip -o "$SRC" -d "$TMP" >/dev/null; TXT="$(find "$TMP" -iname '*.txt' | head -1)";; esac
[ -f "$TXT" ] || { echo "No chat .txt found in $SRC"; exit 1; }
jq -Rs --arg email "$EMAIL" --arg sk "$SK" \
  '{user_email:$email, kind:"whatsapp_export", source_key:$sk, source_label:$sk, text:.}' < "$TXT" \
| curl -s -X POST "$ENDPOINT" -H "x-capture-secret: $SECRET" -H "content-type: application/json" --data @-
echo
