import Foundation
import Observation
import UserNotifications

// MARK: - Reading a recipe step

/// What a recipe step says, read for the cooking view: how long it asks for
/// (a step that says "roast 12 minutes" gets a timer) and which ingredients
/// it uses (shown beside the step).
enum RecipeCue {
    struct Duration: Equatable {
        let seconds: Int
        /// Where the time is written in the step, to mark it.
        let range: Range<String.Index>
    }

    private static let unitPattern = #"(?:hours?|hrs?|minutes?|mins?|seconds?|secs?)\b"#
    private static let timePattern =
        #"\b(\d+(?:[.,]\d+)?|an?|one|two|three|four|five|six|ten|fifteen|twenty|thirty)(?:\s*(?:-|–|—|to)\s*\d+(?:[.,]\d+)?)?\s*"# + unitPattern

    /// The first time a step asks for, with any hours-and-minutes that follow
    /// it ("1 hour 15 minutes"). A range ("12–15 minutes") times its lower
    /// end, to check early.
    static func duration(in step: String) -> Duration? {
        guard let regex = try? NSRegularExpression(pattern: timePattern + #"(?:\s*(?:and\s*)?"# + timePattern + ")?",
                                                   options: [.caseInsensitive]) else { return nil }
        let ns = step as NSString
        guard let match = regex.firstMatch(in: step, range: NSRange(location: 0, length: ns.length)),
              let range = Range(match.range, in: step) else { return nil }
        let text = String(step[range])
        // Each number-and-unit in the match.
        guard let part = try? NSRegularExpression(pattern: timePattern, options: [.caseInsensitive]) else { return nil }
        var total = 0.0
        for m in part.matches(in: text, range: NSRange(location: 0, length: (text as NSString).length)) {
            guard let r = Range(m.range, in: text), let numberRange = Range(m.range(at: 1), in: text) else { continue }
            let piece = text[r].lowercased()
            let value = number(String(text[numberRange]).lowercased())
            if piece.contains("h") && !piece.contains("min") && !piece.contains("sec") {
                total += value * 3600
            } else if piece.contains("sec") {
                total += value
            } else {
                total += value * 60
            }
        }
        let seconds = Int(total.rounded())
        guard seconds >= 10, seconds <= 12 * 3600 else { return nil }
        return Duration(seconds: seconds, range: range)
    }

    private static func number(_ word: String) -> Double {
        let words = ["a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
                     "ten": 10, "fifteen": 15, "twenty": 20, "thirty": 30]
        if let n = words[word] { return Double(n) }
        return Double(word.replacingOccurrences(of: ",", with: ".")) ?? 0
    }

    /// Words that say how much or how it's cut, never what it is.
    private static let notTheFood: Set<String> = [
        "cup", "cups", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "lb", "lbs",
        "pound", "pounds", "oz", "ounce", "ounces", "g", "kg", "ml", "l", "pinch", "dash", "can", "cans",
        "jar", "package", "pkg", "bunch", "clove", "cloves", "slice", "slices", "piece", "pieces", "head",
        "large", "small", "medium", "fresh", "freshly", "chopped", "diced", "minced", "sliced", "halved",
        "cubed", "grated", "peeled", "finely", "roughly", "thinly", "divided", "optional", "room",
        "temperature", "softened", "melted", "packed", "ground", "extra", "virgin", "boneless", "skinless",
        "whole", "about", "plus", "more", "for", "and", "or", "of", "the", "to", "taste", "into", "cut",
        "trimmed", "rinsed", "drained", "serving", "garnish", "inch", "inches", "white", "black", "red",
        "green", "yellow", "light", "dark", "low", "sodium", "unsalted", "salted", "cold", "warm", "hot",
    ]

    private static func words(_ text: String) -> [String] {
        text.lowercased()
            .components(separatedBy: CharacterSet.letters.inverted)
            .filter { $0.count >= 3 }
            .map(stem)
    }

