import SwiftUI
import SwiftData

struct ContactListView: View {
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Contact.name) private var contacts: [Contact]
    @State private var showingNewContact = false
    @State private var searchText = ""

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()

            if contacts.isEmpty {
                emptyState
            } else {
                List {
                    let grouped = Dictionary(grouping: filteredContacts) { group(for: $0) }
                    ForEach(grouped.keys.sorted(), id: \.self) { key in
                        Section(key) {
                            ForEach(grouped[key] ?? [], id: \.id) { contact in
                                NavigationLink {
                                    ContactDetailView(contact: contact)
                                } label: {
                                    ContactRow(contact: contact)
                                }
                            }
                            .onDelete { offsets in
                                let sectionContacts = grouped[key] ?? []
                                for offset in offsets {
                                    modelContext.queueSync(table: "contacts", recordId: sectionContacts[offset].id, type: "delete")
                                    modelContext.delete(sectionContacts[offset])
                                }
                                try? modelContext.save()
                            }
                        }
                    }
                }
                .scrollContentBackground(.hidden)
                .searchable(text: $searchText)
            }
        }
        .navigationTitle("Contacts")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingNewContact = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingNewContact) {
            if let userId = auth.currentUser?.id {
                NewContactSheet(userId: userId)
                    .presentationDetents([.medium])
            }
        }
    }

    private var filteredContacts: [Contact] {
        if searchText.isEmpty { return contacts }
        return contacts.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    private func group(for contact: Contact) -> String {
        contact.category?.capitalized ?? "Other"
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.2")
                .font(.system(size: 48))
                .foregroundStyle(Color.textLight)
            Text("No Contacts")
                .font(.displayMedium)
            Text("Add contacts to link them to tasks.")
                .font(.bodySmall)
                .foregroundStyle(Color.textSecondary)
        }
    }
}

// MARK: - Contact Row

struct ContactRow: View {
    let contact: Contact

    var body: some View {
        HStack(spacing: 12) {
            // Avatar circle
            Circle()
                .fill(Color.primaryTint.opacity(0.15))
                .frame(width: 36, height: 36)
                .overlay(
                    Text(String(contact.name.prefix(1)).uppercased())
                        .font(.bodyMediumBold)
                        .foregroundStyle(Color.primaryTint)
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(contact.name)
                    .font(.bodyMedium)

                if let phone = contact.phone, !phone.isEmpty {
                    Text(phone)
                        .font(.captionText)
                        .foregroundStyle(Color.textSecondary)
                }
            }
        }
    }
}

// MARK: - Contact Detail

struct ContactDetailView: View {
    @Bindable var contact: Contact
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var allTasks: [SymphonyTask]

    private var linkedTasks: [SymphonyTask] {
        allTasks.filter { $0.contactId == contact.id }
    }

    var body: some View {
        Form {
            Section("Details") {
                TextField("Name", text: $contact.name)
                    .font(.displaySmall)
                    .onChange(of: contact.name) { _, _ in markDirty() }

                TextField("Phone", text: Binding(
                    get: { contact.phone ?? "" },
                    set: { contact.phone = $0.isEmpty ? nil : $0; markDirty() }
                ))
                #if os(iOS)
                .keyboardType(.phonePad)
                #endif

                TextField("Email", text: Binding(
                    get: { contact.email ?? "" },
                    set: { contact.email = $0.isEmpty ? nil : $0; markDirty() }
                ))
                #if os(iOS)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                #endif

                Picker("Category", selection: Binding(
                    get: { contact.category ?? "" },
                    set: { contact.category = $0.isEmpty ? nil : $0; markDirty() }
                )) {
                    Text("None").tag("")
                    Text("Family").tag("family")
                    Text("Friend").tag("friend")
                    Text("Work").tag("work")
                    Text("Medical").tag("medical")
                    Text("Service").tag("service")
                }
            }

            Section("Notes") {
                TextEditor(text: Binding(
                    get: { contact.notes ?? "" },
                    set: { contact.notes = $0.isEmpty ? nil : $0; markDirty() }
                ))
                .frame(minHeight: 60)
            }

            if !linkedTasks.isEmpty {
                Section("Linked Tasks") {
                    ForEach(linkedTasks, id: \.id) { task in
                        HStack(spacing: 8) {
                            Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(task.completed ? Color.primaryTint : Color.textTertiary)
                            Text(task.title)
                                .font(.bodyMedium)
                                .strikethrough(task.completed)
                        }
                    }
                }
            }

            Section {
                Button(role: .destructive) {
                    modelContext.queueSync(table: "contacts", recordId: contact.id, type: "delete")
                    modelContext.delete(contact)
                    try? modelContext.save()
                    dismiss()
                } label: {
                    Label("Delete Contact", systemImage: "trash")
                }
            }
        }
        .navigationTitle("Contact")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func markDirty() {
        contact.updatedAt = Date()
        contact.syncStatus = .pending
        modelContext.queueSync(table: "contacts", recordId: contact.id, type: "update")
        try? modelContext.save()
    }
}

// MARK: - New Contact Sheet

struct NewContactSheet: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var phone = ""
    @State private var email = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("Name", text: $name)
                    .font(.displaySmall)
                TextField("Phone", text: $phone)
                    #if os(iOS)
                    .keyboardType(.phonePad)
                    #endif
                TextField("Email", text: $email)
                    #if os(iOS)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    #endif
            }
            .navigationTitle("New Contact")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let contact = Contact(userId: userId, name: name.trimmingCharacters(in: .whitespaces))
                        if !phone.isEmpty { contact.phone = phone }
                        if !email.isEmpty { contact.email = email }
                        modelContext.insert(contact)
                        modelContext.queueSync(table: "contacts", recordId: contact.id, type: "insert")
                        try? modelContext.save()
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}
