import SwiftUI
import SwiftData

struct ProjectDetailView: View {
    @Bindable var project: Project
    @Environment(\.modelContext) private var modelContext
    @Environment(AuthService.self) private var auth
    @Query private var allTasks: [SymphonyTask]
    @State private var newTaskTitle = ""

    private var projectTasks: [SymphonyTask] {
        allTasks.filter { $0.projectId == project.id }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Title
                TextField("Project name", text: $project.name, axis: .vertical)
                    .font(.displayMedium)
                    .foregroundStyle(Color.textPrimary)
                    .onChange(of: project.name) { _, _ in markDirty() }

                // Status picker
                HStack {
                    Label("Status", systemImage: "circle.dotted")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    Spacer()

                    Picker("Status", selection: Binding(
                        get: { project.status },
                        set: { project.status = $0; markDirty() }
                    )) {
                        // Values must match the DB CHECK constraint
                        // (not_started | in_progress | on_hold | completed) —
                        // the old "active" tag was rejected by Postgres.
                        Text("Not Started").tag("not_started")
                        Text("In Progress").tag("in_progress")
                        Text("On Hold").tag("on_hold")
                        Text("Completed").tag("completed")
                    }
                    .pickerStyle(.menu)
                }

                // Context
                HStack(spacing: 8) {
                    Label("Context", systemImage: "tag")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    Spacer()

                    contextChip("Work", value: "work", color: .contextWork)
                    contextChip("Family", value: "family", color: .contextFamily)
                    contextChip("Personal", value: "personal", color: .contextPersonal)
                }

                Divider()

                // Notes
                VStack(alignment: .leading, spacing: 8) {
                    Label("Notes", systemImage: "note.text")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    TextEditor(text: Binding(
                        get: { project.notes ?? "" },
                        set: { project.notes = $0.isEmpty ? nil : $0; markDirty() }
                    ))
                    .font(.bodyMedium)
                    .frame(minHeight: 80)
                    .padding(8)
                    .background(Color.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }

                // Phone
                VStack(alignment: .leading, spacing: 8) {
                    Label("Phone", systemImage: "phone")
                        .font(.bodySmallBold)
                        .foregroundStyle(Color.textSecondary)

                    TextField("Phone number", text: Binding(
                        get: { project.phoneNumber ?? "" },
                        set: { project.phoneNumber = $0.isEmpty ? nil : $0; markDirty() }
                    ))
                    .font(.bodyMedium)
                    #if os(iOS)
                    .keyboardType(.phonePad)
                    #endif
                }

                Divider()

                // Tasks
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Label("Tasks", systemImage: "checklist")
                            .font(.bodySmallBold)
                            .foregroundStyle(Color.textSecondary)

                        Spacer()

                        Text("\(projectTasks.filter(\.completed).count)/\(projectTasks.count)")
                            .font(.captionBold)
                            .foregroundStyle(Color.textTertiary)
                    }

                    ForEach(projectTasks, id: \.id) { task in
                        HStack(spacing: 8) {
                            Image(systemName: task.completed ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(task.completed ? Color.primaryTint : Color.textTertiary)

                            Text(task.title)
                                .font(.bodyMedium)
                                .strikethrough(task.completed)
                                .foregroundStyle(task.completed ? Color.textTertiary : Color.textPrimary)
                        }
                    }

                    // Add task inline
                    HStack(spacing: 8) {
                        Image(systemName: "plus.circle")
                            .foregroundStyle(Color.primaryTint)

                        TextField("Add a task...", text: $newTaskTitle)
                            .font(.bodyMedium)
                            .onSubmit { addTask() }
                    }
                }
            }
            .padding(20)
        }
        .background(Color.bgBase)
        .navigationTitle("Project")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func contextChip(_ label: String, value: String, color: Color) -> some View {
        Button {
            project.context = project.context == value ? nil : value
            markDirty()
        } label: {
            Text(label)
                .font(.captionBold)
                .foregroundStyle(project.context == value ? .white : color)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(project.context == value ? color : color.opacity(0.12))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private func markDirty() {
        project.updatedAt = Date()
        project.syncStatus = .pending
        modelContext.queueSync(table: "projects", recordId: project.id, type: "update")
        try? modelContext.save()
    }

    private func addTask() {
        let trimmed = newTaskTitle.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        // Never fabricate a user_id: RLS rejects it server-side and the row
        // orphans locally. No session here means nothing to safely create.
        guard let userId = auth.currentUser?.id else { return }

        let task = SymphonyTask(
            userId: userId,
            title: trimmed,
            context: project.context
        )
        task.projectId = project.id
        modelContext.insert(task)
        modelContext.queueSync(table: "tasks", recordId: task.id, type: "insert")
        try? modelContext.save()
        newTaskTitle = ""
    }
}
