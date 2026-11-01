# reminders-bridge

Bidirectional sync between Apple Reminders (Groceries, Need now) and Symphony's `lists`/`list_items` tables.

## Architecture

- Reads Apple Reminders via EventKit
- Reads/writes Symphony via supabase-swift with the service-role key
- Pure reconciliation in `Reconciler.swift`; clients in `RemindersClient.swift` / `SymphonyClient.swift`
- Runs every 60s via `launchd` user-agent

## Install

```bash
./install.sh
```

Then create `~/.config/symphony-bridge/config.json` based on `config.json.example`. Get the service role key from Supabase project settings; get the list UUIDs by querying `select id, title from lists where external_source='apple_reminders'`.

## First run

The first run will prompt for Reminders access (TCC). Approve. After that, the agent runs every 60 seconds.

## Logs

```bash
tail -f ~/Library/Logs/symphony-reminders-bridge.log
```

## Uninstall

```bash
launchctl bootout gui/$(id -u)/com.symphony.reminders-bridge
rm ~/Library/LaunchAgents/com.symphony.reminders-bridge.plist
rm ~/.local/bin/reminders-bridge
```

## Caveats

- Mac must be unlocked / awake for sync. Sleep delays sync until wake.
- Apple Reminders' iCloud propagation isn't instant — items added on one device may take 30–60s to appear in the bridge.
- Deleting an item in Symphony deletes the reminder. The bridge tells that apart from a reminder added on the phone by remembering which items were on both sides last pass, in `~/.config/symphony-bridge/paired.json`. With no file yet, the first pass only records. A pass that would delete more than 5 reminders and more than half the list holds those deletes and logs it, since that looks like a bad read rather than tidying up.
- Conflicts (same item changed both sides between ticks) are resolved by `updated_at`/`lastModifiedDate`; conflicts are logged but not surfaced.
