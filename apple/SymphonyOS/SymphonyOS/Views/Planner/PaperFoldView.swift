import SwiftUI
import SwiftData
#if os(iOS)
import UIKit
#endif

// Paper-style horizons (Scott, 2026-11-04). Year, Season and Month are
// separate sheets, each in its own words. While writing one you read the sheet
// above it, which lies folded behind this one: tap or drag its edge and it
// swings out on a hinge to lie beside the page, for reading. This period's
// calendar folds out the same way from the other edge. Nothing on either
// companion moves, copies or ties an item to this sheet.
//
// The approved prototype is the reference for look, motion and sound
// (docs/superpowers/specs/2026-11-04-paper-fold-prototype.html); the web's
// PaperFold is the sibling. On a phone the sheet above hangs from the top edge
// and the calendar from the bottom. At 600pt and wider (the iPhone Duo's inside
// screen) the two lie as a spread: the sheet above on the left page (38%, or
// on the hinge when the phone is half-open like a book), or this sheet on the
// left and its calendar on the right. One companion at a time.

/// The fold's numbers, as pure functions (PaperFoldTests).
enum FoldGeometry {
    enum Mode: Equatable { case vertical, spread }

    /// Width decides, not the device (as Today's two columns).
    static let spreadMinWidth: CGFloat = 600
    /// The folded edge: a strip on phones, a spine on a spread.
    static let verticalEdge: CGFloat = 36
    static let spreadEdge: CGFloat = 22
    /// The Duo spread gives the sheet above 38%.
    static let spreadShare: CGFloat = 0.38
    /// A reported fold splits the pages only when both sides are wider than this.
    static let minPage: CGFloat = 240

    static func mode(width: CGFloat) -> Mode { width >= spreadMinWidth ? .spread : .vertical }

    /// The two pages of a spread: the sheet above and this sheet. On the hinge
    /// when the phone reports a vertical fold with room on both sides
    /// (`fold` in this view's coordinates, as `TodayView.leftColumnWidth`),
    /// otherwise 38% and the rest.
    static func split(width: CGFloat, fold: CGRect?) -> (above: CGFloat, current: CGFloat) {
        if let x = hinge(width: width, fold: fold) { return (x, width - x) }
        let above = (width * spreadShare).rounded()
        return (above, width - above)
    }

    /// An open companion's page. The calendar takes the right page: on a
    /// hinge, the page right of it; otherwise the same 38%, with this sheet
    /// turned over to the left page.
    static func companionWidth(_ side: FoldSide, width: CGFloat, fold: CGRect?) -> CGFloat {
        let s = split(width: width, fold: fold)
        if side == .calendar, hinge(width: width, fold: fold) != nil { return s.current }
        return s.above
    }

    private static func hinge(width: CGFloat, fold: CGRect?) -> CGFloat? {
        guard let fold, fold.height > fold.width else { return nil }
        let x = fold.midX
        return x > minPage && x < width - minPage ? x : nil
    }

    /// Only a real Duo opening unfolds the sheet above (with its sound): the
    /// window widens into a spread and the system reports a fold. Rotating an
    /// iPhone or widening an iPad window changes the layout and nothing else.
    static func unfoldsOnWidening(from old: Mode, to new: Mode, foldReported: Bool) -> Bool {
        old == .vertical && new == .spread && foldReported
    }

    /// A Duo spread nobody has folded yet starts with the sheet above open
    /// (two pages); anywhere else it starts as the reader left it.
    static func opensAboveFirst(mode: Mode, neverSet: Bool, foldReported: Bool) -> Bool {
        mode == .spread && neverSet && foldReported
    }

    /// On a phone the sheet above hangs up to 62% of the screen high.
    static func maxAboveHeight(viewport: CGFloat) -> CGFloat { (viewport * 0.62).rounded() }

    /// A drag lets go open when position plus velocity (per second) times 0.12 passes halfway.
    static func releaseOpens(p: CGFloat, velocity: CGFloat) -> Bool { p + velocity * 0.12 > 0.5 }

    /// The spring: `.spring(response: 0.48, dampingFraction: 0.78)`, which is
    /// k ≈ 170 with c = 2·√k·0.78 (the web's numbers).
    static let response: Double = 0.48
    static let dampingFraction: Double = 0.78
    static var stiffness: Double { pow(2 * .pi / response, 2) }
    static var damping: Double { 2 * stiffness.squareRoot() * dampingFraction }

    /// When the landing sound plays: the moment the spring first comes within
    /// 0.03 of where it is going (the web steps the same spring each frame).
    static func landingDelay(from: CGFloat, to target: CGFloat, velocity: CGFloat) -> TimeInterval {
        var p = Double(from), v = Double(velocity), t = 0.0
        let dt = 1.0 / 240, goal = Double(target)
        while abs(goal - p) >= 0.03 && t < 2 {
            v += (stiffness * (goal - p) - damping * v) * dt
            p += v * dt
            t += dt
        }
        return t
    }
}

