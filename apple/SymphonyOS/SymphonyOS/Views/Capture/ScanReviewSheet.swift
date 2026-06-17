import SwiftUI

/// Review/edit the AI-extracted fields for a scanned document before saving it as a task.
struct ScanReviewSheet: View {
    let image: UIImage
    let initial: ScanExtraction?
    /// (title, dueDate?, notes?, context?)
    let onSave: (String, Date?, String?, String?) -> Void
    let onCancel: () -> Void

    @State private var title = ""
    @State private var hasDueDate = false
    @State private var dueDate = Date()
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
                    Toggle("Due date", isOn: $hasDueDate)
                    if hasDueDate {
                        DatePicker("Due", selection: $dueDate, displayedComponents: .date)
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
                            hasDueDate ? dueDate : nil,
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

    private func prefill() {
        if let t = initial?.title, !t.isEmpty { title = t } else { title = "Scanned document" }
        notes = initial?.notes ?? ""
        context = initial?.context
        if let d = initial?.dueDate, let parsed = Self.dateFormatter.date(from: d) {
            hasDueDate = true
            dueDate = parsed
        }
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = .current
        return f
    }()
}
