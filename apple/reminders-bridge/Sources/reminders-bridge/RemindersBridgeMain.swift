import Foundation
import RemindersBridge

@main
struct RemindersBridgeMain {
    static func main() async {
        let configPath = CommandLine.arguments.count > 1
            ? CommandLine.arguments[1]
            : "~/.config/symphony-bridge/config.json"

        do {
            let config = try Config.load(fromPath: configPath)
            let bridge = Bridge(
                config: config,
                reminders: RemindersClient(),
                symphony: SymphonyClient(supabaseUrl: config.supabaseUrl, serviceRoleKey: config.serviceRoleKey)
            )
            try await bridge.runOnce()
            exit(0)
        } catch {
            FileHandle.standardError.write(Data("reminders-bridge: \(error)\n".utf8))
            exit(1)
        }
    }
}
