import SwiftUI
import SwiftData

/// "Choose from this week" — the shelf for one day. Two clearly separate
/// kinds of thing: this week's TASKS (adding one plans it for the day and it
/// stays on the week's list) and ROUTINE OCCURRENCES due on the displayed
/// date, including flexible weekly routines with no day yet (adding one plans
/// that occurrence only; the repeating pattern never changes).
struct ChooserSheet: View {
    let date: Date

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @Query private var tasks: [SymphonyTask]
    @Query private var commitments: [TaskCommitment]
    @Query private var focusRows: [TaskFocus]
    @Query private var routines: [Routine]
    @Query private var instances: [ActionableInstance]
    @Query private var familyMembers: [FamilyMember]

    @State private var needsArea: SymphonyTask?
    @State private var toast: TriageController.Toast?

    private var userId: UUID { auth.currentUser?.id ?? UUID() }
    private var isToday: Bool { PlanCalendar.calendar.isDateInToday(date) }
    private var dayWord: String { isToday ? "today" : date.formatted(.dateTime.weekday(.wide)) }

    private var plan: PlanSnapshot {
        PlanSnapshot(tasks: tasks, commitments: commitments, focus: focusRows, routines: routines,
                     instances: instances, userId: auth.currentUser?.id, domain: appState.domainFilter.contextValue)
    }

    var body: some View {
        let plan = plan
        let offeredTasks = plan.chooserTasks(on: date)
        let offeredRoutines = plan.chooserRoutines(on: date)

        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Adding a task plans it for \(dayWord). It stays on this week's list too.")
                        .font(.bodyMedium)
                        .foregroundStyle(Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 20)
                        .padding(.top, 4)

                    Eyebrow(text: "This week's tasks", count: offeredTasks.count)
                    if offeredTasks.isEmpty {
                        quiet("Nothing else on this week's list.")
                    }
                    ForEach(offeredTasks, id: \.id) { task in
                        taskRow(task)
                    }

                    Eyebrow(text: isToday ? "Routines due today" : "Routines due \(date.formatted(.dateTime.weekday(.wide)))",
                            count: offeredRoutines.count)
                    if offeredRoutines.isEmpty {
                        quiet("No routine occurrences waiting for \(dayWord).")
                    }
                    ForEach(offeredRoutines) { offer in
                        routineRow(offer)
                    }
                    Text("Adding a routine plans \(isToday ? "today's" : "this day's") occurrence only. Its repeating pattern doesn't change.")
                        .font(.bodySmall)
                        .foregroundStyle(Color.textTertiary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 20)
                        .padding(.top, 10)
                        .padding(.bottom, 24)
                }
            }
            .background(Color.bgBase)
            .navigationTitle("Choose from this week")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Choose from this week").font(.displaySmall).foregroundStyle(Color.textPrimary)
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                if let toast {
                    PlannerToast(message: toast.message, actionTitle: toast.snapshot == nil ? nil : "Undo") {
                        if let snap = toast.snapshot { PlanWriter(context: modelContext, userId: userId).undo(snap) }
                        self.toast = nil
                    }
                    .padding(.bottom, 8)
                }
            }
            .confirmationDialog("Which life area?", isPresented: Binding(get: { needsArea != nil }, set: { if !$0 { needsArea = nil } }),
                                titleVisibility: .visible, presenting: needsArea) { task in
                ForEach([("Work", "work"), ("Family", "family"), ("Personal", "personal")], id: \.1) { name, value in
                    Button(name) {
                        TaskViewModel(modelContext: modelContext).setContext(task, context: value, members: familyMembers)
                        add(task)
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: { task in
                Text("Choose a life area for “\(task.title)” before planning it. Nothing changes until you do.")
            }
        }
    }

    private func quiet(_ text: String) -> some View {
        Text(text)
            .font(.bodySmall)
            .foregroundStyle(Color.textTertiary)
            .padding(.horizontal, 20)
            .padding(.vertical, 6)
    }

    // MARK: Tasks

    private func taskRow(_ task: SymphonyTask) -> some View {
        PlanTaskRow(task: task, meta: weekendMeta(task)) {
            AddButton(title: task.title, added: false) {
                if PlanWriter.needsLifeArea(task) { needsArea = task } else { add(task) }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
    }

    private func weekendMeta(_ task: SymphonyTask) -> String? {
        task.weekendStart != nil ? "This weekend" : nil
    }

    private func add(_ task: SymphonyTask) {
        let snap = PlanWriter(context: modelContext, userId: userId).planTask(task, on: date)
        toast = TriageController.Toast(message: "Added “\(task.title)” to \(dayWord)", snapshot: snap)
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        UIAccessibility.post(notification: .announcement, argument: "Added \(task.title) to \(dayWord)")
        #endif
    }

    // MARK: Routines

    private func routineRow(_ offer: PlanSnapshot.RoutineOffer) -> some View {
        let r = offer.routine
        return HStack(spacing: 10) {
            Image(systemName: "repeat")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color.textSecondary)
                .accessibilityLabel("Routine")
            VStack(alignment: .leading, spacing: 2) {
                Text(r.name).font(.bodyMedium).foregroundStyle(Color.textPrimary).lineLimit(3)
                Text(offer.flexible ? "Any day this week" : "Due \(dayWord)")
                    .font(.bodySmall).foregroundStyle(Color.textTertiary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if r.context != nil { ContextDot(context: r.context) }
            AssigneeAvatars(memberIds: r.assignedTo.map { [$0] } ?? [], members: familyMembers, size: 20)
            AddButton(title: r.name, added: offer.chosen) {
                let writer = PlanWriter(context: modelContext, userId: userId)
                if offer.chosen {
                    writer.unchooseRoutine(r, on: date, flexible: offer.flexible)
                } else {
                    writer.chooseRoutine(r, on: date, flexible: offer.flexible)
                    #if os(iOS)
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    #endif
                }
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 10)
        .padding(.vertical, 8)
        .frame(minHeight: 52)
        .background(Color.bgWarm, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
        .accessibilityElement(children: .contain)
    }
}

/// "Add" / "Added" pill. Added is a toggle back off.
struct AddButton: View {
    let title: String
    let added: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                if added { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)) }
                Text(added ? "Added" : "Add")
            }
            .font(.bodySmallBold)
            .foregroundStyle(added ? Color.white : Color.ink)
            .padding(.horizontal, 14)
            .frame(minHeight: 32)
            .background(added ? Color.ink : Color.bgElevated, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.ink, lineWidth: 1))
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(added ? "Added \(title). Remove from this day" : "Add \(title)")
    }
}
