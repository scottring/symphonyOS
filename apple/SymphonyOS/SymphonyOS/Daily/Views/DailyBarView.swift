#if os(iOS)
import SwiftUI
import UIKit

/// The add bar at the foot of a light page: a plain field with the walk's light, small, at
/// its right end as the microphone (tap the field to type, tap the light to speak, tap it
/// again to add what was heard), the one line above it (listening, a note, or Undo), and
/// More and Inbox either side, which open as sheets. While it listens the field spans the
/// width and the icons give way; with the keyboard up the field and the line rise above it.
/// Everything it shows comes from the model's `DailyBar` and every frame from
/// `DailyMetrics.Bar`, in the page's own space; it only draws and sends what is touched.
struct DailyBarView: View {
    let model: DailyModel
    let metrics: DailyMetrics.Bar
    let placeholder: String
    /// The placeholder in fewer words, shown where `placeholder` would be cut short (`DailyCopy.fitting`).
    let shortPlaceholder: String?
    let listening: String
    /// On the mountain pages: a paper field with a plank-ink line, the icons and the line white.
    let night: Bool
    /// More and Inbox beside the field (not where the page has no room for them).
    let icons: Bool
    /// The field's words (the half-open display's taller field reads larger).
    let textSize: CGFloat
    /// The handover: false while the walk's light travels down to stand here, so only one light
    /// is ever seen; the button still takes a touch.
    let lightShown: Bool
    /// A tap on the light, or the field taking the keyboard, before it does what it asks (the
    /// handover's travel ends at once).
    let touched: () -> Void

    init(model: DailyModel, metrics: DailyMetrics.Bar, placeholder: String, shortPlaceholder: String? = nil,
         listening: String, night: Bool = false, icons: Bool = true, textSize: CGFloat = 16, lightShown: Bool = true,
         touched: @escaping () -> Void = {}) {
        self.model = model
        self.metrics = metrics
        self.placeholder = placeholder
        self.shortPlaceholder = shortPlaceholder
        self.listening = listening
        self.night = night
        self.icons = icons
        self.textSize = textSize
        self.lightShown = lightShown
        self.touched = touched
    }

    @Environment(AppState.self) private var appState
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @FocusState private var typing: Bool
    /// The keyboard's top in window coordinates, while it is up.
    @State private var keyboardTop: CGFloat?
    /// The page's top in window coordinates (the bar's frames are in the page's space).
    @State private var pageTop: CGFloat = 0

