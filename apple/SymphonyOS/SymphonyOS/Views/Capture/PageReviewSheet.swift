#if os(iOS)
import SwiftUI

/// Review a parsed page before it lands: items with a placement chip and an
/// assignee chip, the notes it found, and the lines it couldn't read.
struct PageReviewSheet: View {
    let result: PageResult
    let members: [FamilyMember]
    let onCommit: ([PageItem], [PageNote]) -> Void
    let onCancel: () -> Void

    @State private var items: [PageItem]
    @State private var notes: [PageNote]

    init(result: PageResult, members: [FamilyMember],
         onCommit: @escaping ([PageItem], [PageNote]) -> Void, onCancel: @escaping () -> Void) {
        self.result = result
        self.members = members
        self.onCommit = onCommit
        self.onCancel = onCancel
        _items = State(initialValue: result.items)
        _notes = State(initialValue: result.notes)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if items.isEmpty && notes.isEmpty && result.unclear.isEmpty {
                        Text("Nothing to place on this page.")
                            .font(.bodyMedium)
                            .foregroundStyle(Color.textSecondary)
                            .padding(.top, 40)
                            .frame(maxWidth: .infinity)
                    }

                    if !items.isEmpty {
                        Text("Items").eyebrowStyle()
                        ForEach($items) { $item in
                            itemRow($item)
                        }
                    }

                    if !notes.isEmpty {
                        Text("Notes").eyebrowStyle()
                        ForEach(notes) { note in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(note.title).font(.displaySmall).foregroundStyle(Color.textPrimary)
                                Text(note.content).font(.bodySmall).foregroundStyle(Color.textSecondary).lineLimit(4)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .cardStyle(padding: 14)
                            .overlay(alignment: .topTrailing) {
                                Button { notes.removeAll { $0.id == note.id } } label: {
                                    Image(systemName: "xmark").font(.captionBold).foregroundStyle(Color.textTertiary).padding(10)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if !result.unclear.isEmpty {
                        Text("Couldn't read").eyebrowStyle()
                        ForEach(result.unclear, id: \.self) { line in
                            Text(line).font(.displayItalic).foregroundStyle(Color.textTertiary)
                        }
                    }
                }
                .padding(20)
                .padding(.bottom, 40)
            }
            .background(Color.bgBase)
            .navigationTitle("Review page")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add all") { onCommit(items, notes) }
                        .disabled(items.isEmpty && notes.isEmpty)
                }
            }
        }
    }

    private func itemRow(_ item: Binding<PageItem>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TextField("Title", text: item.title)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
                Button { items.removeAll { $0.id == item.wrappedValue.id } } label: {
                    Image(systemName: "xmark").font(.captionBold).foregroundStyle(Color.textTertiary)
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: 8) {
                placementMenu(item.placement)
                assigneeMenu(item.assigneeId)
            }
            if let note = item.wrappedValue.note {
                Text(note).font(.displayItalic).foregroundStyle(Color.textSecondary).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle(padding: 14)
    }

    private func placementMenu(_ placement: Binding<PagePlacement>) -> some View {
        Menu {
            ForEach(result.windowDates, id: \.self) { ymd in
                Button(Self.dayLabel(ymd)) { placement.wrappedValue = .date(ymd) }
            }
            Divider()
            Button("This week") { placement.wrappedValue = .week }
            Button("Inbox") { placement.wrappedValue = .inbox }
        } label: {
            chip(Self.label(for: placement.wrappedValue), systemImage: "calendar")
        }
    }

    private func assigneeMenu(_ assignee: Binding<UUID?>) -> some View {
        Menu {
            Button("Me") { assignee.wrappedValue = nil }
            ForEach(members.sorted { $0.displayOrder < $1.displayOrder }, id: \.id) { m in
                Button(m.name) { assignee.wrappedValue = m.id }
            }
        } label: {
            let name = members.first { $0.id == assignee.wrappedValue }?.name ?? "Me"
            chip(name, systemImage: "person")
        }
    }

    private func chip(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.captionBold)
            .foregroundStyle(Color.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.bgSurface, in: Capsule())
    }

    static func label(for placement: PagePlacement) -> String {
        switch placement {
        case .date(let ymd): return dayLabel(ymd)
        case .week: return "This week"
        case .inbox: return "Inbox"
        }
    }

    static func dayLabel(_ ymd: String) -> String {
        guard let d = PageParse.parseLocalYmd(ymd) else { return ymd }
        if Calendar.current.isDateInToday(d) { return "Today" }
        if Calendar.current.isDateInTomorrow(d) { return "Tomorrow" }
        return d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }
}
#endif
