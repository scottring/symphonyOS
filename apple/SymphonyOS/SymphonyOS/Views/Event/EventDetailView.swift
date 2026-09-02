import SwiftUI
import SwiftData

/// Detail card for a Google Calendar event — the event equivalent of
/// `TaskDetailView`. The event header (title/time/location) is read-only (no
/// write-back to Google); below it the user attaches Symphony context — notes,
/// links, photos — persisted to the `event_notes` table + `attachments`
/// (`entity_type = 'event_note'`) keyed by the Google event id, exactly the
/// storage the web uses, so everything round-trips across devices.
///
/// The backing `EventNote` row is created lazily on the first edit, mirroring how
/// `TimelineItemCard.setInstanceStatus` lazily creates an `ActionableInstance`.
struct EventDetailView: View {
    let googleEventId: String
    let eventTitle: String
    let eventStart: Date?
    let eventLocation: String?
    /// The series id for a recurring event — the "Free" toggle writes the
    /// note keyed by this (a series note applies to every occurrence) instead
    /// of `googleEventId`. Nil for a one-off event.
    let recurringEventId: String?
    /// The day this card was opened for — the Skip action attaches to it.
    let date: Date
    let userId: UUID

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var loaded = false
    @State private var notesText = ""
    @State private var links: [TaskLink] = []
    @State private var showAddLink = false
    @State private var newLinkURL = ""
    @State private var newLinkTitle = ""
    @State private var isFree = false