    /// Plurals meet their singulars: "potatoes" finds "potato".
    private static func stem(_ word: String) -> String {
        if word.hasSuffix("oes") { return String(word.dropLast(2)) }
        if word.hasSuffix("ies") { return String(word.dropLast(3)) + "y" }
        if word.hasSuffix("s") && !word.hasSuffix("ss") { return String(word.dropLast()) }
        return word
    }

    /// The ingredients a step names, by index into `ingredients`.
    static func ingredients(usedIn step: String, from ingredients: [String]) -> [Int] {
        let inStep = Set(words(step))
        return ingredients.indices.filter { i in
            let food = words(ingredients[i]).filter { !notTheFood.contains($0) && !notTheFood.contains($0 + "s") }
            return food.contains(where: inStep.contains)
        }
    }

    /// "12:00", or "1:05:00" from an hour.
    static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        let h = s / 3600, m = (s % 3600) / 60, sec = s % 60
        return h > 0 ? String(format: "%d:%02d:%02d", h, m, sec) : String(format: "%d:%02d", m, sec)
    }
}

// MARK: - A dinner being cooked

/// Tonight's dinner being cooked: which step, what's been got out, and the
/// step timer. It lives while you cook, so opening the phone flat and folding
/// it again comes back to the same step.
@Observable
@MainActor
final class CookSession {
    let dinner: Dinner
    private(set) var step = 0
    private(set) var gathered: Set<Int> = []
    private(set) var timer: StepTimer?

    struct StepTimer: Equatable {
        let step: Int
        let total: Int
        /// When it rings while running; nil while paused.
        var endsAt: Date?
        /// What was left when it was paused.
        var remaining: Int

        func left(at now: Date) -> Int {
            guard let endsAt else { return remaining }
            return max(0, Int(endsAt.timeIntervalSince(now).rounded(.up)))
        }
        var running: Bool { endsAt != nil }
    }

    init(dinner: Dinner) { self.dinner = dinner }

    var steps: [String] { dinner.instructions }
    var current: String { steps.indices.contains(step) ? steps[step] : "" }
    var isLast: Bool { step >= steps.count - 1 }
    var next: String? { steps.indices.contains(step + 1) ? steps[step + 1] : nil }
    var duration: RecipeCue.Duration? { RecipeCue.duration(in: current) }
    var usedNow: [Int] { RecipeCue.ingredients(usedIn: current, from: dinner.ingredients) }

    func forward() { if step < steps.count - 1 { step += 1 } }
    func back() { if step > 0 { step -= 1 } }

    func toggleGathered(_ index: Int) {
        if gathered.contains(index) { gathered.remove(index) } else { gathered.insert(index) }
    }

    // MARK: The timer

    private static let alarmId = "symphony.cook.timer"

    func startTimer(seconds: Int, now: Date = .now) {
        timer = StepTimer(step: step, total: seconds, endsAt: now.addingTimeInterval(Double(seconds)), remaining: seconds)
        schedule(after: seconds)
    }

    func pauseOrResume(now: Date = .now) {
        guard var t = timer else { return }
        if t.running {
            t.remaining = t.left(at: now)
            t.endsAt = nil
            cancelAlarm()
        } else {
            t.endsAt = now.addingTimeInterval(Double(t.remaining))
            schedule(after: t.remaining)
        }
        timer = t
    }

    func clearTimer() {
        timer = nil
        cancelAlarm()
    }

    func end() { clearTimer() }

    /// Rings even when the screen locks or another app is open.
    private func schedule(after seconds: Int) {
        let content = UNMutableNotificationContent()
        content.title = "Timer done"
        content.body = "\(dinner.title) · step \(step + 1)"
        content.sound = .default
        content.interruptionLevel = .timeSensitive
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: Double(max(1, seconds)), repeats: false)
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [Self.alarmId])
        center.add(UNNotificationRequest(identifier: Self.alarmId, content: content, trigger: trigger))
    }

    private func cancelAlarm() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [Self.alarmId])
    }
}