enum FoldSide: Hashable { case above, calendar }

/// Has this companion been opened yet? The calendar sheet reads its period
/// only then, never while it has only lain folded.
private struct PaperFoldOpenedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var paperFoldOpened: Bool {
        get { self[PaperFoldOpenedKey.self] }
        set { self[PaperFoldOpenedKey.self] = newValue }
    }
}

/// The paper, from the prototype's tokens (light; the app has no dark mode).
enum Paper {
    static let sheet = Color(hex: 0xFEFEFD)
    static let above = Color(hex: 0xF9F7F4)
    static let calendar = Color(hex: 0xF6F8FA)
    static let back = Color(hex: 0xE7E4DF)
    static let rule = Color(hex: 0xDEE2E8)
    static let ruleAbove = Color(hex: 0xE2DDD5)
    static let accent = Color(hex: 0x364963)
    static let faint = Color(hex: 0x848D9A)
    static let shadow = Color(hex: 0x18222F)

    static let kicker = Font.custom("DMSans-SemiBold", size: 10.5, relativeTo: .caption2)
    static let line = Font.custom("CrimsonPro-Regular", size: 18.5, relativeTo: .body)
    static let lineAbove = Font.custom("CrimsonPro-Regular", size: 16, relativeTo: .body)
    static let titleAbove = Font.custom("CrimsonPro-Regular", size: 26, relativeTo: .title2)
    static let empty = Font.custom("CrimsonPro-Italic", size: 17, relativeTo: .body)
}

// MARK: - The fold

struct PaperFoldView<Header: View, Sheet: View, Above: View, Calendar: View>: View {
    /// "month", "season", "year", "week": remembered per horizon.
    let horizon: String
    /// The sheet above's name on its edge ("Fall 2026").
    let aboveLabel: String
    /// Its open lines.
    let aboveCount: Int?
    /// "November calendar"; nil when the page has no calendar fold (Week).
    let calendarLabel: String?
    @ViewBuilder let header: () -> Header
    @ViewBuilder let above: () -> Above
    @ViewBuilder let calendar: () -> Calendar
    @ViewBuilder let sheet: () -> Sheet

    @Environment(AppState.self) private var appState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @AppStorage private var aboveStored: Bool
    @AppStorage private var calendarStored: Bool

    @State private var pAbove: CGFloat = 0
    @State private var pCal: CGFloat = 0
    @State private var size: CGSize = .zero
    @State private var originX: CGFloat = 0
    @State private var settledMode: FoldGeometry.Mode?
    @State private var aboveContent: CGFloat = 0
    @State private var calContent: CGFloat = 0
    @State private var drag: DragInfo?
    @State private var landing: [FoldSide: Int] = [:]
    /// Each companion's been opened at least once (its content may then load).
    @State private var opened: Set<FoldSide> = []
    /// The window just widened into a spread; unfold if it's a Duo opening.
    @State private var pendingUnfold = false

    private struct DragInfo {
        let side: FoldSide
        let p0: CGFloat
        var last: CGFloat
        var travelled: CGFloat = 0
        var moved: CGFloat = 0
        var foldedOther = false
    }

    init(horizon: String, aboveLabel: String, aboveCount: Int? = nil, calendarLabel: String?,
         @ViewBuilder header: @escaping () -> Header,
         @ViewBuilder above: @escaping () -> Above,
         @ViewBuilder calendar: @escaping () -> Calendar,
         @ViewBuilder sheet: @escaping () -> Sheet) {
        self.horizon = horizon
        self.aboveLabel = aboveLabel
        self.aboveCount = aboveCount
        self.calendarLabel = calendarLabel
        self.header = header
        self.above = above
        self.calendar = calendar
        self.sheet = sheet
        _aboveStored = AppStorage(wrappedValue: false, Self.key(horizon))
        _calendarStored = AppStorage(wrappedValue: false, Self.key(horizon) + ".calendar")
    }

    static func key(_ horizon: String) -> String { "planner.unfolded.\(horizon)" }

    private var hasCalendar: Bool { calendarLabel != nil }
    private var mode: FoldGeometry.Mode { FoldGeometry.mode(width: size.width) }

    /// The reported fold, in this view's coordinates.
    private var fold: CGRect? {
        #if os(iOS)
        return appState.dockLayout.fold?.offsetBy(dx: -originX, dy: 0)
        #else
        return nil
        #endif
    }

    private func page(_ side: FoldSide) -> CGFloat {
        switch mode {
        case .spread:
            return FoldGeometry.companionWidth(side, width: size.width, fold: fold)
        case .vertical:
            let content = side == .above ? aboveContent : calContent
            let cap = FoldGeometry.maxAboveHeight(viewport: max(size.height, 400))
            return max(edge + 60, min(content + 2, cap))
        }
    }

    private var edge: CGFloat { mode == .spread ? FoldGeometry.spreadEdge : FoldGeometry.verticalEdge }