    /// Where the Free flag is written: the series when recurring, else the
    /// instance — mirrors the web's `freeKeyFor`.
    private var freeNoteKey: String { recurringEventId ?? googleEventId }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                freeSection
                Divider()
                notesSection
                AttachmentsSection(entityType: "event_note", entityId: googleEventId)
                linksSection
                Divider()
                skipButton
            }
            .padding(20)
        }
        .onAppear(perform: loadIfNeeded)
    }

    // MARK: - Header (read-only)

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(eventTitle)
                .font(.displayMedium)
                .foregroundStyle(Color.textPrimary)

            HStack(spacing: 6) {
                Image(systemName: "clock")
                    .font(.system(size: 12))
                Text(timeString)
                    .font(.bodyMedium)
            }
            .foregroundStyle(Color.textSecondary)

            if let location = eventLocation, !location.isEmpty {
                Button {
                    openLocation(location)
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: isMeetingLink(location) ? "video" : "mappin")
                            .font(.system(size: 12))
                        Text(location)
                            .font(.bodySmall)
                            .lineLimit(1)
                    }
                    .foregroundStyle(Color.primaryTint)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var timeString: String {
        guard let start = eventStart else { return "All day" }
        let f = DateFormatter()
        f.dateFormat = "EEEE, MMM d · h:mm a"
        return f.string(from: start)
    }

    // MARK: - Free ("the kids just show up" — informational only)

    private var freeSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            Toggle(isOn: Binding(
                get: { isFree },
                set: { setFree($0) }
            )) {
                Text("Free")
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
            }
            Text(freeCaption)
                .font(.captionText)
                .foregroundStyle(Color.textTertiary)
        }
    }

    private var freeCaption: String {
        let base = "The kids just show up — no prep, no handoff, nothing for a parent to do."
        return recurringEventId != nil ? base + " Applies to every occurrence." : base
    }

    // MARK: - Notes

    private var notesSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Notes", systemImage: "note.text")
                .eyebrowStyle()

            TextEditor(text: Binding(
                get: { notesText },
                set: { notesText = $0; saveNotes($0) }
            ))
            .font(.bodyMedium)
            .foregroundStyle(Color.textPrimary)
            .scrollContentBackground(.hidden)
            .frame(minHeight: 100)
            .padding(8)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .strokeBorder(Color.textTertiary.opacity(0.2), lineWidth: 1)
            )
        }
    }

    // MARK: - Links

    private var linksSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Links", systemImage: "link")
                .eyebrowStyle()

            ForEach(Array(links.enumerated()), id: \.element) { index, link in
                HStack(spacing: 8) {
                    Button {
                        openURL(link.url)
                    } label: {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(link.title?.isEmpty == false ? link.title! : link.url)
                                .font(.bodySmall)
                                .foregroundStyle(Color.primaryTint)
                                .lineLimit(1)
                            if link.title?.isEmpty == false {
                                Text(link.url)
                                    .font(.captionText)
                                    .foregroundStyle(Color.textTertiary)
                                    .lineLimit(1)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    Spacer()
                    Button {
                        removeLink(at: index)
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 16))
                            .foregroundStyle(Color.textTertiary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 4)
            }

            if showAddLink {
                VStack(spacing: 8) {
                    TextField("https://…", text: $newLinkURL)
                        .font(.bodySmall)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        #endif
                    TextField("Title (optional)", text: $newLinkTitle)
                        .font(.bodySmall)
                    HStack {
                        Button("Add") { addLink() }
                            .font(.bodySmallBold)
                            .foregroundStyle(Color.primaryTint)
                            .disabled(newLinkURL.trimmingCharacters(in: .whitespaces).isEmpty)
                        Button("Cancel") {
                            showAddLink = false
                            newLinkURL = ""
                            newLinkTitle = ""
                        }
                        .font(.bodySmall)
                        .foregroundStyle(Color.textSecondary)
                    }
                }
                .padding(10)
                .background(Color.bgElevated)
                .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                Button {
                    showAddLink = true
                } label: {
                    Label("Add link", systemImage: "plus")
                        .font(.bodySmall)
                        .foregroundStyle(Color.primaryTint)
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: - Skip

    private var skipButton: some View {
        Button {
            skipToday()
            dismiss()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "arrow.uturn.forward")
                    .font(.system(size: 16))
                Text("Skip today")
                    .font(.bodyMedium)
            }
            .foregroundStyle(Color.textSecondary)
        }
        .buttonStyle(.plain)
    }

    // MARK: - EventNote resolution + persistence

    private func loadIfNeeded() {
        guard !loaded else { return }
        loaded = true
        let allNotes = (try? modelContext.fetch(FetchDescriptor<EventNote>())) ?? []
        if let note = allNotes.first(where: { $0.googleEventId == googleEventId }) {
            // Notes are stored as Tiptap HTML (or markdown-style text — the
            // web's `notesToHtml` accepts either); the editor here only ever
            // shows/edits markdown-style text.
            notesText = NotesHTML.toMarkdown(note.notes ?? "")
            links = note.links ?? []
        }
        isFree = TimelineViewModel.isEventFree(eventKey: googleEventId, seriesKey: recurringEventId, notes: allNotes)
    }

    /// `key` defaults to the instance id (`googleEventId`) — notes/links stay
    /// per-instance. The Free toggle passes `freeNoteKey` (the series id when
    /// recurring) so it reads/writes the series-level note.
    private func existingNote(for key: String? = nil) -> EventNote? {
        let targetKey = key ?? googleEventId
        let all = (try? modelContext.fetch(FetchDescriptor<EventNote>())) ?? []
        return all.first { $0.googleEventId == targetKey }
    }

    /// The EventNote for `key` (default the instance id), created (and queued
    /// as an insert) on first edit so merely opening a card never writes an
    /// empty row.
    private func ensureNote(for key: String? = nil) -> EventNote {
        let targetKey = key ?? googleEventId
        if let note = existingNote(for: targetKey) { return note }
        let note = EventNote(userId: userId, googleEventId: targetKey)
        note.eventTitle = eventTitle
        note.eventStartTime = eventStart
        modelContext.insert(note)
        modelContext.queueSync(table: "event_notes", recordId: note.id, type: "insert")
        return note
    }

    private func persist(_ note: EventNote) {
        note.updatedAt = Date()
        note.syncStatus = .pending
        modelContext.queueSync(table: "event_notes", recordId: note.id, type: "update")
        try? modelContext.save()
    }

    private func saveNotes(_ text: String) {
        let note = ensureNote()
        note.notes = text.isEmpty ? nil : text
        persist(note)
    }

    private func setFree(_ free: Bool) {
        isFree = free
        let note = ensureNote(for: freeNoteKey)
        note.isFree = free
        persist(note)
    }

    private func addLink() {
        var url = newLinkURL.trimmingCharacters(in: .whitespaces)
        guard !url.isEmpty else { return }
        if !url.lowercased().hasPrefix("http") { url = "https://\(url)" }
        let title = newLinkTitle.trimmingCharacters(in: .whitespaces)
        links.append(TaskLink(url: url, title: title.isEmpty ? nil : title))
        showAddLink = false
        newLinkURL = ""
        newLinkTitle = ""
        let note = ensureNote()
        note.links = links
        persist(note)
    }

    private func removeLink(at index: Int) {
        guard links.indices.contains(index) else { return }
        links.remove(at: index)
        let note = ensureNote()
        note.links = links.isEmpty ? nil : links
        persist(note)
    }

    /// Write a "skipped" status for this event/day, mirroring the swipe Skip and
    /// the web (actionable_instances keyed by entity_type "calendar_event").
    private func skipToday() {
        let cal = Calendar.current
        let all = (try? modelContext.fetch(FetchDescriptor<ActionableInstance>())) ?? []
        let existing = all.first {
            $0.entityType == "calendar_event" && $0.entityId == googleEventId &&
            cal.isDate($0.date, inSameDayAs: date)
        }
        let now = Date()
        if let existing {
            existing.status = "skipped"
            existing.skippedAt = now
            existing.updatedAt = now
            existing.syncStatus = .pending
            modelContext.queueSync(table: "actionable_instances", recordId: existing.id, type: "update")
        } else {
            let instance = ActionableInstance(
                userId: userId, entityType: "calendar_event", entityId: googleEventId, date: date
            )
            instance.status = "skipped"
            instance.skippedAt = now
            modelContext.insert(instance)
            modelContext.queueSync(table: "actionable_instances", recordId: instance.id, type: "insert")
        }
        try? modelContext.save()
    }

    // MARK: - Open helpers (mirror TaskDetailView)

    private func openURL(_ urlString: String) {
        #if os(iOS)
        if let url = URL(string: urlString) { UIApplication.shared.open(url) }
        #endif
    }

    private func isMeetingLink(_ s: String) -> Bool {
        let l = s.lowercased()
        return l.hasPrefix("http") && (l.contains("zoom") || l.contains("meet.google")
            || l.contains("teams.microsoft") || l.contains("webex"))
    }

    private func openLocation(_ location: String) {
        #if os(iOS)
        let url: URL?
        if isMeetingLink(location) {
            url = URL(string: location)
        } else {
            let q = location.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
            url = URL(string: "http://maps.apple.com/?daddr=\(q)")
        }
        if let url { UIApplication.shared.open(url) }
        #endif
    }
}
