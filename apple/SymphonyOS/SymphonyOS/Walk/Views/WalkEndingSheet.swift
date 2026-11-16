#if os(iOS)
import SwiftUI

/// Look back up (step 6): the one-line header over the whole plan, and Today as a
/// sheet of paper drawn on the stage (contract §13). It peeks at stage y 716 and
/// rises to y 130; it is not a system sheet. What it shows comes from the model
/// (`endingRows`, `ring`, `nextUp`, `dayLine`, `nextToWalk`) and the state
/// (`endingTitle`, `sheetRaised`, `sheetHandleLabel`); taps go back as events.
/// The paper runs on past the board over its bleed (`WalkStage.bleed`), so it meets the
/// window's edges; its content stays where the board puts it.
struct WalkEndingView: View {
    let model: WalkModel
    @Environment(\.walkStage) private var device
    /// The sheet rises from below the screen the first time it appears.
    @State private var risen = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let peekTop: CGFloat = 716
    static let raisedTop: CGFloat = 130
    /// `cubic-bezier(.2,.8,.2,1)`: 600 ms to raise or lower, 900 ms to rise in.
    static let move = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.6)
    static let rise = Animation.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.9)

    var body: some View {
        let s = model.state
        let stage = model.art.stage
        let top = s.sheetRaised ? Self.raisedTop : Self.peekTop
        let bleed = device.bleed
        // The header, the hint and the sheet's content stand in the reading column (on a phone, the board).
        let column = WalkLayout.column(wing: device.wing)
        let width = column.upperBound - column.lowerBound
        ZStack(alignment: .topLeading) {
            Text(s.endingTitle)
                .font(.custom("CrimsonPro-Regular", fixedSize: 24))
                .foregroundStyle(.white)
                .walkGlow()
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .padding(.horizontal, WalkLayout.lookBackInset)
                .frame(width: width, alignment: .leading)
                .offset(x: column.lowerBound, y: WalkLayout.lookBackHeaderTop)
                .allowsHitTesting(false)
                .accessibilityAddTraits(.isHeader)
                .accessibilitySortPriority(3)       // read before the flags behind it
            // "Tap a post to see that area", once, while other areas stand at the side and the sheet is down.
            if let hint = model.layout(wing: device.wing).lookBackHint, !s.sheetRaised {
                Text(WalkCopy.lookBackHint)
                    .font(.custom("DMSans-Regular", fixedSize: 12.5))
                    .foregroundStyle(.white)
                    .walkGlow()
                    .lineLimit(1)
                    .frame(width: hint.width, height: hint.height, alignment: .leading)
                    .offset(x: hint.minX, y: hint.minY)
                    .allowsHitTesting(false)
                    .accessibilitySortPriority(2.5)
                    .accessibilityIdentifier("walk.lookback.hint")
            }
            WalkEndingSheet(model: model, raised: s.sheetRaised,
                            bleed: WalkStage.Bleed(left: bleed.left + column.lowerBound, right: bleed.right + stage.width - column.upperBound,
                                                   top: bleed.top, bottom: bleed.bottom))
                .frame(width: width, height: stage.height - top, alignment: .top)
                .offset(x: column.lowerBound, y: top)
                .offset(y: risen ? 0 : stage.height - top + bleed.bottom)
                .animation(reduceMotion ? WalkSceneView.crossFade : Self.move, value: top)
        }
        .frame(width: stage.width, height: stage.height, alignment: .topLeading)
        .onAppear { withAnimation(reduceMotion ? WalkSceneView.crossFade : Self.rise) { risen = true } }
    }
}

