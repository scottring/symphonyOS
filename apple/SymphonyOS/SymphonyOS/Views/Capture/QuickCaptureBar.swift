import SwiftUI
import SwiftData

struct QuickCaptureBar: View {
    let userId: UUID
    /// When set (the Today screen), an undated capture schedules for this day.
    var defaultDate: Date? = nil
    @Environment(\.modelContext) private var modelContext
    @State private var title = ""
    @State private var showCamera = false
    @FocusState private var isFocused: Bool

    private var placeholder: String { defaultDate != nil ? "Add to today…" : "Add a task…" }

    var body: some View {
        HStack(spacing: 12) {
            // Plus icon
            Image(systemName: "plus.circle.fill")
                .font(.system(size: 26))
                .foregroundStyle(Color.textTertiary)
                .symbolRenderingMode(.hierarchical)

            // Text field
            TextField(placeholder, text: $title)
                .font(.bodyMedium)
                .foregroundStyle(Color.textPrimary)
                .focused($isFocused)
                .onSubmit { submit() }

            // Submit button
            if !title.isEmpty {
                Button {
                    submit()
                } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(Color.ink)
                        .symbolRenderingMode(.hierarchical)
                }
                .buttonStyle(.plain)
                .transition(.scale.combined(with: .opacity))
            }

            #if os(iOS)
            // Photo capture: snap a thing → AI turns it into an enriched inbox
            // task in the background (fire-and-forget).
            if title.isEmpty {
                Button {
                    showCamera = true
                } label: {
                    Image(systemName: "camera.fill")
                        .font(.system(size: 22))
                        .foregroundStyle(Color.textSecondary)
                        .symbolRenderingMode(.hierarchical)
                }
                .buttonStyle(.plain)
                .transition(.scale.combined(with: .opacity))
            }
            #endif
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.cardShadow, radius: 12, x: 0, y: 4)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: !title.isEmpty)
        #if os(iOS)
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { data in
                showCamera = false
                guard let data else { return }
                PhotoCaptureService.capture(jpegData: data, userId: userId, modelContext: modelContext)
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            }
            .ignoresSafeArea()
        }
        #endif
    }

    private func submit() {
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }

        // Natural-language date parsing: "call mom friday 3pm" → title "call mom",
        // scheduled Fri 3pm. No date found → inbox, unless we're on Today (then it
        // lands on the viewed day).
        let parsed = CaptureParser.parse(trimmed)
        var scheduled = parsed.date
        var allDay = parsed.date != nil ? !parsed.hasTime : false
        if scheduled == nil, let day = defaultDate {
            scheduled = day
            allDay = true
        }

        let vm = TaskViewModel(modelContext: modelContext)
        _ = vm.createTask(title: parsed.title, userId: userId, scheduledFor: scheduled, isAllDay: allDay)

        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif

        title = ""
    }
}

// MARK: - Capture parsing

/// Parses a captured/spoken string into a clean title + an optional date using
/// the built-in NSDataDetector. "call mom tomorrow at 3pm" → ("call mom",
/// tomorrow 3pm, hasTime: true). No date → (original text, nil, false).
enum CaptureParser {
    struct Result {
        let title: String
        let date: Date?
        let hasTime: Bool
    }

    static func parse(_ raw: String) -> Result {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty,
              let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.date.rawValue) else {
            return Result(title: text, date: nil, hasTime: false)
        }
        let full = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = detector.matches(in: text, options: [], range: full).first,
              let date = match.date else {
            return Result(title: text, date: nil, hasTime: false)
        }

        var cleaned = text
        if let r = Range(match.range, in: text) { cleaned.removeSubrange(r) }
        cleaned = cleaned
            .replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: CharacterSet(charactersIn: " ,.-\t"))

        let matched = (text as NSString).substring(with: match.range).lowercased()
        let hasTime = matched.contains(":") || matched.contains("am") || matched.contains("pm")
            || matched.range(of: #"\b\d{1,2}\s*o'?clock\b"#, options: .regularExpression) != nil

        return Result(title: cleaned.isEmpty ? text : cleaned, date: date, hasTime: hasTime)
    }
}
