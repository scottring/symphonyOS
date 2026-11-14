import Foundation

/// The person's own words, tidied of spoken filler and nothing more, and the
/// day pulled off the end of a Week answer ("the deposit, today"). It never
/// rewrites: emoji, other languages, numbers and punctuation inside the
/// sentence stay exactly as said.
enum WalkWords {
    static let fillers: Set<String> = ["um", "uh", "uhm", "er", "erm", "hmm"]
    static let softFillers: Set<String> = ["so", "okay", "ok", "well", "like"]
    static let maxTitle = 200
    static let maxAreaName = 24

    struct Said: Equatable {
        let title: String
        let day: Date?
    }

    // MARK: tidy

    static func tidy(_ raw: String) -> String? {
        guard let whole = tidyUncut(raw) else { return nil }
        return cut(whole)
    }

    /// Tidied, capitalised, but not yet cut to `maxTitle`.
    private static func tidyUncut(_ raw: String) -> String? {
        var words = raw.split(whereSeparator: { $0.isWhitespace }).map(String.init)
        guard !words.isEmpty,
              !words.allSatisfy({ fillers.contains(core($0)) || softFillers.contains(core($0)) })
        else { return nil }

        while let first = words.first {
            let c = core(first)
            if fillers.contains(c) {
                words.removeFirst()
            } else if softFillers.contains(c),
                      first.hasSuffix(",") || (words.count > 1 && fillers.contains(core(words[1]))) {
                words.removeFirst()
            } else {
                break
            }
        }

        var text = words.joined(separator: " ")
        if text.hasSuffix(".") { text.removeLast() }
        guard text.contains(where: { $0.isLetter || $0.isNumber }) else { return nil }
        guard let first = text.first else { return nil }
        return first.uppercased() + text.dropFirst()
    }

    private static func cut(_ text: String) -> String {
        guard text.count > maxTitle else { return text }
        let head = String(text.prefix(maxTitle))
        let next = text[text.index(text.startIndex, offsetBy: maxTitle)]
        if next.isWhitespace { return head.trimmingCharacters(in: .whitespaces) }
        if let space = head.lastIndex(of: " ") {
            return String(head[..<space]).trimmingCharacters(in: .whitespaces)
        }
        return head
    }

    private static let edgePunctuation = CharacterSet(charactersIn: ",.…!?")

    private static func core(_ word: String) -> String {
        word.lowercased().trimmingCharacters(in: edgePunctuation)
    }

    // MARK: said

    static func said(
        _ raw: String,
        level: WalkLevel,
        today: Date,
        calendar: Calendar = PlanCalendar.calendar,
        detect: (String) -> Date? = WalkWords.detectedDate
    ) -> Said? {
        guard let whole = tidyUncut(raw) else { return nil }
        guard level == .week, let found = dayAtTheEnd(of: whole, today: today, calendar: calendar, detect: detect)
        else { return Said(title: cut(whole), day: nil) }
        let head = found.head.trimmingCharacters(in: .whitespaces)
        guard !head.isEmpty else { return Said(title: cut(whole), day: found.day) }
        return Said(title: cut(head), day: found.day)
    }

    private static let weekdays = ["sunday": 1, "monday": 2, "tuesday": 3, "wednesday": 4,
                                   "thursday": 5, "friday": 6, "saturday": 7]

    private static func dayAtTheEnd(
        of text: String, today: Date, calendar: Calendar, detect: (String) -> Date?
    ) -> (head: String, day: Date)? {
        let start = calendar.startOfDay(for: today)

        if let comma = text.lastIndex(of: ",") {
            let head = String(text[..<comma])
            let tail = String(text[text.index(after: comma)...]).trimmingCharacters(in: .whitespaces)
            if let day = keywordDay(tail, afterComma: true, today: start, calendar: calendar) { return (head, day) }
            if !tail.isEmpty, let date = detect(tail) { return (head, calendar.startOfDay(for: date)) }
            return nil
        }

        let words = text.split(separator: " ").map(String.init)
        for n in [3, 2, 1] where words.count >= n {
            let tail = words.suffix(n).joined(separator: " ")
            if let day = keywordDay(tail, afterComma: false, today: start, calendar: calendar) {
                return (words.dropLast(n).joined(separator: " "), day)
            }
        }
        return nil
    }

    /// Ways of saying the weekend that are clearly a day even without a comma before them.
    private static let weekendDays: Set<String> = ["this weekend", "on the weekend", "at the weekend", "over the weekend"]

    /// `tail` is exactly a day word, after an optional leading on / this / by. "The
    /// weekend" is a day only after a comma or as one of `weekendDays` ("Plan the
    /// weekend" is a task about it).
    private static func keywordDay(_ tail: String, afterComma: Bool, today: Date, calendar: Calendar) -> Date? {
        var words = tail.lowercased().split(separator: " ").map { $0.trimmingCharacters(in: edgePunctuation) }
        let whole = words.joined(separator: " ")
        if let first = words.first, ["on", "this", "by"].contains(first) { words.removeFirst() }
        let phrase = words.joined(separator: " ")
        let weekday = calendar.component(.weekday, from: today)
        func plus(_ d: Int) -> Date { calendar.date(byAdding: .day, value: d, to: today) ?? today }

        if weekendDays.contains(whole) || (afterComma && (phrase == "weekend" || phrase == "the weekend")) {
            return (weekday == 1 || weekday == 7) ? today : plus(7 - weekday)
        }
        switch phrase {
        case "today", "tonight": return today
        case "tomorrow": return plus(1)
        default:
            guard let target = weekdays[phrase] else { return nil }
            return plus((target - weekday + 7) % 7)
        }
    }

    /// The date the on-device parser read, only when the whole tail was the date.
    static func detectedDate(_ tail: String) -> Date? {
        let parsed = CaptureParser.parse(tail)
        guard let date = parsed.date,
              parsed.title == tail.trimmingCharacters(in: .whitespacesAndNewlines)
        else { return nil }
        return date
    }

    // MARK: tag

    static func tag(for day: Date, today: Date, calendar: Calendar = PlanCalendar.calendar) -> String {
        let from = calendar.startOfDay(for: today)
        let to = calendar.startOfDay(for: day)
        let gap = calendar.dateComponents([.day], from: from, to: to).day ?? 0
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        switch gap {
        case 0: return "TODAY"
        case 1: return "TOMORROW"
        case 2...6: f.dateFormat = "EEEE"
        default: f.dateFormat = "EEE d"
        }
        return f.string(from: to).uppercased()
    }
}