    var body: some View {
        Group {
            switch mode {
            case .vertical: phone
            case .spread: spread
            }
        }
        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { r in
            size = r.size
            originX = r.minX
            if settledMode == nil, r.width > 0 { restore(FoldGeometry.mode(width: r.width)) }
        }
        .onChange(of: mode) { _, new in modeChanged(to: new) }
        .onChange(of: fold != nil) { _, reported in foldReportChanged(reported) }
    }

    // MARK: Layouts

    /// Phones: the sheet above hangs from this sheet's top edge, the calendar
    /// from its bottom edge, each scrolling inside itself.
    private var phone: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                header()
                slot(.above)
                    .padding(.horizontal, 12)
                    .padding(.top, 12)
                    .zIndex(1)
                sheet()
                    .padding(.vertical, 10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Paper.sheet, in: RoundedRectangle(cornerRadius: 4))
                    .overlay { CreaseShade(top: pAbove, bottom: pCal, vertical: true).allowsHitTesting(false) }
                    .shadow(color: Paper.shadow.opacity(0.12), radius: 12, y: 6)
                    .padding(.horizontal, 6)
                    .zIndex(2)
                if hasCalendar {
                    slot(.calendar)
                        .padding(.horizontal, 12)
                        .zIndex(1)
                }
            }
            .padding(.bottom, 16)
        }
    }

    /// 600pt and wider: two pages. Each companion is viewport-tall and scrolls
    /// on its own; this sheet scrolls in its own column.
    private var spread: some View {
        VStack(alignment: .leading, spacing: 0) {
            header()
            HStack(spacing: 0) {
                slot(.above).zIndex(1)
                ScrollView {
                    sheet()
                        .padding(.vertical, 10)
                        .padding(.bottom, 16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Paper.sheet)
                .overlay { CreaseShade(top: pAbove, bottom: pCal, vertical: false).allowsHitTesting(false) }
                .shadow(color: Paper.shadow.opacity(0.12), radius: 12, y: 6)
                .zIndex(2)
                if hasCalendar { slot(.calendar).zIndex(1) }
            }
            .padding(.top, 10)
        }
    }

    @ViewBuilder
    private func slot(_ side: FoldSide) -> some View {
        let isAbove = side == .above
        FoldSlot(side: side, mode: mode, progress: isAbove ? pAbove : pCal, page: page(side), edge: edge,
                 opened: opened.contains(side),
                 label: isAbove ? aboveLabel : (calendarLabel ?? ""), count: isAbove ? aboveCount : nil,
                 reduceMotion: reduceMotion,
                 onToggle: { toggle(side) },
                 onDrag: { value, ended in dragged(side, value, ended: ended) },
                 onContentHeight: { h in
                     if isAbove { if abs(aboveContent - h) > 1 { aboveContent = h } }
                     else if abs(calContent - h) > 1 { calContent = h }
                 }) {
            if isAbove { above() } else { calendar() }
        }
    }

    // MARK: Motion

    private func progress(_ side: FoldSide) -> CGFloat { side == .above ? pAbove : pCal }

    private func setProgress(_ side: FoldSide, _ p: CGFloat) {
        if side == .above { pAbove = p } else { pCal = p }
        if p > 0 { opened.insert(side) }
    }

    private func other(_ side: FoldSide) -> FoldSide? {
        guard hasCalendar else { return nil }
        return side == .above ? .calendar : .above
    }

    private func toggle(_ side: FoldSide) {
        go(side, to: progress(side) > 0.5 ? 0 : 1)
    }

    /// Open or fold one companion with the spring and the paper sounds. One at
    /// a time: opening one folds the other. `remember` keeps the reader's
    /// choice for this horizon; the phone opening or closing doesn't.
    private func go(_ side: FoldSide, to target: CGFloat, quiet: Bool = false, velocity: CGFloat = 0, remember: Bool = true) {
        if target == 1, let o = other(side), progress(o) > 0 {
            go(o, to: 0, quiet: true, remember: remember)
        }
        if remember {
            if side == .above { aboveStored = target == 1 } else { calendarStored = target == 1 }
        }
        let from = progress(side)
        let token = (landing[side] ?? 0) + 1
        landing[side] = token
        let sound = PaperSound.shared

        if reduceMotion {
            // No spring and no swish: a short crossfade, then the landing.
            withAnimation(.easeInOut(duration: 0.16)) { setProgress(side, target) }
            if !quiet { sound.land(level: 0.6) }
            return
        }
        if !quiet {
            sound.swish(duration: 0.34)
            sound.crinkle(count: 7, over: 0.3)
        }
        let distance = target - from
        let animation: Animation = velocity != 0 && abs(distance) > 0.001
            ? .interpolatingSpring(mass: 1, stiffness: FoldGeometry.stiffness, damping: FoldGeometry.damping,
                                   initialVelocity: Double(velocity / distance))
            : .spring(response: FoldGeometry.response, dampingFraction: FoldGeometry.dampingFraction)
        withAnimation(animation) { setProgress(side, target) }

        let delay = FoldGeometry.landingDelay(from: from, to: target, velocity: velocity)
        Task { @MainActor in
            try? await Task.sleep(for: .seconds(delay))
            guard landing[side] == token else { return }
            sound.land(level: target == 1 ? 1 : 0.8)
            #if os(iOS)
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            #endif
        }
    }

    /// Dragging follows the finger; letting go snaps by position plus
    /// velocity. A press that moves less than 4pt is a tap.
    private func dragged(_ side: FoldSide, _ value: DragGesture.Value, ended: Bool) {
        let span = max(1, page(side) - edge)
        let t = value.translation, v = value.velocity
        let (delta, speed, moved): (CGFloat, CGFloat, CGFloat) = switch (mode, side) {
        case (.spread, .above): (-t.width, -v.width, abs(t.width))
        case (.spread, .calendar): (t.width, v.width, abs(t.width))
        case (.vertical, .above): (t.height, v.height, abs(t.height))
        case (.vertical, .calendar): (-t.height, -v.height, abs(t.height))
        }

        if ended {
            let info = drag
            drag = nil
            if max(info?.moved ?? 0, moved) < 4 { toggle(side); return }
            let velocity = speed / span
            let opens = FoldGeometry.releaseOpens(p: progress(side), velocity: velocity)
            go(side, to: opens ? 1 : 0, quiet: true, velocity: velocity)
            return
        }

        if drag?.side != side {
            drag = DragInfo(side: side, p0: progress(side), last: progress(side))
            landing[side] = (landing[side] ?? 0) + 1   // a landing in flight no longer applies
        }
        guard var d = drag else { return }
        d.moved = max(d.moved, moved)
        let np = min(1.05, max(-0.05, d.p0 + delta / span))
        if np > 0.05, !d.foldedOther, let o = other(side), progress(o) > 0 {
            d.foldedOther = true
            go(o, to: 0, quiet: true)
        }
        d.travelled += abs(np - d.last)
        d.last = np
        if d.travelled > 0.05 {
            PaperSound.shared.crinkle(count: 1 + Int.random(in: 0...2), over: 0.04, level: 0.8)
            d.travelled = 0
        }
        drag = d
        var tx = Transaction()
        tx.disablesAnimations = true
        withTransaction(tx) { setProgress(side, np) }
    }

    // MARK: Remembered state and the Duo

    /// First layout: open or folded as the reader left this horizon. A spread
    /// nobody has folded yet opens with the sheet above (two pages).
    private func restore(_ m: FoldGeometry.Mode) {
        settledMode = m
        let neverSet = UserDefaults.standard.object(forKey: Self.key(horizon)) == nil
        let openAbove = aboveStored || FoldGeometry.opensAboveFirst(mode: m, neverSet: neverSet, foldReported: fold != nil)
        setProgress(.above, openAbove ? 1 : 0)
        setProgress(.calendar, hasCalendar && calendarStored && !openAbove ? 1 : 0)
    }

    /// Opening the Duo unfolds the sheet above with its sound; closing it
    /// (or any narrowing out of a spread) folds both away at once, silently,
    /// so nothing is left half-turned. Widening anything that isn't a Duo
    /// (an iPhone turned sideways, an iPad window) only changes the layout.
    private func modeChanged(to new: FoldGeometry.Mode) {
        guard let old = settledMode, old != new else { return }
        settledMode = new
        drag = nil
        landing[.above] = (landing[.above] ?? 0) + 1
        landing[.calendar] = (landing[.calendar] ?? 0) + 1
        if new == .spread {
            if FoldGeometry.unfoldsOnWidening(from: old, to: new, foldReported: fold != nil) {
                unfoldForDuo()
            } else {
                // The system may report the fold a moment after the window
                // widens; a Duo opening is still one then.
                pendingUnfold = true
                Task { @MainActor in
                    try? await Task.sleep(for: .seconds(1.5))
                    pendingUnfold = false
                }
            }
        } else {
            pendingUnfold = false
            var tx = Transaction()
            tx.disablesAnimations = true
            withTransaction(tx) { pAbove = 0; pCal = 0 }
        }
    }

    private func foldReportChanged(_ reported: Bool) {
        guard pendingUnfold, reported, mode == .spread,
              FoldGeometry.unfoldsOnWidening(from: .vertical, to: .spread, foldReported: reported) else { return }
        pendingUnfold = false
        unfoldForDuo()
    }

    private func unfoldForDuo() {
        guard pCal < 0.5 else { return }
        var tx = Transaction()
        tx.disablesAnimations = true
        withTransaction(tx) { pAbove = 0 }
        go(.above, to: 1, remember: false)
    }
}

