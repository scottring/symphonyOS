#!/usr/bin/env bash
set -euo pipefail

# Wraps the built reminders-bridge binary as a macOS .app bundle so TCC
# (Reminders permission) prompts properly. Run after `swift build`.

BRIDGE_DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$BRIDGE_DIR/RemindersBridge.app"
BUILD_CONFIG="${BUILD_CONFIG:-debug}"

if [[ ! -x "$BRIDGE_DIR/.build/$BUILD_CONFIG/reminders-bridge" ]]; then
  echo "Binary not found at .build/$BUILD_CONFIG/reminders-bridge"
  echo "Run: swift build  (or: swift build -c release)"
  exit 1
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

cp "$BRIDGE_DIR/.build/$BUILD_CONFIG/reminders-bridge" "$APP/Contents/MacOS/reminders-bridge"

cat > "$APP/Contents/Info.plist" <<'EOF'
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

codesign --force --deep --sign - "$APP"

echo "==> Bundle ready at: $APP"
echo "    First-run TCC prompt: open $APP --args ~/.config/symphony-bridge/config.json"
echo "    After approval, run direct: $APP/Contents/MacOS/reminders-bridge ~/.config/symphony-bridge/config.json"
