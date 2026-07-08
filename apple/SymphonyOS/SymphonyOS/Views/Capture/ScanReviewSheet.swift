#if os(iOS)
import SwiftUI

/// Review/edit the AI-extracted fields for a scanned document before saving it as a task.
struct ScanReviewSheet: View {
    let image: UIImage
    let initial: ScanExtraction?
    /// (title, scheduledFor?, notes?, context?) — scheduledFor nil ⇒ Inbox.
    let onSave: (String, Date?, String?, String?) -> Void
    let onCancel: () -> Void

    enum Destination: Hashable { case inbox, today, date }

    @State private var title = ""
    @State private var destination: Destination = .inbox
    @State private var date = Date()
    @State private var notes = ""
    @State private var context: String? = nil

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                Section("Task") {
                    TextField("Title", text: $title)
                }
                Section("Add to") {
                    Picker("Add to", selection: $destination) {
                        Text("Inbox").tag(Destination.inbox)
                        Text("Today").tag(Destination.today)
                        Text("Date").tag(Destination.date)
                    }
                    .pickerStyle(.segmented)
                    if destination == .date {
                        DatePicker("Date", selection: $date, displayedComponents: .date)
                    }
                }
                Section("Notes") {
                    TextEditor(text: $notes).frame(minHeight: 80)
                }
                Section("Context") {
                    Picker("Context", selection: $context) {
                        Text("None").tag(String?.none)
                        Text("Work").tag(String?.some("work"))
                        Text("Family").tag(String?.some("family"))
                        Text("Personal").tag(String?.some("personal"))
                    }
                }
            }
            .navigationTitle("Review Scan")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(
                            title.trimmingCharacters(in: .whitespacesAndNewlines),
                            scheduledFor,
                            notes.isEmpty ? nil : notes,
                            context
                        )
                    }
                    .disabled(title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear(perform: prefill)
        }
    }

    private var scheduledFor: Date? {
        switch destination {
        case .inbox: return nil
        case .today: return Calendar.current.startOfDay(for: Date())
        case .date:  return Calendar.current.startOfDay(for: date)
        }
    }

    private func prefill() {
        if let t = initial?.title, !t.isEmpty { title = t } else { title = "Scanned document" }
        notes = initial?.notes ?? ""
        context = initial?.context
        // If the AI found an explicit date, default to scheduling on that date.
        if let d = initial?.dueDate, let parsed = Self.dateFormatter.date(from: d) {
            destination = .date
            date = parsed
        }
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f
    }()
}
#endif