extension PaperFoldView where Calendar == EmptyView {
    /// A page with the sheet above only (Week).
    init(horizon: String, aboveLabel: String, aboveCount: Int? = nil,
         @ViewBuilder header: @escaping () -> Header,
         @ViewBuilder above: @escaping () -> Above,
         @ViewBuilder sheet: @escaping () -> Sheet) {
        self.init(horizon: horizon, aboveLabel: aboveLabel, aboveCount: aboveCount, calendarLabel: nil,
                  header: header, above: above, calendar: { EmptyView() }, sheet: sheet)
    }
}

// MARK: - One companion on its hinge

/// The folded edge and the sheet on its hinge, drawn for one position of the
/// fold (`progress`, 0 folded, 1 open; animatable, so every frame of the
/// spring passes through here).
private struct FoldSlot<Front: View>: View, Animatable {
    let side: FoldSide
    let mode: FoldGeometry.Mode
    var progress: CGFloat
    /// The open sheet's width (spread) or height (phone).
    let page: CGFloat
    let edge: CGFloat
    /// Opened at least once: its content may read what it needs.
    let opened: Bool
    let label: String
    let count: Int?
    let reduceMotion: Bool
    let onToggle: () -> Void
    let onDrag: (DragGesture.Value, Bool) -> Void
    let onContentHeight: (CGFloat) -> Void
    @ViewBuilder let front: () -> Front