/// The paper itself: handle, today's date and ring, the next event, the rows,
/// "Walk another one down", the closing line and "Open Today". It is laid out in the reading
/// column; `bleed` is how far its paper runs past the column to the window's edges.
struct WalkEndingSheet: View {
    let model: WalkModel
    let raised: Bool
    /// How far the paper runs past the board's sides and foot, in stage points.
    let bleed: WalkStage.Bleed
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 0) {
            // Lowered, the handle and the head stop growing at the large text size (S27), so the date
            // stays above the home indicator at every size.
            handle
                .dynamicTypeSize(raised ? ...DynamicTypeSize.xLarge : ...DynamicTypeSize.large)
            ScrollViewReader { scroller in
                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 12) {
                        head.id(Self.top)
                            .dynamicTypeSize(raised ? ...DynamicTypeSize.xLarge : ...DynamicTypeSize.large)
                        if let next = model.nextUp { nextCard(next) }
                        if !model.endingRows.isEmpty { rows }
                        if let name = model.nextToWalk { walkAnother(name) }
                        if let line = model.dayLine {
                            Text(line)
                                .font(.custom("CrimsonPro-Regular", size: 22))
                                .foregroundStyle(EndingPaper.deepGreen)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 4)
                        }
                        goToToday
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 28)
                }
                .scrollDisabled(!raised)
                .onChange(of: raised) { _, up in
                    // Lowered, the peek shows the date and the ring again, not the middle of the list.
                    guard !up else { return }
                    withAnimation(reduceMotion ? WalkSceneView.crossFade : WalkEndingView.move) {
                        scroller.scrollTo(Self.top, anchor: .top)
                    }
                }
            }
        }
        .padding(.top, 4)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(
            UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28)
                .fill(EndingPaper.sheet)
                .shadow(color: Color(red: 30 / 255, green: 38 / 255, blue: 40 / 255).opacity(0.18), radius: 20, x: 0, y: -10)
                .padding(EdgeInsets(top: 0, leading: -bleed.left, bottom: -bleed.bottom, trailing: -bleed.right))
        )
        .task(id: CalendarFeed.shared.readKey(for: model.periods.today)) {
            await CalendarFeed.shared.refresh(model.periods.today, maxAge: 60)
        }
    }

    private static let top = "walk.ending.top"
    /// The handle and "Go to Today" stay tall enough to tap on the smallest phone the stage shrinks to.
    static let tapHeight: CGFloat = 56

    // MARK: Handle

    /// A labelled button (S37): a capsule 36 high, its words and a chevron (up to raise the sheet, down
    /// to lower it) 20 in from either end, inside the 56-point tap height. With nothing to look back at,
    /// only the grabber.
    @ViewBuilder private var handle: some View {
        if let label = model.state.sheetHandleLabel {
            Button { model.send(.sheetHandle) } label: {
                HStack(spacing: 6) {
                    Text(label)
                        .font(.custom("DMSans-SemiBold", size: 14))
                        .lineLimit(1)
                    Image(systemName: raised ? "chevron.down" : "chevron.up")
                        .font(.system(size: 12, weight: .semibold))
                        .accessibilityHidden(true)
                }
                .foregroundStyle(EndingPaper.deepGreen)
                .padding(.horizontal, 20)
                .frame(height: 36)
                .background(Capsule().fill(EndingPaper.walkFill))
                .frame(maxWidth: .infinity, minHeight: Self.tapHeight)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
            .accessibilityIdentifier("walk.sheetHandle")
        } else {
            Capsule().fill(EndingPaper.grabber).frame(width: 40, height: 5)
                .frame(maxWidth: .infinity, minHeight: 20)
                .accessibilityHidden(true)
        }
    }

    // MARK: Today and the ring

    private var head: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(WalkCopy.todayEyebrow.uppercased())
                    .font(.custom("DMSans-SemiBold", size: 12))
                    .tracking(0.96)
                    .foregroundStyle(EndingPaper.eyebrow)
                Text(WalkCopy.endingDate(model.periods))
                    .font(.custom("CrimsonPro-Regular", size: 28))
                    .foregroundStyle(EndingPaper.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            Spacer(minLength: 0)
            let ring = model.ring
            if ring.total > 0 { WalkRing(done: ring.done, total: ring.total) }
        }
    }

    // MARK: Next on the calendar

    private func nextCard(_ next: (title: String, start: Date)) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(WalkCopy.nextEvent(WalkCopy.nextEventTime(next.start)).uppercased())
                .font(.custom("DMSans-SemiBold", size: 12))
                .tracking(0.6)
                .foregroundStyle(EndingPaper.rust)
            Text(next.title)
                .font(.custom("DMSans-SemiBold", size: 17))
                .foregroundStyle(EndingPaper.ink)
                .lineLimit(2)
        }
        .padding(.vertical, 12)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(EndingPaper.nextFill))
        .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(EndingPaper.nextLine, lineWidth: 1))
        .accessibilityElement(children: .combine)
    }

    // MARK: The rows

    private var rows: some View {
        VStack(spacing: 0) {
            ForEach(Array(model.endingRows.enumerated()), id: \.element.id) { index, row in
                WalkEndingRow(row: row) { model.send(.rowToggled(row.id)) }
                    .overlay(alignment: .top) {
                        if index > 0 { Rectangle().fill(EndingPaper.line).frame(height: 1) }
                    }
            }
        }
        .background(RoundedRectangle(cornerRadius: 16).fill(.white))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(EndingPaper.line, lineWidth: 1))
    }

    // MARK: Walk another one down

    private func walkAnother(_ name: String) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(WalkCopy.walkAnother)
                    .font(.custom("DMSans-SemiBold", size: 15))
                    .foregroundStyle(EndingPaper.ink)
                Text(EndingPaper.named(WalkCopy.nextFlag(name), name, base: EndingPaper.muted, nameColour: EndingPaper.deepGreen))
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.down")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(EndingPaper.deepGreen)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14).fill(EndingPaper.walkFill))
        .overlay(RoundedRectangle(cornerRadius: 14)
            .strokeBorder(EndingPaper.walkLine, style: StrokeStyle(lineWidth: 1.5, dash: [5, 4])))
        .contentShape(RoundedRectangle(cornerRadius: 14))
        .onTapGesture { model.send(.walkAnother) }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }

    // MARK: Go to Today

    /// A filled capsule (S37): 50 high, the sheet's width less 36, green, white words and an arrow,
    /// inside the 56-point tap height.
    private var goToToday: some View {
        Button { model.send(.goToToday) } label: {
            HStack(spacing: 8) {
                Text(WalkCopy.goToToday)
                    .font(.custom("DMSans-SemiBold", size: 17))
                    .lineLimit(1)
                Image(systemName: "arrow.right")
                    .font(.system(size: 16, weight: .semibold))
                    .accessibilityHidden(true)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(Capsule().fill(EndingPaper.green))
            .frame(minHeight: Self.tapHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(WalkCopy.goToToday)
        .accessibilityIdentifier("walk.goToToday")
    }
}

/// One of today's tasks: its check circle, its title and what it is for. The whole row is the tap.
struct WalkEndingRow: View {
    let row: WalkEnding.Row
    let toggle: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                if row.done {
                    Circle().fill(EndingPaper.green)
                    Image(systemName: "checkmark")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                } else {
                    Circle().strokeBorder(EndingPaper.open, lineWidth: 2)
                }
            }
            .frame(width: 26, height: 26)
            VStack(alignment: .leading, spacing: 2) {
                Text(row.title)
                    .font(.custom("DMSans-SemiBold", size: 16))
                    .foregroundStyle(row.done ? EndingPaper.doneInk : EndingPaper.ink)
                    .strikethrough(row.done, color: EndingPaper.doneLine)
                    .lineLimit(2)
                if let goal = row.forGoal {
                    Text(EndingPaper.named(WalkCopy.forGoal(goal), goal, base: EndingPaper.forInk, nameColour: EndingPaper.green))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, minHeight: 60, alignment: .leading)
        .contentShape(Rectangle())
        .onTapGesture(perform: toggle)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(WalkCopy.rowLabel(row.title, forGoal: row.forGoal))
        .accessibilityValue(row.done ? WalkCopy.rowDone : WalkCopy.rowOpen)
        .accessibilityAddTraits(.isButton)
    }
}

/// The ring: 64 points (a 72 viewBox, radius 29, stroke 8), filling from 12 o'clock as rows are done.
struct WalkRing: View {
    let done: Int
    let total: Int

    var body: some View {
        let unit: CGFloat = 64 / 72
        let progress = total > 0 ? CGFloat(done) / CGFloat(total) : 0
        ZStack {
            Circle()
                .stroke(EndingPaper.track, lineWidth: 8 * unit)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(EndingPaper.green, style: StrokeStyle(lineWidth: 8 * unit, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.5), value: progress)
            Text(WalkCopy.ring(done: done, total: total))
                .font(.custom("DMSans-SemiBold", size: 15))
                .monospacedDigit()
                .foregroundStyle(EndingPaper.ink)
        }
        .frame(width: 58 * unit, height: 58 * unit)
        .frame(width: 64, height: 64)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(WalkCopy.ringLabel(done: done, total: total))
    }
}

/// The sheet's paper colours (contract §13).
private enum EndingPaper {
    static let sheet = Color(hex: 0xFBF8F2)
    static let grabber = Color(hex: 0xD4CDC0)
    static let muted = Color(hex: 0x3F4B49)
    static let eyebrow = Color(hex: 0x56625F)
    static let ink = Color(hex: 0x1F2A2B)
    static let doneInk = Color(hex: 0x6B7472)
    static let doneLine = Color(hex: 0xA9B0AD)
    static let forInk = Color(hex: 0x4A5654)
    static let open = Color(hex: 0x857D72)
    static let line = Color(hex: 0xE6E0D6)
    static let green = Color(hex: 0x32664D)
    static let deepGreen = Color(hex: 0x244B38)
    static let track = Color(hex: 0xE2DCCF)
    static let rust = Color(hex: 0x9A3D1F)
    static let nextFill = Color(hex: 0xFBEBE3)
    static let nextLine = Color(hex: 0xF0CDBD)
    static let walkFill = Color(hex: 0xF3F8F4)
    static let walkLine = Color(hex: 0x9CBCA8)

    /// A line from `WalkCopy` with the name in it set in Crimson Pro 15 and the line's own colour around it.
    static func named(_ line: String, _ name: String, base: Color, nameColour: Color) -> AttributedString {
        var text = AttributedString(line)
        text.font = .custom("DMSans-Regular", size: 13)
        text.foregroundColor = base
        if let range = text.range(of: name, options: .backwards) {
            text[range].font = .custom("CrimsonPro-Regular", size: 15)
            text[range].foregroundColor = nameColour
        }
        return text
    }
}
#endif
