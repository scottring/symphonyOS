#!/usr/bin/env bash
set -euo pipefail

# Installs the reminders-bridge launch agent for the current user.
# Idempotent: safe to re-run after code changes.
#
# macOS TCC requires the bridge to run as a properly-signed .app bundle
# launched via /usr/bin/open — direct invocation of the SwiftPM binary
# gets silently denied Reminders access. So this script:
#   1. Builds the binary in release mode
#   2. Wraps it as RemindersBridge.app under ~/.local/share/
#   3. Ad-hoc code-signs the bundle
#   4. Generates a launchd plist that runs `open` against the bundle

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BRIDGE_DIR="$REPO_ROOT/apple/reminders-bridge"
APP_DIR="$HOME/.local/share"
APP_PATH="$APP_DIR/RemindersBridge.app"
CONFIG_DIR="$HOME/.config/symphony-bridge"
LOG_DIR="$HOME/Library/Logs"
LAUNCHAGENT_DIR="$HOME/Library/LaunchAgents"
LABEL="com.symphony.reminders-bridge"
LOG_PATH="$LOG_DIR/symphony-reminders-bridge.log"

mkdir -p "$APP_DIR" "$CONFIG_DIR" "$LOG_DIR" "$LAUNCHAGENT_DIR"

echo "==> Building reminders-bridge (release)"
cd "$BRIDGE_DIR"
swift build -c release

echo "==> Wrapping as .app bundle at $APP_PATH"
rm -rf "$APP_PATH"
mkdir -p "$APP_PATH/Contents/MacOS"
cp ".build/release/reminders-bridge" "$APP_PATH/Contents/MacOS/reminders-bridge"

cat > "$APP_PATH/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.symphony.reminders-bridge</string>
  <key>CFBundleName</key>
  <string>RemindersBridge</string>
  <key>CFBundleDisplayName</key>
  <string>Symphony Reminders Bridge</string>
  <key>CFBundleExecutable</key>
  <string>reminders-bridge</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleSignature</key>
  <string>????</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSRemindersUsageDescription</key>
  <string>Sync your shared shopping lists with Symphony.</string>
  <key>NSRemindersFullAccessUsageDescription</key>
  <string>Sync your shared shopping lists with Symphony.</string>
</dict>
</plist>
EOF

echo "==> Code-signing bundle (ad-hoc)"
codesign --force --deep --sign - "$APP_PATH"

echo "==> Generating launchd plist"
PLIST_PATH="$LAUNCHAGENT_DIR/$LABEL.plist"
sed -e "s|__APP_PATH__|$APP_PATH|g" \
    -e "s|__CONFIG_PATH__|$CONFIG_DIR/config.json|g" \
    -e "s|__LOG_PATH__|$LOG_PATH|g" \
    "$BRIDGE_DIR/com.symphony.reminders-bridge.plist.template" > "$PLIST_PATH"

if [[ ! -f "$CONFIG_DIR/config.json" ]]; then
  echo "==> No config found at $CONFIG_DIR/config.json"
  echo "    Create one before the agent will sync. Stub written to:"
  echo "    $CONFIG_DIR/config.json.example"
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

echo
echo "==> Done."
echo "    Tail logs:      tail -f $LOG_PATH"
echo "    Verify loaded:  launchctl list | grep $LABEL"
echo "    Stop agent:     launchctl bootout gui/\$(id -u)/$LABEL"
echo "    Re-run install: ./install.sh"
