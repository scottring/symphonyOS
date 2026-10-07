import SwiftUI
import SwiftData

/// One occurrence of a routine — what a tap on a routine opens on Today. Done,
/// Move this time, Skip this time (web `RoutineMoveButton`, #115), and the way
/// into the routine itself. Every move is for this occurrence only; the
/// routine keeps its schedule.
struct RoutineOccurrenceSheet: View {
    let routine: Routine
    /// The day the occurrence is on (Today's selected date).
    let date: Date
    let completed: Bool

    @Environment(AuthService.self) private var auth
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var pickingDate = false
    @State private var pickedDate = Date()

    private var writer: PlanWriter { PlanWriter(context: modelContext, userId: auth.currentUser?.id ?? UUID()) }
    private var key: String { routine.id.uuidString.lowercased() }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    actionRow(completed ? "Mark not done" : "Done", systemImage: completed ? "arrow.uturn.backward" : "checkmark.circle") {
                        writer.setOccurrence(entityType: "routine", entityId: key, on: date, status: completed ? "pending" : "completed")
                        dismiss()
                    }

                    Eyebrow(text: "Move this time to")
                    ForEach(Self.targets(from: date), id: \.label) { target in
                        actionRow(target.label, detail: target.day.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day()),
                                  systemImage: "calendar") {
                            move(to: target.day)
                        }
                    }
                    actionRow("Pick a date…", systemImage: "calendar.badge.plus") { pickingDate.toggle() }
                    if pickingDate {
                        DatePicker("Move to", selection: $pickedDate, in: PlanCalendar.addDays(PlanCalendar.day(date), 1)..., displayedComponents: .date)
                            .datePickerStyle(.graphical)
                            .tint(Color.amberStrong)
                            .padding(.horizontal, 16)
                        Button("Move to \(pickedDate.formatted(.dateTime.weekday(.wide).month(.wide).day()))") { move(to: pickedDate) }
                            .font(.bodyMediumBold)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(Color.ink, in: RoundedRectangle(cornerRadius: 12))
                            .padding(.horizontal, 16)
                            .buttonStyle(.plain)
                    }

                    actionRow("Skip this time", systemImage: "circle.slash") {
                        writer.setOccurrence(entityType: "routine", entityId: key, on: date, status: "skipped")
                        dismiss()
                    }
                    .padding(.top, 8)

                    Text("Only this time — the routine keeps its schedule.")
                        .font(.bodySmall)
                        .foregroundStyle(Color.textTertiary)
                        .padding(.horizontal, 20)
                        .padding(.top, 6)

                    NavigationLink {
                        RoutineDetailView(routine: routine)
                    } label: {
                        HStack {
                            Text("Edit routine")
                            Spacer()
                            Image(systemName: "chevron.right").font(.captionBold)
                        }
                        .font(.bodyMedium)
                        .foregroundStyle(Color.textSecondary)
                        .padding(.horizontal, 20)
                        .frame(minHeight: 44)
                    }
                    .padding(.top, 16)
                }
                .padding(.bottom, 16)
            }
            .background(Color.bgBase)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Text(routine.name).font(.displaySmall).foregroundStyle(Color.textPrimary).lineLimit(1)
                }
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
    }

    private func move(to day: Date) {
        writer.moveRoutine(routine, from: date, to: day)
        dismiss()
    }

    private func actionRow(_ title: String, detail: String? = nil, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 16))
                    .foregroundStyle(Color.amberStrong)
                    .frame(width: 24)
                Text(title).font(.bodyMedium).foregroundStyle(Color.textPrimary)
                Spacer()
                if let detail { Text(detail).font(.bodySmall).foregroundStyle(Color.textTertiary) }
            }
            .padding(.horizontal, 20)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(detail.map { "\(title), \($0)" } ?? title)
    }

    /// The days one occurrence can move to (web ROUTINE_MOVE_WHENS: tomorrow,
    /// both weekend days, next week) — never "someday": an occurrence has to
    /// be on a day.
    static func targets(from date: Date) -> [(label: String, day: Date)] {
        let cal = PlanCalendar.calendar
        let today = PlanCalendar.day(date)
        let weekday = cal.component(.weekday, from: today)   // 1 = Sun … 7 = Sat
        var out: [(String, Date)] = [("Tomorrow", PlanCalendar.addDays(today, 1))]
        // This weekend: the coming Saturday and Sunday, or what's left of the
        // one in progress.
        let toSaturday = (7 - weekday) % 7
        let saturday = PlanCalendar.addDays(today, toSaturday)
        if weekday != 1 && toSaturday > 1 { out.append(("Saturday", saturday)) }
        if weekday != 1 { out.append(("Sunday", PlanCalendar.addDays(saturday, 1))) }
        // Next week: the coming Monday.
        let toMonday = (9 - weekday) % 7 == 0 ? 7 : (9 - weekday) % 7
        out.append(("Next week", PlanCalendar.addDays(today, toMonday)))
        // Drop anything that repeats Tomorrow.
        var seen = Set<String>()
        return out.filter { seen.insert(PlanCalendar.ymd($0.1)).inserted }.map { (label: $0.0, day: $0.1) }
    }
}
