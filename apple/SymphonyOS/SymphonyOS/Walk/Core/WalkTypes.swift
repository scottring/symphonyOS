import Foundation
import CoreGraphics

/// The five steps of the walk, top of the mountain to the bottom.
enum WalkLevel: Int, Codable, CaseIterable { case year = 1, season, month, week, today }

enum WalkDepth: String, Codable { case quick, full }

/// `left`: Not now on Welcome. `paused`: Leave for now part-way; never reopened by itself, picked up from Settings or Today.
enum WalkStatus: String, Codable { case inProgress, finished, left, paused }

struct WalkArea: Codable, Equatable, Identifiable {
    let id: UUID
    var name: String
}

struct WalkItem: Equatable, Identifiable {
    let id: UUID
    let level: WalkLevel              // year…week; a first thing is a week item
    var title: String
    var areaId: UUID?
    var parentId: UUID?
    var day: Date?
    var done = false
    /// Planted by this walk: may be moved or pulled up.
    var mine = true
}

/// Where flags stand: one post per level, per area column (nil = the unlabeled post).
struct WalkPostKey: Hashable {
    let level: WalkLevel
    let column: UUID?
}

enum CompassPoint: String, CaseIterable {
    case n, ne, e, se, s, sw, w, nw

    var degrees: CGFloat {
        switch self {
        case .n: return -90
        case .ne: return -45
        case .e: return 0
        case .se: return 45
        case .s: return 90
        case .sw: return 135
        case .w: return 180
        case .nw: return -135
        }
    }
}

enum WalkAction: Equatable {
    case quick, full, notNow, back, next, type, examples, undo, calendar, startThere, leave
}

enum WalkSoundName: String, CaseIterable { case bag, poles, unfurl, plant, tick }
