import Foundation
import CoreGraphics

/// The walk hands its light to the bar ("one control, two sizes"). When an ordinary walk
/// finishes in a light household whose Today is the light page on this window, Today rises
/// and the walk's light travels down, shrinking all the way, into the bar's light, which
/// wears a halo; the first time only, one quiet line (`DailyCopy.handover`) shows in the
/// bar's line slot. This is the rule and the light's path; `HandoverLight` only draws it.
enum DailyHandover {
    static let travelMs = 900, lineMs = 6000, sheetDrop: CGFloat = 154
    /// How far the path's middle is pushed off the straight line, as a share of its length.
    static let bow: CGFloat = 0.12
    /// The share of the travel over which the light fades in.
    static let fadeIn = 0.15
    /// The microphone glyph fades in from here to the end, so the light that lands already wears it.
    static let micFrom = 0.75

    struct Light: Equatable {
        let centre: CGPoint; let diameter: CGFloat; let opacity: Double
        /// The microphone glyph's opacity: 0 until the last quarter of the travel, 1 on landing.
        let micOpacity: Double
    }

    /// Which walk ended: an ordinary one (a first walk, a resumed one, one picked back up, a
    /// replay from Settings), or a walk down from a flag or a sign (`DailyWalkDown`).
    enum Ending: Equatable { case walk, walkDown }

    /// Whether this ending hands the light over: only an ordinary walk, only finished, only one
    /// opened in a light household, and only where light Today with its bar is the page this
    /// window draws (`lightToday`: `AppState.dailyHidesDock`, which the light Planner sets from
    /// `DailyGate.hidesDock` for the window it measured). Not now, Leave for now, a walk down,
    /// a sign-out or the day turning never hand over; a full household ends as it always has.
    static func plays(_ ending: Ending, status: WalkStatus, edition: Edition, lightToday: Bool) -> Bool {
        ending == .walk && status == .finished && edition == .light && lightToday
    }

    /// How the handover plays on the page, once it arrives there.
    enum Play: Equatable {
        /// The bar is not on screen (the whole plan showing, or a sheet over the page): nothing
        /// plays and the line is not spent.
        case skip
        /// The sheet rises from `sheetDrop` lower and the light travels for `travelMs`.
        case travel
        /// Nothing travels and the sheet does not move; the halo and line fade in: with Reduce
        /// Motion, or when the line slot is already taken as it starts (a Tell that waited for the
        /// walk, answered as Today appears), which interrupts it before it begins (`interrupt(.slot)`).
        case still
    }

    /// `sheetOver`: anything over the page that hides the bar (Inbox, More, a row's details, the
    /// half-open display). Asked again as the light lands: with the bar gone by then, nothing arrives.
    static func play(lowered: Bool, sheetOver: Bool, reduceMotion: Bool, slotTaken: Bool = false) -> Play {
        guard !lowered, !sheetOver else { return .skip }
        return reduceMotion || slotTaken ? .still : .travel
    }

    /// What can happen while the light travels: a touch on the bar (its light or its field), the
    /// line slot changing, or the handle lowering the sheet over the whole plan.
    enum Interruption: Equatable { case touch, slot(DailyBar.Slot), handle }

    /// Whether it ends the travel (the light snaps home at once), and whether the light then arrives
    /// (the halo, and the line if the slot is free). A touch, and listening, a note or Undo taking the
    /// slot, end it and arrive; the slot emptying does nothing; the handle takes the bar away, so it
    /// ends with no arrival and the line is not spent.
    static func interrupt(_ interruption: Interruption) -> (ends: Bool, arrives: Bool) {
        switch interruption {
        case .touch: (true, true)
        case .slot(let slot): slot == .empty ? (false, false) : (true, true)
        case .handle: (true, false)
        }
    }

    /// Where the walk's light stands in this window, and how wide.
    static func start(window: CGSize) -> (centre: CGPoint, diameter: CGFloat) {
        let stage = WalkStage(device: window)
        return (stage.toDevice(WalkOrb.centre), 2 * WalkOrb.radius * stage.scale)
    }

    /// Where the bar's light stands (its diameter, at the field's right end, `lightInset` in).
    static func end(bar: DailyMetrics.Bar) -> (centre: CGPoint, diameter: CGFloat) {
        (CGPoint(x: bar.field.maxX - DailyMetrics.lightInset - bar.light / 2, y: bar.field.midY), bar.light)
    }

    /// `progress` 0…1: from the walk's light to the bar's, shrinking all the way, along a curve that bows right; it fades in over the first 0.15.
    static func light(at progress: Double, from: (centre: CGPoint, diameter: CGFloat),
                      to: (centre: CGPoint, diameter: CGFloat)) -> Light {
        let t = CGFloat(min(1, max(0, progress)))
        let a = from.centre, b = to.centre
        // A quadratic curve whose control point stands off the chord's middle, on its right.
        let dx = b.x - a.x, dy = b.y - a.y
        let length = hypot(dx, dy)
        var normal = length > 0 ? CGPoint(x: -dy / length, y: dx / length) : .zero
        if normal.x < 0 { normal = CGPoint(x: -normal.x, y: -normal.y) }
        let control = CGPoint(x: (a.x + b.x) / 2 + normal.x * bow * length,
                              y: (a.y + b.y) / 2 + normal.y * bow * length)
        let u = 1 - t
        let centre: CGPoint
        if t == 1 {
            centre = b                                                  // exactly on the bar's light
        } else {
            centre = CGPoint(x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
                             y: u * u * a.y + 2 * u * t * control.y + t * t * b.y)
        }
        let diameter = t == 1 ? to.diameter : from.diameter + (to.diameter - from.diameter) * t
        return Light(centre: centre, diameter: diameter, opacity: min(1, Double(t) / fadeIn),
                     micOpacity: min(1, max(0, (Double(t) - micFrom) / (1 - micFrom))))
    }
}

/// The line is shown once per person per phone: `UserDefaults` key `daily.handover.seen.<user id lowercased>`.
struct HandoverMemory {
    var defaults: UserDefaults = .standard

    private func key(_ userId: UUID?) -> String {
        "daily.handover.seen.\(userId?.uuidString.lowercased() ?? "none")"
    }

    func seen(for userId: UUID?) -> Bool { defaults.bool(forKey: key(userId)) }

    func markSeen(for userId: UUID?) { defaults.set(true, forKey: key(userId)) }
}