    nonisolated var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    private var isAbove: Bool { side == .above }
    private var spread: Bool { mode == .spread }

    /// The edge this sheet is hinged to, on the companion's side.
    private var hinge: Alignment {
        switch (mode, side) {
        case (.spread, .above): .trailing
        case (.spread, .calendar): .leading
        case (.vertical, .above): .bottom
        case (.vertical, .calendar): .top
        }
    }

    private var hingeAnchor: UnitPoint {
        switch (mode, side) {
        case (.spread, .above): .trailing
        case (.spread, .calendar): .leading
        case (.vertical, .above): .bottom
        case (.vertical, .calendar): .top
        }
    }

    private var paper: Color { isAbove ? Paper.above : Paper.calendar }

    var body: some View {
        let q = min(1.04, max(-0.04, progress))
        let open = max(0, q)
        let extent = edge + open * (page - edge)
        ZStack(alignment: hinge) {
            flap(q)
            spine
                .opacity(Double(min(1, max(0, 1 - q * 3.2))))
                .shown(q < 0.5)
        }
        .frame(width: spread ? extent : nil, height: spread ? nil : extent, alignment: hinge)
        .frame(maxWidth: spread ? nil : .infinity, maxHeight: spread ? .infinity : nil)
    }

    // MARK: The folded edge

