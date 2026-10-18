import SwiftUI
import SwiftData

/// "Review N unfinished items": work dated to the last two days that wasn't
/// done. Nothing carries forward on its own — each item gets a deliberate
/// decision (complete it, or move it), and anything not decided stays put.
struct UnfinishedSheet: View {
    /// Initial rows; the list re-derives live so decided rows leave it.
    let tasks: [SymphonyTask]

    @Environment(AppState.self) private var appState
    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var allTasks: [SymphonyTask]
    @Query private var focusRows: [TaskFocus]
    @Query private var familyMembers: [FamilyMember]

    @State private var triage = TriageController()
    @State private var datePickFor: [SymphonyTask] = []
    @Environment(\.dynamicTypeSize) private var typeSize

    private var userId: UUID { auth.currentUser?.id ?? UUID() }

    private var rows: [SymphonyTask] {
        PlanSnapshot(tasks: allTasks, commitments: [], focus: focusRows, routines: [], instances: [],
                     userId: auth.currentUser?.id, domain: appState.domainFilter.contextValue)
            .unfinished(on: Date())
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("From the last two days. Decide what happens to each — nothing moves on its own.")
                        .font(.bodyMedium)
                        .foregroundStyle(Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 8)
                    if rows.isEmpty {
                        Text("All reviewed.")
                            .font(.bodyMedium)
                            .foregroundStyle(Color.textTertiary)
                            .padding(20)
                    }
                    ForEach(rows, id: \.id) { task in
                        PlanTaskRow(task: task, meta: task.scheduledFor.map(dayLabel)) {
                            MoveMenuButton(title: task.title, onMove: { move([task], $0) },
                                           onPickDate: { datePickFor = [task] })
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 3)
                    }
                }
                .padding(.bottom, 16)
            }
            .background(Color.bgBase)
            .navigationTitle("Unfinished")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text("Unfinished").font(.displaySmall).foregroundStyle(Color.textPrimary)
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
            .safeAreaInset(edge: .bottom) {
                if let toast = triage.toast {
                    PlannerToast(message: toast.message, actionTitle: toast.snapshot == nil ? nil : "Undo") {
                        triage.undo(context: modelContext, userId: userId)
                    }
                    .padding(.bottom, 8)
                }
            }
            .sheet(item: $triage.areaRequest) { request in
                LifeAreaSheet(request: request, onConfirm: { areas in
                    triage.areaRequest = nil
                    triage.perform(request.tasks, to: request.destination, areas: areas,
                                   context: modelContext, userId: userId, members: familyMembers)
                }, onCancel: { triage.areaRequest = nil })
                .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium, .large])
            }
            .sheet(isPresented: Binding(get: { !datePickFor.isEmpty }, set: { if !$0 { datePickFor = [] } })) {
                SchedulePickerSheet { date, isAllDay in
                    let tasks = datePickFor
                    datePickFor = []
                    move(tasks, .day(date, allDay: isAllDay))
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    private func move(_ tasks: [SymphonyTask], _ destination: PlanWriter.Destination) {
        triage.request(tasks, to: destination, context: modelContext, userId: userId, members: familyMembers)
    }

    private func dayLabel(_ d: Date) -> String {
        PlanCalendar.calendar.isDateInYesterday(d) ? "Yesterday" : d.formatted(.dateTime.weekday(.wide))
    }
}
