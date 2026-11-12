import SwiftUI

/// "Still to do" on Today (web TodayCarriedRoutines, Scott 2026-11-11: Pay FFG
/// was due on the 10th and stayed there): routines set to "Keep it until it's
/// done" whose last occurrence was missed. Each row ticks off (or skips) that
/// ORIGINAL occurrence and says where it is from. Nothing to carry, nothing drawn.
struct StillToDo: View {
    let carried: [CarriedRoutines.Carried]
    let today: Date
    let onDone: (CarriedRoutines.Carried) -> Void
    let onSkip: (CarriedRoutines.Carried) -> Void

    var body: some View {
        if !carried.isEmpty {
            Eyebrow(text: "Still to do")
            ForEach(carried) { c in row(c) }
        }
    }

    private func row(_ c: CarriedRoutines.Carried) -> some View {
        let from = CarriedRoutines.fromLabel(c.dueOn, today: today)
        return HStack(spacing: 10) {
            CheckCircle(checked: false, size: 24, label: c.routine.name) { onDone(c) }
            VStack(alignment: .leading, spacing: 2) {
                Text(c.routine.name)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(from)
                    .font(.bodySmall)
                    .foregroundStyle(Color.amberStrong)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            Button("Skip") { onSkip(c) }
                .font(.bodySmall)
                .foregroundStyle(Color.textSecondary)
                .buttonStyle(.plain)
                .frame(minWidth: 44, minHeight: 44)
                .accessibilityLabel("Skip \(c.routine.name) this time")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.cardBorder, lineWidth: 1))
        .padding(.horizontal, 16)
        .padding(.vertical, 3)
    }
}