    private var spine: some View {
        Group {
            if spread {
                VStack(spacing: 10) {
                    chevron
                    Text(label.uppercased())
                        .font(Paper.kicker)
                        .kerning(2)
                        .lineLimit(1)
                        .fixedSize()
                        .rotationEffect(.degrees(isAbove ? -90 : 90))
                        .frame(width: 14, height: 160)
                }
                .frame(maxHeight: .infinity)
            } else {
                HStack(spacing: 8) {
                    Text(label.uppercased())
                        .font(Paper.kicker)
                        .kerning(2)
                        .lineLimit(1)
                    if let count {
                        Text("\(count)").font(.captionText).monospacedDigit().foregroundStyle(Paper.faint)
                    }
                    chevron
                }
                .frame(maxWidth: .infinity)
            }
        }
        .foregroundStyle(Color.textSecondary)
        .frame(width: spread ? edge : nil, height: spread ? nil : edge)
        .frame(maxWidth: spread ? nil : .infinity)
        .background(spineShape.fill(paper))
        .background(spineShape.fill(paper).overlay(spineShape.stroke(Paper.ruleAbove, lineWidth: 1)).offset(behind))
        .overlay(spineShape.stroke(isAbove ? Paper.ruleAbove : Paper.rule, lineWidth: 1))
        .shadow(color: Paper.shadow.opacity(0.12), radius: 6, y: 4)
        .padding(spread ? Edge.Set.vertical : Edge.Set.horizontal, spread ? 10 : 8)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .global)
            .onChanged { onDrag($0, false) }
            .onEnded { onDrag($0, true) })
        .accessibilityElement(children: .ignore)
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel(isAbove ? "\(label), the sheet above" : label)
        .accessibilityValue("Folded")
        .accessibilityHint(isAbove ? "Unfolds it beside the page, for reading" : "Unfolds the calendar, for reading")
        .accessibilityIdentifier(isAbove ? "fold-edge-above" : "fold-edge-calendar")
        .accessibilityAction { onToggle() }
    }

    /// A second layer of paper peeks out behind the edge.
    private var behind: CGSize {
        switch (mode, side) {
        case (.spread, .above): CGSize(width: -3, height: 0)
        case (.spread, .calendar): CGSize(width: 3, height: 0)
        case (.vertical, .above): CGSize(width: 0, height: -3)
        case (.vertical, .calendar): CGSize(width: 0, height: 3)
        }
    }

    private var spineShape: UnevenRoundedRectangle {
        let r: CGFloat = 9
        return switch (mode, side) {
        case (.spread, .above): UnevenRoundedRectangle(topLeadingRadius: r, bottomLeadingRadius: r)
        case (.spread, .calendar): UnevenRoundedRectangle(bottomTrailingRadius: r, topTrailingRadius: r)
        case (.vertical, .above): UnevenRoundedRectangle(topLeadingRadius: r, topTrailingRadius: r)
        case (.vertical, .calendar): UnevenRoundedRectangle(bottomLeadingRadius: r, bottomTrailingRadius: r)
        }
    }

    private var chevron: some View {
        let name = switch (mode, side) {
        case (.spread, .above): "chevron.left"
        case (.spread, .calendar): "chevron.right"
        case (.vertical, .above): "chevron.down"
        case (.vertical, .calendar): "chevron.up"
        }
        return Image(systemName: name).font(.system(size: 11, weight: .semibold)).opacity(0.7)
    }

    // MARK: The sheet on its hinge

    private func flap(_ q: CGFloat) -> some View {
        // Folded it lies turned over behind this sheet (180°); open it lies
        // flat beside it. Past 90° the back of the paper shows.
        let angle = reduceMotion ? 0 : Double(1 - q) * 180
        let showFront = reduceMotion || q >= 0.5
        let axis: (x: CGFloat, y: CGFloat, z: CGFloat) = spread ? (0, 1, 0) : (1, 0, 0)
        // Swings behind the page, as in the prototype (rotateY(-a) on the left).
        let signed: Double = switch (mode, side) {
        case (.spread, .above): -angle
        case (.spread, .calendar): angle
        case (.vertical, .above): angle
        case (.vertical, .calendar): -angle
        }
        return ZStack {
            // Folded (or past halfway), the sheet is out of reach: not drawn,
            // not read by VoiceOver, never tapped. It keeps its size so the
            // phone's fold knows how tall the sheet will hang.
            face
                .shown(showFront && (reduceMotion ? q > 0.01 : q > 0.5))
            faceShape.fill(Paper.back)
                .opacity(showFront ? 0 : 1)
            // Light across the turning sheet, darkest at the hinge.
            faceShape.fill(LinearGradient(stops: [
                .init(color: Paper.shadow.opacity(0.55), location: 0),
                .init(color: Paper.shadow.opacity(0.12), location: 0.45),
                .init(color: Paper.shadow.opacity(0), location: 1),
            ], startPoint: hingeAnchor, endPoint: farAnchor))
            .opacity(showFront ? Double(1 - max(0, q)) * 0.9 + 0.06 : 0.5)
            .opacity(reduceMotion ? 0 : 1)
            .allowsHitTesting(false)
        }
        .frame(width: spread ? page : nil, height: spread ? nil : page)
        .frame(maxHeight: spread ? .infinity : nil)
        .compositingGroup()
        .rotation3DEffect(.degrees(signed), axis: axis, anchor: hingeAnchor, perspective: 0.45)
        .opacity(reduceMotion ? Double(max(0, min(1, q))) : (q < 0.002 ? 0 : 1))
        .allowsHitTesting(q > 0.5)
    }

    private var farAnchor: UnitPoint {
        switch hingeAnchor {
        case .trailing: .leading
        case .leading: .trailing
        case .bottom: .top
        default: .bottom
        }
    }

    private var faceShape: UnevenRoundedRectangle {
        let big: CGFloat = 10, small: CGFloat = 3
        return switch (mode, side) {
        case (.spread, .above): UnevenRoundedRectangle(topLeadingRadius: big, bottomLeadingRadius: big,
                                                       bottomTrailingRadius: small, topTrailingRadius: small)
        case (.spread, .calendar): UnevenRoundedRectangle(topLeadingRadius: small, bottomLeadingRadius: small,
                                                          bottomTrailingRadius: big, topTrailingRadius: big)
        case (.vertical, .above): UnevenRoundedRectangle(topLeadingRadius: big, bottomLeadingRadius: small,
                                                         bottomTrailingRadius: small, topTrailingRadius: big)
        case (.vertical, .calendar): UnevenRoundedRectangle(topLeadingRadius: small, bottomLeadingRadius: big,
                                                            bottomTrailingRadius: big, topTrailingRadius: small)
        }
    }

    /// The open sheet: its own scroll, and a grip on the hinge to fold it away.
    private var face: some View {
        ScrollView {
            front()
                .environment(\.paperFoldOpened, opened)
                .padding(.horizontal, spread ? 20 : 18)
                .padding(.top, spread ? 22 : 18)
                .padding(.bottom, spread ? 22 : 26)
                .frame(maxWidth: .infinity, alignment: .leading)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { onContentHeight($0) }
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(faceShape.fill(paper))
        .clipShape(faceShape)
        .shadow(color: Paper.shadow.opacity(0.14), radius: 10, y: 6)
        .overlay(alignment: hinge) { grip }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(isAbove ? "\(label), for reading" : label)
    }

    private var grip: some View {
        Capsule()
            .fill(Paper.faint.opacity(0.45))
            .frame(width: spread ? 4 : 44, height: spread ? 44 : 4)
            .frame(width: spread ? 24 : nil, height: spread ? nil : 24)
            .frame(maxWidth: spread ? nil : .infinity, maxHeight: spread ? .infinity : nil)
            .contentShape(Rectangle())
            .gesture(DragGesture(minimumDistance: 0, coordinateSpace: .global)
                .onChanged { onDrag($0, false) }
                .onEnded { onDrag($0, true) })
            .accessibilityElement(children: .ignore)
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel(isAbove ? "Fold the sheet above away" : "Fold the calendar away")
            .accessibilityIdentifier(isAbove ? "fold-grip-above" : "fold-grip-calendar")
            .accessibilityAction { onToggle() }
    }
}

