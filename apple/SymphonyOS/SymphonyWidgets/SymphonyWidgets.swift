import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

// Symphony's widget extension (Scott, 2026-11-11, the iPhone Duo boards):
// the "next up" Live Activity for the Lock Screen — the Duo's outside screen
// when it's closed — and a Tell Symphony control for the Lock Screen,
// Control Center or the Action button.

@main
struct SymphonyWidgets: WidgetBundle {
    var body: some Widget {
        NextUpLiveActivity()
        TellSymphonyControl()
    }
}

// MARK: - Next up

private let ink = Color(red: 0x2C / 255, green: 0x25 / 255, blue: 0x20 / 255)
private let amber = Color(red: 0xB4 / 255, green: 0x53 / 255, blue: 0x09 / 255)
private let paper = Color(red: 0xFA / 255, green: 0xF7 / 255, blue: 0xF2 / 255)

struct NextUpLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NextUpAttributes.self) { context in
            LockScreenNextUp(state: context.state)
                .activityBackgroundTint(paper)
                .activitySystemActionForegroundColor(ink)
                .widgetURL(URL(string: "symphony://today"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.state.title).font(.headline).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(state: context.state).font(.headline).foregroundStyle(amber)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(subtitle(context.state)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: "calendar")
            } compactTrailing: {
                Countdown(state: context.state).foregroundStyle(amber).frame(maxWidth: 52)
            } minimal: {
                Image(systemName: "calendar")
            }
            .widgetURL(URL(string: "symphony://today"))
        }
    }
}

private func subtitle(_ s: NextUpAttributes.ContentState) -> String {
    var parts = [s.start.formatted(date: .omitted, time: .shortened)]
    if let location = s.location, !location.isEmpty { parts.append(location) }
    return parts.joined(separator: " · ")
}

/// "in 25 min", ticking on its own; "now" once it has started.
private struct Countdown: View {
    let state: NextUpAttributes.ContentState
    var body: some View {
        if state.start > .now {
            Text(timerInterval: Date.now...state.start, countsDown: true)
                .monospacedDigit()
                .multilineTextAlignment(.trailing)
        } else {
            Text("now")
        }
    }
}

private struct LockScreenNextUp: View {
    let state: NextUpAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(state.start > .now ? "Symphony · Next up" : "Symphony · Now")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ink.opacity(0.65))
                Spacer()
                Countdown(state: state)
                    .font(.system(size: 24, weight: .light))
                    .foregroundStyle(amber)
            }
            Text(state.title)
                .font(.custom("CrimsonPro-Regular", size: 22, relativeTo: .title3))
                .foregroundStyle(ink)
                .lineLimit(2)
            Text(subtitle(state))
                .font(.footnote)
                .foregroundStyle(ink.opacity(0.75))
                .lineLimit(1)
            if let then = state.then {
                Text(then).font(.caption).foregroundStyle(ink.opacity(0.6)).lineLimit(1)
            }
        }
        .padding(16)
    }
}

// MARK: - Tell Symphony

/// One tap opens Symphony straight into Tell (symphony://tell).
struct TellSymphonyControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "com.scottkaufman.symphonyos.tell") {
            ControlWidgetButton(action: OpenURLIntent(URL(string: "symphony://tell")!)) {
                Label("Tell Symphony", systemImage: "mic")
            }
        }
        .displayName("Tell Symphony")
        .description("Say what changed; Symphony puts it in your Inbox, or on the day you name.")
    }
}
