import SwiftUI
import SwiftData

// Lists on the phone. Fifteen of Scott's eighteen lists are Symphony-native
// (packing lists, books to read, stuff to buy) and had no mobile surface at all
// — the three that did were only reachable because they mirror Apple Reminders.

struct ListsView: View {
    @Query(sort: [SortDescriptor(\SymphonyList.sortOrder), SortDescriptor(\SymphonyList.title)])
    private var lists: [SymphonyList]

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()

            if lists.isEmpty {
                ContentUnavailableView(
                    "No lists yet",
                    systemImage: "checklist",
                    description: Text("Lists you make in Symphony show up here.")
                )
            } else {
                List {
                    ForEach(lists, id: \.id) { list in
                        NavigationLink {
                            ListDetailView(list: list)
                        } label: {
                            ListRow(list: list)
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
        }
        .navigationTitle("Lists")
        .navigationBarTitleDisplayMode(.large)
    }
}

private struct ListRow: View {
    let list: SymphonyList
    @Query private var items: [SymphonyListItem]

    init(list: SymphonyList) {
        self.list = list
        let id = list.id
        _items = Query(filter: #Predicate<SymphonyListItem> { $0.listId == id })
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: list.icon ?? "checklist")
                .foregroundStyle(Color.textSecondary)
                .frame(width: 22)

            VStack(alignment: .leading, spacing: 2) {
                Text(list.title)
                    .foregroundStyle(Color.textPrimary)
                HStack(spacing: 6) {
                    Text(openCountLabel)
                    if list.visibility == "family" {
                        Text("· Family")
                    }
                }
                .font(.caption)
                .foregroundStyle(Color.textSecondary)
            }
        }
    }

    private var openCountLabel: String {
        let open = items.filter { !$0.completed }.count
        return open == 0 ? "All done" : "\(open) open"
    }
}

// MARK: - Detail

struct ListDetailView: View {
    let list: SymphonyList

    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Query private var items: [SymphonyListItem]
    @State private var draft = ""
    @FocusState private var addFieldFocused: Bool

    init(list: SymphonyList) {
        self.list = list
        let id = list.id
        _items = Query(
            filter: #Predicate<SymphonyListItem> { $0.listId == id },
            sort: [SortDescriptor(\SymphonyListItem.sortOrder), SortDescriptor(\SymphonyListItem.createdAt)]
        )
    }

    private var open: [SymphonyListItem] { items.filter { !$0.completed } }
    private var done: [SymphonyListItem] { items.filter { $0.completed } }

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()

            List {
                Section {
                    HStack {
                        Image(systemName: "plus.circle.fill").foregroundStyle(Color.textSecondary)
                        TextField("Add an item…", text: $draft)
                            .focused($addFieldFocused)
                            .submitLabel(.done)
                            .onSubmit(addItem)
                    }
                }

                if !open.isEmpty {
                    Section {
                        ForEach(open, id: \.id) { item in
                            ItemRow(item: item) { toggle(item) }
                        }
                        .onDelete { delete(open, at: $0) }
                    }
                }

                if !done.isEmpty {
                    Section("Done") {
                        ForEach(done, id: \.id) { item in
                            ItemRow(item: item) { toggle(item) }
                        }
                        .onDelete { delete(done, at: $0) }
                    }
                }
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle(list.title)
        .navigationBarTitleDisplayMode(.inline)
        .overlay(alignment: .bottom) { bridgeNotice }
    }

    /// The three Apple-Reminders lists reconcile bidirectionally every 60s, so a
    /// delete here can be undone by the bridge. Say so rather than let it look
    /// like the app dropped the write.
    @ViewBuilder private var bridgeNotice: some View {
        if list.externalSource == "apple_reminders" {
            Text("Synced with Apple Reminders")
                .font(.caption2)
                .foregroundStyle(Color.textSecondary)
                .padding(.bottom, 6)
        }
    }

    private func addItem() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let userId = auth.currentUser?.id else { return }

        let nextOrder = (items.map(\.sortOrder).max() ?? 0) + 1
        let item = SymphonyListItem(userId: userId, listId: list.id, text: text, sortOrder: nextOrder)
        modelContext.insert(item)
        modelContext.queueSync(table: "list_items", recordId: item.id, type: "insert")
        try? modelContext.save()

        draft = ""
        addFieldFocused = true   // keep going; adding one item usually means adding several
    }

    private func toggle(_ item: SymphonyListItem) {
        item.completed.toggle()
        item.completedAt = item.completed ? Date() : nil
        item.updatedAt = Date()
        modelContext.queueSync(table: "list_items", recordId: item.id, type: "update")
        try? modelContext.save()
    }

    private func delete(_ source: [SymphonyListItem], at offsets: IndexSet) {
        for offset in offsets {
            let item = source[offset]
            modelContext.queueSync(table: "list_items", recordId: item.id, type: "delete")
            modelContext.delete(item)
        }
        try? modelContext.save()
    }
}

private struct ItemRow: View {
    let item: SymphonyListItem
    let onToggle: () -> Void

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 12) {
                Image(systemName: item.completed ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(item.completed ? Color.accentColor : Color.textSecondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.text)
                        .strikethrough(item.completed)
                        .foregroundStyle(item.completed ? Color.textSecondary : Color.textPrimary)
                    if let note = item.note, !note.isEmpty {
                        Text(note).font(.caption).foregroundStyle(Color.textSecondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