/// The soft crease shadow on this sheet's edge where an open companion lies.
private struct CreaseShade: View, Animatable {
    var top: CGFloat
    var bottom: CGFloat
    let vertical: Bool

    nonisolated var animatableData: AnimatablePair<CGFloat, CGFloat> {
        get { AnimatablePair(top, bottom) }
        set { top = newValue.first; bottom = newValue.second }
    }

    var body: some View {
        let shade = Paper.shadow.opacity(0.16)
        ZStack(alignment: vertical ? .top : .leading) {
            LinearGradient(colors: [shade, shade.opacity(0)],
                           startPoint: vertical ? .top : .leading, endPoint: vertical ? .bottom : .trailing)
                .frame(width: vertical ? nil : 26, height: vertical ? 22 : nil)
                .opacity(Double(min(1, max(0, top))))
            LinearGradient(colors: [shade, shade.opacity(0)],
                           startPoint: vertical ? .bottom : .trailing, endPoint: vertical ? .top : .leading)
                .frame(width: vertical ? nil : 26, height: vertical ? 22 : nil)
                .opacity(Double(min(1, max(0, bottom))))
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: vertical ? .bottom : .trailing)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: vertical ? .top : .leading)
    }
}

// MARK: - The sheets' contents

/// The sheet above, for reading: kicker, title, its open lines (titles only),
/// how many are done, and the foot. No controls of any kind.
struct SheetAbove: View {
    /// "Season · Sep 1 – Nov 30", "Year", "Last year", "Month · Nov 1 – 30".
    let kicker: String
    /// "Fall 2026", "2026", "2025", "November".
    let title: String
    let rows: [(id: UUID, title: String)]
    let doneCount: Int
    /// "For reading. Write November in its own words."
    let foot: String
    /// Said instead of the list when nothing is open.
    var empty: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SheetKicker(text: kicker)
            Text(title)
                .font(Paper.titleAbove)
                .foregroundStyle(Color.textPrimary)
                .padding(.top, 6)
                .padding(.bottom, 8)
                .accessibilityAddTraits(.isHeader)
            if rows.isEmpty {
                if let empty {
                    Text(empty).font(Paper.empty).foregroundStyle(Paper.faint).padding(.vertical, 6)
                }
            } else {
                ForEach(rows, id: \.id) { row in
                    Text(row.title)
                        .font(Paper.lineAbove)
                        .foregroundStyle(Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 7)
                        .overlay(alignment: .bottom) { Rectangle().fill(Paper.ruleAbove).frame(height: 1) }
                }
            }
            if doneCount > 0 {
                Text("\(doneCount) done").font(.bodySmall).foregroundStyle(Paper.faint).padding(.top, 12)
            }
            SheetFoot(text: foot)
        }
    }
}

/// This period's own sheet, named like the sheets folded beside it (Scott,
/// 2026-11-07): "Month · Nov 1 – 30" over "November goals".
struct SheetHeading: View {
    let kicker: String
    let title: String
    @Environment(\.horizontalSizeClass) private var sizeClass

    var body: some View {
        // On a phone the page's own header names the period right above
        // the sheet; saying it twice costs a screenful (2026-11-08).
        if sizeClass != .compact { heading }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 0) {
            SheetKicker(text: kicker)
            Text(title)
                .font(Paper.titleAbove)
                .foregroundStyle(Color.textPrimary)
                .padding(.top, 6)
                .padding(.bottom, 6)
                .accessibilityAddTraits(.isHeader)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 4)
    }
}

struct SheetKicker: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(Paper.kicker)
            .kerning(1.7)
            .foregroundStyle(Paper.faint)
    }
}

/// "For reading. …", with the eye.
struct SheetFoot: View {
    let text: String
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Image(systemName: "eye").font(.system(size: 11)).accessibilityHidden(true)
            Text(text).fixedSize(horizontal: false, vertical: true)
        }
        .font(.captionText)
        .foregroundStyle(Paper.faint)
        .padding(.top, 16)
    }
}

/// This period's calendar, for reading: what is already claimed, one line
/// per day and event ("Nov 3 · Election Day"), from the app's Google
/// Calendar read. Events are added the usual way, never from here.
struct CalendarSheet: View {
    /// "What’s already claimed", "Fixed dates · Sep 1 – Nov 30", "The 12 months".
    let kicker: String
    let title: String
    let start: Date
    /// Exclusive.
    let end: Date

