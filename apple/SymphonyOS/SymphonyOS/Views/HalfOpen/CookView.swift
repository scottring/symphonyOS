#if os(iOS)
import SwiftUI
import AudioToolbox

/// Following a recipe on the half-open Duo, one step at a time in type you
/// can read from the counter (approved mockup, 2026-11-12). Like a laptop:
/// the step on the upright half, the timer and big Back / Next on the half
/// on the table. Standing like a book: ingredients on the left page, the
/// step on the right. A step that names a time gets a timer; ingredients
/// tick off as you get them out; the step's own ingredients are marked.
struct CookView: View {
    let session: CookSession
    let across: Bool
    /// Where the fold falls along the split axis.
    let split: CGFloat

    @Environment(AppState.self) private var appState
    @State private var showIngredients = false

    var body: some View {
        Group {
            if across {
                VStack(spacing: 0) {
                    reading.frame(height: split)
                    laptopControls.frame(maxHeight: .infinity)
                }
            } else {
                HStack(spacing: 0) {
                    ingredientsPage.frame(width: split)
                    stepPage.frame(maxWidth: .infinity)
                }
            }
        }
        .animation(.easeInOut(duration: 0.2), value: session.step)
        .sheet(isPresented: $showIngredients) {
            ScrollView {
                CookIngredients(session: session).padding(24)
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .task(id: session.timer) { await ringWhenDone() }
    }

    // MARK: - Laptop

    /// The upright half: the dish, where you are, and the step.
    private var reading: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text(session.dinner.title)
                    .font(.custom("DMSans-Medium", size: 15, relativeTo: .body))
                    .foregroundStyle(Color.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 12)
                stepCount
            }
            progress.padding(.top, 12)
            ScrollView {
                stepText(size: 36)
                    .padding(.top, 28)
                    .padding(.bottom, 12)
            }
            .scrollBounceBehavior(.basedOnSize)
            .simultaneousGesture(stepSwipe)
            usedChips
        }
        .padding(.horizontal, 40)
        .padding(.top, 30)
        .padding(.bottom, 24)
    }

    /// The half on the table: the timer, Back and Next, all the ingredients.
    private var laptopControls: some View {
        VStack(spacing: 14) {
            timerCard(tall: true)
            HStack(spacing: 14) {
                backButton(vertical: true)
                nextButton(vertical: true)
            }
            .frame(maxHeight: .infinity)
            HStack(spacing: 10) {
                Button { showIngredients = true } label: {
                    Label("All ingredients · \(gatheredSummary)", systemImage: "list.bullet")
                        .font(.bodyMedium)
                        .foregroundStyle(Color.textPrimary)
                        .frame(maxWidth: .infinity, minHeight: 48)
                        .background(Color.bgWarm, in: Capsule())
                }
                .buttonStyle(.plain)
                closeButton
            }
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 22)
    }

    // MARK: - Book

    private var ingredientsPage: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(session.dinner.title)
                .font(.custom("CrimsonPro-Regular", size: 32, relativeTo: .title))
                .foregroundStyle(Color.textPrimary)
                .lineLimit(3)
                .minimumScaleFactor(0.7)
            if let minutes = session.dinner.prepMinutes {
                Text("\(minutes) min")
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textSecondary)
                    .padding(.top, 4)
            }
            ScrollView {
                CookIngredients(session: session).padding(.top, 22)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .padding(.leading, 36)
        .padding(.trailing, 30)
        .padding(.top, 32)
        .padding(.bottom, 16)
    }

    private var stepPage: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                stepCount
                Spacer()
                closeButton
            }
            progress.padding(.top, 8)
            ScrollView {
                stepText(size: 31)
                    .padding(.top, 22)
                    .padding(.bottom, 12)
            }
            .scrollBounceBehavior(.basedOnSize)
            .simultaneousGesture(stepSwipe)
            timerCard(tall: false).padding(.bottom, 12)
            HStack(spacing: 12) {
                backButton(vertical: false)
                nextButton(vertical: false)
            }
            .frame(height: 84)
        }
        .padding(.leading, 30)
        .padding(.trailing, 32)
        .padding(.top, 28)
        .padding(.bottom, 20)
    }

    // MARK: - Pieces

    private var stepCount: some View {
        Text("Step \(session.step + 1) of \(session.steps.count)")
            .font(.bodySmall)
            .foregroundStyle(Color.textTertiary)
    }

    private var progress: some View {
        HStack(spacing: 6) {
            ForEach(session.steps.indices, id: \.self) { i in
                Capsule()
                    .fill(i < session.step ? Color.ink : i == session.step ? Color.amberStrong : Color.cardBorder)
                    .frame(height: 4)
            }
        }
        .accessibilityHidden(true)
    }

    /// The step, with the time it asks for marked.
    private func stepText(size: CGFloat) -> some View {
        let step = session.current
        var text = AttributedString(step)
        if let d = session.duration {
            var time = AttributedString(step[d.range])
            time.backgroundColor = Color.accentBg
            text = AttributedString(step[..<d.range.lowerBound]) + time + AttributedString(step[d.range.upperBound...])
        }
        return Text(text)
            .font(.custom("CrimsonPro-Regular", size: size, relativeTo: .title))
            .lineSpacing(size * 0.18)
            .foregroundStyle(Color.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
            .id(session.step)
            .transition(.opacity)
            .accessibilityLabel("Step \(session.step + 1). \(session.current)")
    }

    /// The ingredients this step names.
    @ViewBuilder private var usedChips: some View {
        let used = session.usedNow
        if !used.isEmpty {
            ChipFlow(spacing: 8) {
                ForEach(used, id: \.self) { i in
                    Text(session.dinner.ingredients[i])
                        .font(.bodySmall)
                        .foregroundStyle(Color.textPrimary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.bgWarm, in: Capsule())
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Uses " + used.map { session.dinner.ingredients[$0] }.joined(separator: ", "))
        }
    }

    private var gatheredSummary: String {
        "\(session.gathered.count) of \(session.dinner.ingredients.count) out"
    }

    private func backButton(vertical: Bool) -> some View {
        Button { session.back() } label: {
            stack(vertical) {
                Image(systemName: "chevron.left").font(.system(size: vertical ? 26 : 20, weight: .semibold))
                Text("Back").font(.bodyMedium)
            }
            .foregroundStyle(Color.textPrimary)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .overlay(RoundedRectangle(cornerRadius: 22).strokeBorder(Color.cardBorder, lineWidth: 1.5))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .frame(width: vertical ? 150 : 120)
        .disabled(session.step == 0)
        .opacity(session.step == 0 ? 0.4 : 1)
        .accessibilityLabel("Previous step")
    }

    private func nextButton(vertical: Bool) -> some View {
        Button(action: forwardOrFinish) {
            stack(vertical) {
                if vertical {
                    Image(systemName: session.isLast ? "checkmark" : "chevron.right").font(.system(size: 28, weight: .semibold))
                }
                Text(session.isLast ? "Done cooking" : "Next step")
                    .font(.custom("DMSans-Medium", size: 18, relativeTo: .body))
                if !vertical {
                    Image(systemName: session.isLast ? "checkmark" : "chevron.right").font(.system(size: 20, weight: .semibold))
                }
                if vertical, let next = session.next {
                    Text(next)
                        .font(.bodySmall)
                        .foregroundStyle(Color.bgBase.opacity(0.75))
                        .lineLimit(1)
                        .padding(.horizontal, 16)
                }
            }
            .foregroundStyle(Color.bgBase)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.ink, in: RoundedRectangle(cornerRadius: 22))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(session.next.map { "Next: \($0)" } ?? "")
    }

    @ViewBuilder
    private func stack<Content: View>(_ vertical: Bool, @ViewBuilder _ content: () -> Content) -> some View {
        if vertical { VStack(spacing: 6, content: content) } else { HStack(spacing: 8, content: content) }
    }

    private var closeButton: some View {
        Button {
            session.end()
            withAnimation(.easeInOut(duration: 0.25)) { appState.cook = nil }
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.textPrimary)
                .frame(width: 48, height: 48)
                .background(across ? Color.bgWarm : Color.clear, in: Circle())
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Stop cooking")
    }

    private func forwardOrFinish() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        if session.isLast {
            session.end()
            withAnimation(.easeInOut(duration: 0.25)) { appState.cook = nil }
        } else {
            session.forward()
        }
    }

    private var stepSwipe: some Gesture {
        DragGesture(minimumDistance: 30).onEnded { value in
            let dx = value.translation.width, dy = value.translation.height
            guard abs(dx) > 70, abs(dx) > abs(dy) * 2 else { return }
            if dx < 0 { if !session.isLast { session.forward() } } else { session.back() }
        }
    }

    // MARK: - The timer

    /// The running timer (whichever step set it), or this step's time to
    /// start one; nothing when neither.
    @ViewBuilder
    private func timerCard(tall: Bool) -> some View {
        if let timer = session.timer {
            TimelineView(.periodic(from: .now, by: 1)) { context in
                let left = timer.left(at: context.date)
                HStack(spacing: 14) {
                    Image(systemName: left == 0 ? "bell.fill" : "timer")
                        .font(.system(size: tall ? 24 : 20, weight: .medium))
                        .foregroundStyle(Color.amberStrong)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(left == 0 ? "Time's up" : RecipeCue.clock(left))
                            .font(.custom("DMSans-Medium", size: tall ? 26 : 22, relativeTo: .title2))
                            .monospacedDigit()
                            .foregroundStyle(Color.textPrimary)
                        if tall {
                            Text(timer.step == session.step ? "Step \(timer.step + 1) timer" : "From step \(timer.step + 1)")
                                .font(.bodySmall)
                                .foregroundStyle(Color.amberStrong)
                        }
                    }
                    Spacer(minLength: 8)
                    if left > 0 {
                        Button(timer.running ? "Pause" : "Resume") { session.pauseOrResume() }
                            .font(.custom("DMSans-SemiBold", size: 16, relativeTo: .body))
                            .foregroundStyle(Color.amberStrong)
                            .frame(minWidth: 44, minHeight: 44)
                            .buttonStyle(.plain)
                    }
                    Button { session.clearTimer() } label: {
                        Image(systemName: left == 0 ? "checkmark" : "xmark")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(Color.textSecondary)
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(left == 0 ? "Dismiss timer" : "Cancel timer")
                }
                .padding(.leading, 18)
                .padding(.trailing, 6)
                .frame(height: tall ? 72 : 56)
                .background(Color.accentBg, in: RoundedRectangle(cornerRadius: tall ? 18 : 16))
                .accessibilityElement(children: .contain)
            }
        } else if let d = session.duration {
            Button { session.startTimer(seconds: d.seconds) } label: {
                HStack(spacing: 14) {
                    Image(systemName: "timer")
                        .font(.system(size: tall ? 24 : 20, weight: .medium))
                        .foregroundStyle(Color.amberStrong)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(RecipeCue.clock(d.seconds))
                            .font(.custom("DMSans-Medium", size: tall ? 26 : 22, relativeTo: .title2))
                            .monospacedDigit()
                            .foregroundStyle(Color.textPrimary)
                        if tall {
                            Text("Timer").font(.bodySmall).foregroundStyle(Color.amberStrong)
                        }
                    }
                    Spacer()
                    Text("Start")
                        .font(.custom("DMSans-SemiBold", size: 16, relativeTo: .body))
                        .foregroundStyle(Color.amberStrong)
                }
                .padding(.horizontal, 18)
                .frame(height: tall ? 72 : 56)
                .background(Color.accentBg, in: RoundedRectangle(cornerRadius: tall ? 18 : 16))
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Start a \(RecipeCue.clock(d.seconds)) timer")
        }
    }

    /// A chime and a buzz when the timer runs out with Symphony open (the
    /// scheduled notification covers a locked screen).
    private func ringWhenDone() async {
        guard let timer = session.timer, let endsAt = timer.endsAt else { return }
        let wait = endsAt.timeIntervalSinceNow
        if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
        guard !Task.isCancelled, session.timer == timer else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        AudioServicesPlayAlertSound(SystemSoundID(1005))
    }
}

// MARK: - Ingredients

/// Every ingredient, ticked off as it comes out of the cupboard; the ones
/// this step uses are marked.
struct CookIngredients: View {
    let session: CookSession

    var body: some View {
        let used = Set(session.usedNow)
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                Text("Ingredients").eyebrowStyle().accessibilityAddTraits(.isHeader)
                Spacer()
                Text("\(session.gathered.count) of \(session.dinner.ingredients.count) out")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
            }
            .padding(.bottom, 6)
            .overlay(alignment: .bottom) { Rectangle().fill(Color.cardBorder).frame(height: 1) }
            ForEach(session.dinner.ingredients.indices, id: \.self) { i in
                let got = session.gathered.contains(i)
                HStack(spacing: 12) {
                    CheckCircle(checked: got, size: 20, label: session.dinner.ingredients[i]) {
                        withAnimation(.easeInOut(duration: 0.15)) { session.toggleGathered(i) }
                    }
                    Text(session.dinner.ingredients[i])
                        .font(.bodyMedium)
                        .foregroundStyle(got ? Color.textTertiary : Color.textPrimary)
                        .strikethrough(got && !used.contains(i), color: Color.textTertiary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.vertical, 6)
                .padding(.horizontal, 8)
                .background(used.contains(i) ? Color.accentBg : Color.clear, in: RoundedRectangle(cornerRadius: 8))
                .padding(.horizontal, -8)
                .overlay(alignment: .bottom) { Rectangle().fill(Color.cardBorder.opacity(0.6)).frame(height: 1) }
                .accessibilityValue(used.contains(i) ? "Used in this step" : "")
            }
        }
    }
}

// MARK: - Chips that wrap

/// Lays its children left to right, wrapping onto new lines.
struct ChipFlow: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        let rows = arrange(subviews, width: width)
        let height = rows.last.map { $0.y + $0.height } ?? 0
        let used = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? used, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(subviews, width: bounds.width) {
            var x = bounds.minX
            for i in row.items {
                let size = subviews[i].sizeThatFits(.init(width: bounds.width, height: nil))
                subviews[i].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: .init(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row { var items: [Int] = []; var y: CGFloat = 0; var width: CGFloat = 0; var height: CGFloat = 0 }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for i in subviews.indices {
            let size = subviews[i].sizeThatFits(.init(width: width, height: nil))
            let needed = row.items.isEmpty ? size.width : row.width + spacing + size.width
            if needed > width, !row.items.isEmpty {
                rows.append(row)
                row = Row(y: row.y + row.height + spacing)
            }
            row.width = row.items.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.items.append(i)
        }
        if !row.items.isEmpty { rows.append(row) }
        return rows
    }
}
#endif
