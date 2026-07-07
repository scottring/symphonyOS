import SwiftUI
import SwiftData

struct ProjectListView: View {
    @Environment(AuthService.self) private var auth
    @Environment(AppState.self) private var appState
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \Project.name) private var allProjects: [Project]
    @State private var showingNewProject = false

    var body: some View {
        ZStack {
            Color.bgBase.ignoresSafeArea()

            if filteredProjects.isEmpty {
                emptyState
            } else {
                List {
                    ForEach(groupedProjects.keys.sorted(), id: \.self) { status in
                        Section(status.capitalized) {
                            ForEach(groupedProjects[status] ?? [], id: \.id) { project in
                                NavigationLink {
                                    ProjectDetailView(project: project)
                                } label: {
                                    ProjectRow(project: project)
                                }
                            }
                            .onDelete { offsets in
                                deleteProjects(status: status, at: offsets)
                            }
                        }
                    }
                }
                .scrollContentBackground(.hidden)
            }
        }
        .navigationTitle("Projects")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingNewProject = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingNewProject) {
            if let userId = auth.currentUser?.id {
                NewProjectSheet(userId: userId)
                    .presentationDetents([.medium])
            }
        }
    }

    private var filteredProjects: [Project] {
        DomainFilterService.filterProjects(allProjects, domain: appState.domainFilter)
    }

    private var groupedProjects: [String: [Project]] {
        Dictionary(grouping: filteredProjects) { $0.status }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "folder")
                .font(.system(size: 48))
                .foregroundStyle(Color.primaryTint.opacity(0.5))
            Text("No Projects")
                .font(.displaySmall)
            Text("Create a project to organize related tasks.")
                .font(.bodySmall)
                .foregroundStyle(Color.textSecondary)
        }
    }

    private func deleteProjects(status: String, at offsets: IndexSet) {
        let projects = groupedProjects[status] ?? []
        for index in offsets {
            modelContext.queueSync(table: "projects", recordId: projects[index].id, type: "delete")
            modelContext.delete(projects[index])
        }
        try? modelContext.save()
    }
}

// MARK: - Project Row

struct ProjectRow: View {
    let project: Project

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text(project.name)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)

                if let context = project.context {
                    ContextBadge(context: context)
                }
            }
        }
    }

    private var statusColor: Color {
        switch project.status {
        case "in_progress": .statusActive
        case "completed": .statusCompleted
        case "not_started": .textTertiary
        default: .textTertiary
        }
    }
}

// MARK: - New Project Sheet

struct NewProjectSheet: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var context: String?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                TextField("Project name", text: $name)
                    .font(.displaySmall)
                    .padding(12)

                HStack(spacing: 8) {
                    contextChip("Work", value: "work", color: .contextWork)
                    contextChip("Family", value: "family", color: .contextFamily)
                    contextChip("Personal", value: "personal", color: .contextPersonal)
                }
                .padding(.horizontal, 12)

                Spacer()
            }
            .padding(.top, 20)
            .navigationTitle("New Project")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") {
                        let project = Project(userId: userId, name: name, context: context)
                        modelContext.insert(project)
                        modelContext.queueSync(table: "projects", recordId: project.id, type: "insert")
                        try? modelContext.save()
                        dismiss()
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }

    private func contextChip(_ label: String, value: String, color: Color) -> some View {
        Button {
            context = context == value ? nil : value
        } label: {
            Text(label)
                .font(.bodySmallBold)
                .foregroundStyle(context == value ? .white : color)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(context == value ? color : color.opacity(0.12))
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }
}
