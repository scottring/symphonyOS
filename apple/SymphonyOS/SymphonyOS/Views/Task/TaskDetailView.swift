import SwiftUI
import SwiftData

struct TaskDetailView: View {
    @Bindable var task: SymphonyTask
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @FocusState private var titleFocused: Bool

    @Query private var projects: [Project]
    @Query private var familyMembers: [FamilyMember]

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
                    .frame(minHeight: 100)
                    .padding(8)
                    .background(Color.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .strokeBorder(Color.textTertiary.opacity(0.2), lineWidth: 1)
                    )
                }

                // Phone number
                VStack(alignment: .leading, spacing: 8) {
                    Label("Phone", systemImage: "phone")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    TextField("Phone number", text: Binding(
                        get: { task.phoneNumber ?? "" },
                        set: { task.phoneNumber = $0.isEmpty ? nil : $0; markDirty() }
                    ))
                    .font(.bodyMedium)
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
                        set: { task.location = $0.isEmpty ? nil : $0; markDirty() }
                    ))
                    .font(.bodyMedium)

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

    private func markDirty() {
        task.updatedAt = Date()
        task.syncStatus = .pending
        // Enqueue a sync change so detail-sheet edits actually push to the server.
        modelContext.insert(PendingChange(tableName: "tasks", recordId: task.id, changeType: "update"))
        try? modelContext.save()
    }
}