    @State private var calendar = GoogleCalendarService.shared
    @Environment(\.paperFoldOpened) private var opened

    static let foot = "For reading. Add events the usual way."

    /// What the read is keyed on: nothing until the sheet has been opened.
    static func readKey(start: Date, end: Date, opened: Bool) -> String? {
        opened ? "\(PlanCalendar.ymd(start))…\(PlanCalendar.ymd(end))" : nil
    }

    var body: some View {
        let events = calendar.entries(from: start, to: end)
        VStack(alignment: .leading, spacing: 0) {
            SheetKicker(text: kicker)
            Text(title)
                .font(Paper.titleAbove)
                .foregroundStyle(Color.textPrimary)
                .padding(.top, 6)
                .padding(.bottom, 8)
                .accessibilityAddTraits(.isHeader)
            if let events {
                let read = PeriodCalendar.read(entries: events)
                if read.lines.isEmpty && read.repeating.isEmpty {
                    Text("Nothing on the calendar yet.").font(Paper.empty).foregroundStyle(Paper.faint).padding(.vertical, 6)
                }
                ForEach(read.lines) { line in
                    Text(line.text)
                        .font(Paper.lineAbove)
                        .foregroundStyle(Color.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 6)
                        .overlay(alignment: .bottom) { Rectangle().fill(Paper.rule).frame(height: 1) }
                }
                if !read.repeating.isEmpty {
                    Text("Repeating: \(read.repeating.joined(separator: ", "))")
                        .font(.bodySmall)
                        .foregroundStyle(Paper.faint)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 10)
                }
            } else if calendar.periodFailed(from: start, to: end) {
                Text("Couldn’t read the calendar.").font(Paper.empty).foregroundStyle(Paper.faint).padding(.vertical, 6)
            } else {
                CalendarLoadingRow().padding(.vertical, 6)
            }
            SheetFoot(text: Self.foot)
        }
        .task(id: Self.readKey(start: start, end: end, opened: opened)) {
            guard Self.readKey(start: start, end: end, opened: opened) != nil else { return }
            await calendar.refreshPeriod(from: start, to: end)
        }
    }
}

/// The next ruled line on this period's sheet: a pencil and "Write a November
/// goal" in the accent colour. Return writes it, in ink, with the pencil's
/// sound, and the line stays ready for the next.
struct WriteLine: View {
    let placeholder: String
    let onWrite: (String) -> Void

    @State private var draft = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "pencil")
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(Paper.accent)
                .accessibilityHidden(true)
            TextField(placeholder, text: $draft, prompt: Text(placeholder).foregroundStyle(Paper.accent.opacity(0.8)))
                .font(Paper.line)
                .foregroundStyle(Color.textPrimary)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit(write)
                .accessibilityLabel(placeholder)
            if focused && !draft.isEmpty {
                Text("Return to add").font(.captionText).foregroundStyle(Paper.faint).accessibilityHidden(true)
            }
        }
        .padding(.vertical, 8)
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) {
            Rectangle().fill(focused ? Paper.accent : Paper.rule).frame(height: 1)
        }
        .contentShape(Rectangle())
        .onTapGesture { focused = true }
    }

    private func write() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        onWrite(text)
        draft = ""
        PaperSound.shared.pencil()
        focused = true
    }
}

/// One line on this period's sheet: its words in ink on a ruled line.
/// Opening it opens the task (Done, Let go and Edit stay there, one tap away).
struct SheetLine: View {
    let task: SymphonyTask
    @State private var showDetail = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(task.title)
                .font(Paper.line)
                .foregroundStyle(Color.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            if task.context != nil { ContextDot(context: task.context) }
        }
        .padding(.vertical, 9)
        .frame(minHeight: 44)
        .overlay(alignment: .bottom) { Rectangle().fill(Paper.rule).frame(height: 1) }
        .contentShape(Rectangle())
        .onTapGesture { showDetail = true }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Opens it")
        .accessibilityAction { showDetail = true }
        .sheet(isPresented: $showDetail) {
            NavigationStack {
                TaskDetailView(task: task)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { showDetail = false } }
                    }
            }
            .presentationDetents([.large, .medium])
        }
    }
}

/// The one mute control for the paper sounds, remembered on this device.
struct PaperSoundToggle: View {
    @AppStorage(PaperSound.storageKey) private var on = true

    var body: some View {
        CircleIconButton(systemImage: on ? "speaker.wave.2" : "speaker.slash", label: "Paper sounds", active: false) {
            on.toggle()
            if on { PaperSound.shared.crinkle(count: 3, over: 0.08, level: 0.7) }
        }
        .accessibilityValue(on ? "On" : "Off")
    }
}

private extension View {
    /// Laid out either way; drawn, tappable and read by VoiceOver only when shown.
    @ViewBuilder func shown(_ on: Bool) -> some View {
        if on { self } else { self.hidden() }
    }
}