    var body: some View {
        let bar = model.bar
        let rise = typing ? keyboardTop.map { metrics.rise(keyboardTop: $0 - pageTop) } ?? 0 : 0
        let field = bar.isListening ? metrics.speaking : metrics.field
        ZStack(alignment: .topLeading) {
            if rise > 0 && !night { paper(rise: rise) }
            slot(bar.slot)
                .offset(y: -rise)
            if icons && !bar.isListening {
                icon(DailyCopy.more, symbol: "ellipsis", id: "daily.bar.more", frame: metrics.more) {
                    appState.dailyPanel = .more
                }
                .offset(y: -rise)
                icon(DailyCopy.inbox, symbol: "tray", id: "daily.bar.inbox", frame: metrics.inbox) {
                    appState.dailyPanel = .inbox
                }
                .offset(y: -rise)
            }
            fieldView(bar, frame: field)
                .offset(y: -rise)
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: bar.isListening)
        .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minY } action: { pageTop = $0 }
        .onChange(of: bar.fieldAsked) { _, _ in typing = true }
        .onChange(of: typing) { _, on in if on { touched() } }
        // The handover's line is heard once, as it shows.
        .onChange(of: bar.slot == .handover) { _, on in
            if on { AccessibilityNotification.Announcement(DailyCopy.handover).post() }
        }
        // Listening takes the keyboard down: the field shows what is heard.
        .onChange(of: bar.isListening) { _, on in if on { typing = false } }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification)) { note in
            guard let end = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            withAnimation(.easeOut(duration: 0.25)) { keyboardTop = end.minY }
        }
        .onReceive(NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)) { _ in
            withAnimation(.easeOut(duration: 0.25)) { keyboardTop = nil }
        }
    }

    // MARK: The field and the light

    private func fieldView(_ bar: DailyBar, frame: CGRect) -> some View {
        HStack(spacing: 0) {
            words(bar)
                .padding(.leading, DailyMetrics.wordsInset)
                .frame(maxWidth: .infinity, alignment: .leading)
            light(bar)
        }
        .padding(.trailing, DailyMetrics.lightInset)
        .frame(width: frame.width, height: frame.height)
        .background(Capsule().fill(night ? DailyPalette.paper : Color.white))
        .overlay(Capsule().strokeBorder(bar.isListening ? DailyPalette.rust
                                        : night ? DailyPalette.plankInk : DailyPalette.fieldLine, lineWidth: 1.5))
        .offset(x: frame.minX, y: frame.minY)
    }

    /// While it listens the field shows what is heard, and takes no typing.
    @ViewBuilder private func words(_ bar: DailyBar) -> some View {
        if bar.isListening {
            Text(bar.draft.isEmpty ? shown : bar.draft)
                .font(DailyPalette.sans(textSize))
                .foregroundStyle(bar.draft.isEmpty ? DailyPalette.placeholder : DailyPalette.ink)
                .lineLimit(1)
                .truncationMode(.head)
                .accessibilityLabel(placeholder)
                .accessibilityValue(bar.draft)
                .accessibilityIdentifier("daily.bar.field")
        } else {
            TextField("", text: Binding(get: { model.bar.draft }, set: { model.send(.typed($0)) }),
                      prompt: Text(shown).foregroundStyle(DailyPalette.placeholder))
                .font(DailyPalette.sans(textSize))
                .foregroundStyle(DailyPalette.ink)
                .tint(DailyPalette.green)
                .focused($typing)
                .submitLabel(.done)
                .onSubmit { model.send(.submitted) }
                .frame(height: metrics.field.height)
                .accessibilityIdentifier("daily.bar.field")
        }
    }

    /// The placeholder that fits the field's words' room at the field's text size (measured here,
    /// chosen by `DailyCopy.fitting`): the full one, else the short one, never cut short.
    private var shown: String {
        guard let shortPlaceholder else { return placeholder }
        let base = UIFont(name: "DMSans-Regular", size: textSize) ?? .systemFont(ofSize: textSize)
        let font = UIFontMetrics.default.scaledFont(for: base)
        return DailyCopy.fitting([placeholder, shortPlaceholder], room: metrics.wordsRoom) {
            ($0 as NSString).size(withAttributes: [.font: font]).width
        }
    }

    /// The light's drawing is 38 across, at the field's right end; its touch shape is 44 wide
    /// and the field's full height, ending where the light ends (`DailyMetrics.Bar.lightTouch`).
    private func light(_ bar: DailyBar) -> some View {
        Button {
            touched()
            model.send(.micTapped)
        } label: {
            // Shown at once as the travelling light lands (never faded in), so one light changes size.
            DailyLight(diameter: metrics.light, listening: bar.isListening, halo: model.handoverHalo)
                .opacity(lightShown ? 1 : 0)
                .frame(width: metrics.lightTouch.width, height: metrics.lightTouch.height, alignment: .trailing)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(bar.lightLabel)
        .accessibilityIdentifier("daily.bar.light")
        .background { haloMarker }
    }

    /// Debug demo only: a marker a UI test can find while the light wears the handover's halo, so
    /// "no line" can be told apart from "no handover at all".
    @ViewBuilder private var haloMarker: some View {
        #if DEBUG
        if DemoMode.isOn && model.handoverHalo {
            Color.clear
                .frame(width: 1, height: 1)
                .accessibilityElement()
                .accessibilityIdentifier("daily.bar.halo")
        }
        #endif
    }

    // MARK: The line above the bar

    /// The one line slot: the listening line, or the note with Undo beside it. 44 high, centred
    /// on the board's line, ending above More and Inbox.
    private func slot(_ slot: DailyBar.Slot) -> some View {
        HStack(spacing: 10) {
            switch slot {
            case .empty:
                EmptyView()
            case .listening:
                line(listening)
            case .say(let note, let undo):
                if let note { line(note) }
                if undo { undoButton }
            case .handover:
                line(DailyCopy.handover)
                    .transition(.opacity)
                    .accessibilityIdentifier("daily.handover")
            }
        }
        .frame(width: max(0, metrics.fade.width - 32), height: DailyMetrics.minTouch)
        .offset(x: metrics.fade.minX + 16, y: metrics.line - 18)
    }

    private func line(_ words: String) -> some View {
        Text(words)
            .font(DailyPalette.sans(12.5))
            .foregroundStyle(night ? Color.white : DailyPalette.muted)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
    }

    private var undoButton: some View {
        Button { model.send(.undoTapped) } label: {
            HStack(spacing: 5) {
                Image(systemName: "arrow.uturn.backward")
                    .font(.system(size: 12, weight: .semibold))
                Text(WalkCopy.undo)
                    .font(DailyPalette.sansSemiBold(13))
            }
            .foregroundStyle(night ? Color.white : DailyPalette.deepGreen)
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(Capsule().fill(night ? DailyPalette.navy.opacity(0.6) : Color.white))
            .overlay(Capsule().strokeBorder(night ? Color.white.opacity(0.55) : DailyPalette.line, lineWidth: 1))
            .frame(minWidth: DailyMetrics.minTouch, minHeight: DailyMetrics.minTouch)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .fixedSize()
        .accessibilityLabel(WalkCopy.undo)
        .accessibilityIdentifier("daily.undo")
    }

    // MARK: More and Inbox

    private func icon(_ label: String, symbol: String, id: String, frame: CGRect,
                      action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                Image(systemName: symbol)
                    .font(.system(size: 20, weight: .regular))
                    .frame(height: 22)
                    .accessibilityHidden(true)
                Text(label)
                    .font(DailyPalette.sans(10.5))
            }
            .foregroundStyle(night ? Color.white : DailyPalette.muted)
            .frame(width: frame.width, height: frame.height)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
        .offset(x: frame.minX, y: frame.minY)
    }

    /// With the keyboard up, the paper the bar stands on rises with it, fading in over the rows.
    private func paper(rise: CGFloat) -> some View {
        VStack(spacing: 0) {
            LinearGradient(colors: [DailyPalette.paper.opacity(0), DailyPalette.paper], startPoint: .top, endPoint: .bottom)
                .frame(height: metrics.fade.height)
            DailyPalette.paper
        }
        .frame(width: metrics.fade.width, height: metrics.field.maxY - metrics.fade.minY + DailyMetrics.keyboardGap)
        .offset(x: metrics.fade.minX, y: metrics.fade.minY - rise)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The walk's light, small: "one control in two sizes". The walk's own gradient, inner shades,
/// glow and highlight (`WalkOrbView`'s body at 96 across) scaled to `diameter`, with the board's
/// thin warm ring and a microphone in plank ink. Listening, it turns rust with a white
/// microphone and a soft rust ring. It does not breathe: on the bar it is a button, at rest.
/// Just handed over from the walk it wears the board's halo (`halo`, which fades in and out on
/// its own); travelling down its microphone fades in over the last quarter (`micOpacity`), as the
/// walk's light has none.
struct DailyLight: View {
    let diameter: CGFloat
    let listening: Bool
    var halo = false
    var micOpacity: Double = 1

    /// The walk's light is 96 across; everything below is its number times this.
    private var k: CGFloat { diameter / 96 }

    var body: some View {
        ZStack {
            if listening {
                Circle()
                    .fill(DailyPalette.rust.opacity(0.18))
                    .frame(width: diameter + 10, height: diameter + 10)
                Circle()
                    .fill(DailyPalette.rust)
                    .frame(width: diameter, height: diameter)
            } else {
                // Only the halo animates: the light itself never fades as it arrives.
                ZStack { if halo { handoverHalo } }
                    .animation(.easeInOut(duration: 0.25), value: halo)
                orb(at: k)
            }
            if micOpacity > 0 {
                Image(systemName: "mic")
                    .font(.system(size: 20 * diameter / 38, weight: .regular))
                    .foregroundStyle(listening ? Color.white : DailyPalette.plankInk)
                    .opacity(micOpacity)
            }
        }
        .frame(width: diameter, height: diameter)
        .accessibilityHidden(true)
    }

    /// The board's handover halo: a 7 pt ring `rgba(246,223,166,.6)` and a glow of radius 26
    /// `rgba(255,214,140,.95)` spread 10 beyond the light.
    private var handoverHalo: some View {
        ZStack {
            Circle()
                .fill(DailyPalette.handoverGlow.opacity(0.95))
                .frame(width: diameter + 20, height: diameter + 20)
                .blur(radius: 13)
            Circle()
                .fill(DailyPalette.gold.opacity(0.6))
                .frame(width: diameter + 14, height: diameter + 14)
        }
        .transition(.opacity)
    }

    private func orb(at k: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            Circle()
                .fill(RadialGradient(stops: DailyPalette.lightStops,
                                     center: UnitPoint(x: 0.38, y: 0.30), startRadius: 0, endRadius: 89.8 * k)
                    .shadow(.inner(color: WalkPalette.orbInnerShade.opacity(0.3), radius: 10 * k, x: 0, y: -10 * k))
                    .shadow(.inner(color: .white.opacity(0.8), radius: 5 * k, x: 0, y: 4 * k)))
                .overlay(Circle().strokeBorder(WalkPalette.orbInnerShade.opacity(0.3), lineWidth: 1))
                .shadow(color: WalkPalette.orbGlow.opacity(0.85), radius: 18 * k)
                .shadow(color: WalkPalette.orbGlow.opacity(0.5), radius: 45 * k)
            Ellipse()
                .fill(RadialGradient(colors: [.white.opacity(0.8), .white.opacity(0)], center: .center,
                                     startRadius: 0, endRadius: 16 * k))
                .scaleEffect(x: 1, y: 18 / 32)
                .frame(width: 32 * k, height: 18 * k)
                .offset(x: 20 * k, y: 13 * k)
        }
        .frame(width: 96 * k, height: 96 * k)
    }
}
#endif
