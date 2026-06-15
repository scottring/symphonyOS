import SwiftUI
import SwiftData
import Supabase

struct TaskDetailView: View {
    @Bindable var task: SymphonyTask
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @FocusState private var titleFocused: Bool

    @Query private var projects: [Project]
    @Query private var familyMembers: [FamilyMember]
    @Query private var contacts: [Contact]

    @State private var placeSuggestions: [PlacePrediction] = []
    @State private var placeSearchTask: Task<Void, Never>?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Title
                TextField("Task title", text: $task.title, axis: .vertical)
                    .font(.displayMedium)
                    .foregroundStyle(Color.textPrimary)
                    .focused($titleFocused)
                    .onChange(of: task.title) { _, _ in markDirty() }

                // Completion toggle
                Button {
                    task.completed.toggle()
                    markDirty()
                    #if os(iOS)
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                    #endif
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 20))
                        Text(task.completed ? "Completed" : "Mark Complete")
                            .font(.bodyMedium)
                    }
                    .foregroundStyle(task.completed ? Color.primaryTint : Color.textSecondary)
                }
                .buttonStyle(.plain)

                Divider()

                // Schedule
                VStack(alignment: .leading, spacing: 8) {
                    Label("Schedule", systemImage: "calendar")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    if let scheduled = task.scheduledFor {
                        HStack {
                            Text(scheduled.formatted(date: .long, time: task.isAllDay ? .omitted : .shortened))
                                .font(.bodyMedium)
                            Spacer()
                            Button("Clear") {
                                task.scheduledFor = nil
                                markDirty()
                            }
                            .font(.bodySmall)
                            .foregroundStyle(.red)
                        }
                    } else {
                        Text("Not scheduled")
                            .font(.bodyMedium)
                            .foregroundStyle(Color.textTertiary)
                    }
                }

                // Context
                VStack(alignment: .leading, spacing: 8) {
                    Label("Context", systemImage: "tag")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    HStack(spacing: 8) {
                        contextChip("Work", value: "work", color: .contextWork)
                        contextChip("Family", value: "family", color: .contextFamily)
                        contextChip("Personal", value: "personal", color: .contextPersonal)
                    }
                }

                // Assigned to
                if !familyMembers.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Assigned to", systemImage: "person.2")
                            .font(.bodySmallBold)
                            .foregroundStyle(Color.textSecondary)

                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 116), spacing: 8)],
                                  alignment: .leading, spacing: 8) {
                            ForEach(sortedMembers, id: \.id) { member in
                                assigneeChip(member)
                            }
                        }
                    }
                }

                // Project
                if !projects.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Project", systemImage: "folder")
                            .font(.bodySmallBold)
                            .foregroundStyle(Color.textSecondary)

                        Picker("Project", selection: Binding(
                            get: { task.projectId },
                            set: { task.projectId = $0; markDirty() }
                        )) {
                            Text("None").tag(Optional<UUID>.none)
                            ForEach(projects, id: \.id) { project in
                                Text(project.name).tag(Optional(project.id))
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }

                // Notes
                VStack(alignment: .leading, spacing: 8) {
                    Label("Notes", systemImage: "note.text")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    TextEditor(text: Binding(
                        get: { task.notes ?? "" },
                        set: { task.notes = $0.isEmpty ? nil : $0; markDirty() }
                    ))
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
                    .scrollContentBackground(.hidden)   // let our bgElevated show (TextEditor draws its own otherwise)
                    .frame(minHeight: 100)
                    .padding(8)
                    .background(Color.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(Color.textTertiary.opacity(0.2), lineWidth: 1)
                    )
                }

                // Linked contact (e.g. a place/service provider). The web stores
                // the place's phone on the contact, not the task — surface it here.
                if let contact = linkedContact {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Contact", systemImage: "person.crop.circle")
                            .font(.bodySmallBold)
                            .foregroundStyle(Color.textSecondary)
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(contact.name)
                                    .font(.bodyMedium)
                                    .foregroundStyle(Color.textPrimary)
                                if let phone = contact.phone, !phone.isEmpty {
                                    Text(phone)
                                        .font(.bodySmall)
                                        .foregroundStyle(Color.textSecondary)
                                }
                            }
                            Spacer()
                            if let phone = contact.phone, !phone.isEmpty {
                                Button { call(phone) } label: {
                                    Image(systemName: "phone.fill")
                                        .foregroundStyle(.white)
                                        .padding(10)
                                        .background(Color.primaryTint)
                                        .clipShape(Circle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                // Phone number (manual, task-level)
                VStack(alignment: .leading, spacing: 8) {
                    Label("Phone", systemImage: "phone")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    TextField("Phone number", text: Binding(
                        get: { task.phoneNumber ?? "" },
                        set: { task.phoneNumber = $0.isEmpty ? nil : $0; markDirty() }
                    ))
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
                    #if os(iOS)
                    .keyboardType(.phonePad)
                    #endif
                }

                // Location + directions
                VStack(alignment: .leading, spacing: 8) {
                    Label("Location", systemImage: "mappin.and.ellipse")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    TextField("Address or place", text: Binding(
                        get: { task.location ?? "" },
                        set: { newValue in
                            task.location = newValue.isEmpty ? nil : newValue
                            task.locationPlaceId = nil   // manual typing clears the resolved place
                            markDirty()
                            searchPlaces(newValue)
                        }
                    ))
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
                    .autocorrectionDisabled()
                    #if os(iOS)
                    .textInputAutocapitalization(.words)
                    #endif

                    // Google Places suggestions (via the places-proxy edge function)
                    ForEach(placeSuggestions) { prediction in
                        Button {
                            task.location = prediction.description
                            task.locationPlaceId = prediction.placeId
                            placeSuggestions = []
                            placeSearchTask?.cancel()
                            markDirty()
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: "mappin.circle")
                                    .foregroundStyle(Color.textTertiary)
                                Text(prediction.description)
                                    .font(.bodySmall)
                                    .foregroundStyle(Color.textPrimary)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.leading)
                                Spacer(minLength: 0)
                            }
                            .padding(.vertical, 7)
                            .padding(.horizontal, 4)
                        }
                        .buttonStyle(.plain)
                        Divider()
                    }

                    if let loc = task.location, !loc.isEmpty {
                        Button {
                            openLocation(loc)
                        } label: {
                            Label(isMeetingLink(loc) ? "Join meeting" : "Get directions",
                                  systemImage: isMeetingLink(loc) ? "video" : "arrow.triangle.turn.up.right.diamond")
                                .font(.bodySmallBold)
                                .foregroundStyle(Color.primaryTint)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Color.primaryTint.opacity(0.12))
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .padding(.top, 2)
                    }
                }

                // Delete
                Button(role: .destructive) {
                    let vm = TaskViewModel(modelContext: modelContext)
                    vm.deleteTask(task)
                    dismiss()
                } label: {
                    Label("Delete Task", systemImage: "trash")
                        .foregroundStyle(.red)
                        .font(.bodyMedium)
                }
                .padding(.top, 20)
            }
            .padding(20)
        }
        .background(Color.bgBase)
        .navigationTitle("Task")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func contextChip(_ label: String, value: String, color: Color) -> some View {
        Button {
            task.context = task.context == value ? nil : value
            markDirty()
        } label: {
            Text(label)
                .font(.bodySmallBold)
                .foregroundStyle(task.context == value ? .white : color)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(task.context == value ? color : color.opacity(0.12))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    // MARK: - Assignees

    private var sortedMembers: [FamilyMember] {
        familyMembers.sorted { $0.displayOrder < $1.displayOrder }
    }

    private var assignedSet: Set<UUID> {
        if let all = task.assignedToAll, !all.isEmpty { return Set(all) }
        if let one = task.assignedTo { return [one] }
        return []
    }

    private func toggleAssignee(_ member: FamilyMember) {
        var set = assignedSet
        if set.contains(member.id) { set.remove(member.id) } else { set.insert(member.id) }
        let arr = Array(set)
        task.assignedToAll = arr.isEmpty ? nil : arr
        task.assignedTo = arr.first
        markDirty()
    }

    @ViewBuilder
    private func assigneeChip(_ member: FamilyMember) -> some View {
        let isAssigned = assignedSet.contains(member.id)
        let color = Color.memberColor(member.color)
        Button {
            toggleAssignee(member)
        } label: {
            HStack(spacing: 6) {
                Text(member.initials)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 22, height: 22)
                    .background(color)
                    .clipShape(Circle())
                Text(member.name)
                    .font(.bodySmall)
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .background(isAssigned ? color.opacity(0.16) : Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(isAssigned ? color.opacity(0.55) : Color.textTertiary.opacity(0.15), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Location

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

    // MARK: - Linked contact

    private var linkedContact: Contact? {
        guard let cid = task.contactId else { return nil }
        return contacts.first { $0.id == cid }
    }

    private func call(_ phone: String) {
        #if os(iOS)
        let digits = phone.filter { $0.isNumber || $0 == "+" }
        if let url = URL(string: "tel:\(digits)") { UIApplication.shared.open(url) }
        #endif
    }

    // MARK: - Places autocomplete

    private func searchPlaces(_ query: String) {
        placeSearchTask?.cancel()
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard q.count >= 3 else {
            placeSuggestions = []
            return
        }
        placeSearchTask = Task {
            try? await Task.sleep(nanoseconds: 300_000_000)   // debounce typing
            if Task.isCancelled { return }
            let results = await PlacesService.autocomplete(q)
            if Task.isCancelled { return }
            await MainActor.run { placeSuggestions = results }
        }
    }

    private func markDirty() {
        task.updatedAt = Date()
        task.syncStatus = .pending
        // Enqueue a sync change so detail-sheet edits actually push to the server.
        modelContext.insert(PendingChange(tableName: "tasks", recordId: task.id, changeType: "update"))
        try? modelContext.save()
    }
}

// MARK: - Google Places (via the places-proxy edge function, same as the web)

struct PlacePrediction: Identifiable {
    let id = UUID()
    let placeId: String
    let description: String
}

enum PlacesService {
    static func autocomplete(_ input: String) async -> [PlacePrediction] {
        struct Body: Encodable {
            let action = "autocomplete"
            let input: String
        }
        do {
            let resp: PlacesAutocompleteResponse = try await supabase.functions.invoke(
                "places-proxy",
                options: FunctionInvokeOptions(body: Body(input: input))
            )
            return (resp.suggestions ?? []).compactMap { s in
                guard let p = s.placePrediction else { return nil }
                return PlacePrediction(placeId: p.placeId, description: p.text.text)
            }
        } catch {
            return []
        }
    }
}

private struct PlacesAutocompleteResponse: Decodable {
    let suggestions: [Suggestion]?
    struct Suggestion: Decodable {
        let placePrediction: Prediction?
    }
    struct Prediction: Decodable {
        let placeId: String
        let text: PredText
        struct PredText: Decodable { let text: String }
    }
}
