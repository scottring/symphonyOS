#!/usr/bin/env bash
set -euo pipefail

# Installs the reminders-bridge launch agent for the current user.
# Idempotent: safe to re-run after code changes.

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BRIDGE_DIR="$REPO_ROOT/apple/reminders-bridge"
BIN_DIR="$HOME/.local/bin"
CONFIG_DIR="$HOME/.config/symphony-bridge"
LOG_DIR="$HOME/Library/Logs"
LAUNCHAGENT_DIR="$HOME/Library/LaunchAgents"
LABEL="com.symphony.reminders-bridge"

mkdir -p "$BIN_DIR" "$CONFIG_DIR" "$LOG_DIR" "$LAUNCHAGENT_DIR"

echo "==> Building reminders-bridge (release)"
cd "$BRIDGE_DIR"
swift build -c release

echo "==> Installing binary to $BIN_DIR"
cp ".build/release/reminders-bridge" "$BIN_DIR/reminders-bridge"
chmod 755 "$BIN_DIR/reminders-bridge"

echo "==> Generating launchd plist"
PLIST_PATH="$LAUNCHAGENT_DIR/$LABEL.plist"
sed -e "s|__BIN_PATH__|$BIN_DIR/reminders-bridge|g" \
    -e "s|__CONFIG_PATH__|$CONFIG_DIR/config.json|g" \
    -e "s|__LOG_PATH__|$LOG_DIR/symphony-reminders-bridge.log|g" \
    "$BRIDGE_DIR/com.symphony.reminders-bridge.plist.template" > "$PLIST_PATH"

if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
  echo "==> No config found at $CONFIG_DIR/config.json"
  echo "    Create one before the agent will sync. See README for shape."
  echo "    Stub:"
  cat > "$CONFIG_DIR/config.json.example" <<'EOF'
{
  "supabaseUrl": "https://YOUR-PROJECT.supabase.co",
  "serviceRoleKey": "PASTE_SERVICE_ROLE_KEY",
  "userId": "PASTE_SCOTT_USER_UUID",
  "lists": [
    { "appleListName": "Groceries", "symphonyListId": "PASTE_GROCERIES_LIST_UUID" },
    { "appleListName": "Need now",  "symphonyListId": "PASTE_NEED_NOW_LIST_UUID" }
  ]
}
EOF
  chmod 600 "$CONFIG_DIR/config.json.example"
fi

echo "==> Reloading launch agent"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"

echo "==> Done."
echo "    Tail logs: tail -f $LOG_DIR/symphony-reminders-bridge.log"
echo "    Disable:   launchctl bootout gui/\$(id -u)/$LABEL"
