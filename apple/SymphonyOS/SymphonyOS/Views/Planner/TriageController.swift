import SwiftUI
import SwiftData

/// One triage flow for single rows and bulk selections (Inbox, unfinished
/// review). Mirrors the web's move contract:
/// • Unclassified items get a life area FIRST, all collected in one sheet,
///   existing classifications untouched. Cancel moves nothing and offers no Undo.
/// • A move lands on the device at once and is queued for sync; the toast
///   offers Undo, which restores every moved item exactly.
@Observable
final class TriageController {
    struct AreaRequest: Identifiable {
        let id = UUID()
        let tasks: [SymphonyTask]
        let unclassified: [SymphonyTask]
        let destination: PlanWriter.Destination
    }

    struct Toast: Identifiable {
        let id = UUID()
        let message: String
        let snapshot: PlanWriter.Snapshot?
    }

    var areaRequest: AreaRequest?
    var toast: Toast?

    static func label(for d: PlanWriter.Destination) -> String {
        switch d {
        case .today: return "Today"
        case .thisWeek: return "This week"
        case .someday: return "Someday"
        case .day(let date, _):
            if PlanCalendar.calendar.isDateInTomorrow(date) { return "Tomorrow" }
            return date.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
        }
    }

    /// Ask for missing life areas, or move straight away.
    func request(_ tasks: [SymphonyTask], to destination: PlanWriter.Destination,
                 context: ModelContext, userId: UUID, members: [FamilyMember]) {
        guard !tasks.isEmpty else { return }
        let unclassified = tasks.filter(PlanWriter.needsLifeArea)
        if unclassified.isEmpty {
            perform(tasks, to: destination, areas: [:], context: context, userId: userId, members: members)
        } else {
            areaRequest = AreaRequest(tasks: tasks, unclassified: unclassified, destination: destination)
        }
    }

    func perform(_ tasks: [SymphonyTask], to destination: PlanWriter.Destination, areas: [UUID: String],
                 context: ModelContext, userId: UUID, members: [FamilyMember]) {
        let writer = PlanWriter(context: context, userId: userId)
        var snap = PlanWriter.Snapshot()
        for t in tasks {
            snap.merge(writer.move(t, to: destination, lifeArea: areas[t.id], members: members))
        }
        let noun = tasks.count == 1 ? "“\(tasks[0].title)”" : "\(tasks.count) items"
        show(Toast(message: "Moved \(noun) to \(Self.label(for: destination))", snapshot: snap))
    }

    func undo(context: ModelContext, userId: UUID) {
        guard let snap = toast?.snapshot else { return }
        PlanWriter(context: context, userId: userId).undo(snap)
        show(Toast(message: "Undone", snapshot: nil))
    }

    func show(_ t: Toast) {
        toast = t
        #if os(iOS)
        UIAccessibility.post(notification: .announcement, argument: t.message)
        #endif
        let id = t.id
        // Long enough to reach Undo, including with VoiceOver.
        DispatchQueue.main.asyncAfter(deadline: .now() + 8) { [weak self] in
            if self?.toast?.id == id { self?.toast = nil }
        }
    }
}

// MARK: - Life-area sheet

/// "Where do these belong?" — one decision per unclassified item, collected
/// before anything moves.
struct LifeAreaSheet: View {
    let request: TriageController.AreaRequest
    let onConfirm: ([UUID: String]) -> Void
    let onCancel: () -> Void

    @State private var choices: [UUID: String] = [:]
    private static let areas = [("Work", "work"), ("Family", "family"), ("Personal", "personal")]

    private var allChosen: Bool { request.unclassified.allSatisfy { choices[$0.id] != nil } }
    private var destination: String { TriageController.label(for: request.destination) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(request.unclassified.count == 1 ? "Where does this belong?" : "Where do these belong?")
                        .font(.displayMedium)
                        .foregroundStyle(Color.textPrimary)
                        .accessibilityAddTraits(.isHeader)
                    Text(explainer)
                        .font(.bodyMedium)
                        .foregroundStyle(Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)

                    if request.unclassified.count > 1 {
                        HStack(spacing: 6) {
                            Text("All:").font(.bodySmall).foregroundStyle(Color.textTertiary)
                            ForEach(Self.areas, id: \.1) { name, value in
                                chip(name, on: request.unclassified.allSatisfy { choices[$0.id] == value }) {
                                    for t in request.unclassified { choices[t.id] = value }
                                }
                            }
                        }
                        .accessibilityElement(children: .contain)
                        .accessibilityLabel("Set all")
                    }

                    ForEach(request.unclassified, id: \.id) { task in
                        VStack(alignment: .leading, spacing: 8) {
                            Divider()
                            Text(task.title).font(.bodyMedium).foregroundStyle(Color.textPrimary)
                            ViewThatFits(in: .horizontal) {
                                HStack(spacing: 6) { chips(for: task) }
                                VStack(alignment: .leading, spacing: 6) { chips(for: task) }
                            }
                        }
                        .accessibilityElement(children: .contain)
                    }
                }
                .padding(20)
            }
            .background(Color.bgBase)
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 10) {
                    Button("Cancel", action: onCancel)
                        .buttonStyle(.symphonySecondary)
                    Button("Send to \(destination)") { onConfirm(choices) }
                        .buttonStyle(.symphony)
                        .disabled(!allChosen)
                        .opacity(allChosen ? 1 : 0.45)
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .background(Color.bgBase)
            }
        }
    }

    private var explainer: String {
        let n = request.unclassified.count
        let what = n == 1 ? "this item" : "the \(n) unclassified items"
        return "Before sending to \(destination), choose a life area for \(what). Nothing moves until you do."
    }

    @ViewBuilder
    private func chips(for task: SymphonyTask) -> some View {
        ForEach(Self.areas, id: \.1) { name, value in
            chip(name, on: choices[task.id] == value) { choices[task.id] = value }
                .accessibilityLabel("\(name) for \(task.title)")
        }
    }

    private func chip(_ label: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(label)
                .font(on ? .bodySmallBold : .bodySmall)
                .foregroundStyle(on ? Color.white : Color.textSecondary)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background(on ? Color.ink : Color.bgElevated, in: Capsule())
                .overlay(Capsule().strokeBorder(on ? Color.ink : Color.cardBorder, lineWidth: 1))
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}
