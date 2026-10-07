import Foundation

/// The day, to scale (web `lib/today/dayScale.ts`, Scott 2026-10-06/07):
/// Today's timed day as a column of hours — each thing where it falls, free
/// stretches of an hour or more named, a now line. It IS the schedule; the
/// phone's Morning/Afternoon/Evening lists it replaced are gone.
///
/// Pure: positions in points from the top of the column; hours are decimals
/// (9.5 = 9:30). Keep it a line-for-line port so the two apps lay a day out
/// the same way — `DayScaleTests` mirrors the web's `dayScale.test.ts`.
enum DayScale {
    struct Input {
        let id: String
        let start: Date
        /// No end: half an hour, as everywhere else on Today.
        let end: Date?
    }

    struct Block: Equatable {
        let id: String
        var top: Double
        let height: Double
        /// Side by side when two things share time: this one's column, of `lanes`.
        var lane: Int
        var lanes: Int
        /// Too short for two lines.
        let compact: Bool
    }

    struct Free: Equatable { let top: Double; let height: Double; let label: String }
    struct Tick: Equatable { let top: Double; let label: String }

    struct Layout {
        let startHour: Int
        let endHour: Int
        let pointsPerHour: Double
        let height: Double
        let blocks: [Block]
        let free: [Free]
        let ticks: [Tick]
        /// The now line, or nil when it isn't today.
        let now: Double?
    }

    static let defaultStart = 7
    static let defaultEnd = 21
    private static let defaultMinutes = 30.0
    static let minBlock = 26.0
    private static let compactBelow = 40.0
    private static let stackGap = 4.0
    /// An hour or more counts as free, as on the Week page's days.
    private static let minFreeHours = 1.0
    private static let freeInset = 4.0
    private static let minFreePoints = 36.0

    static func hourOf(_ d: Date) -> Double {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        return Double(c.hour ?? 0) + Double(c.minute ?? 0) / 60
    }

    /// "6a", "12p", "2p"
    static func hourLabel(_ h: Int) -> String {
        let hh = ((h % 24) + 24) % 24
        let twelve = hh % 12 == 0 ? 12 : hh % 12
        return "\(twelve)\(hh < 12 ? "a" : "p")"
    }

    /// "4½ hours free", "1 hour free" — quarter hours, as a person says them.
    static func freeHoursLabel(_ hours: Double) -> String {
        let q = (hours * 4).rounded() / 4
        let whole = Int(q.rounded(.down))
        let frac: String
        switch q - Double(whole) {
        case 0.25: frac = "¼"
        case 0.5: frac = "½"
        case 0.75: frac = "¾"
        default: frac = ""
        }
        return "\(whole)\(frac) \(q == 1 ? "hour" : "hours") free"
    }

    static func build(_ items: [Input], now: Date? = nil, pointsPerHour pph: Double = 48) -> Layout {
        let cal = Calendar.current
        let spans: [(id: String, s: Double, e: Double)] = items.map { i in
            let s = hourOf(i.start)
            let rawEnd = i.end.map(hourOf) ?? s + defaultMinutes / 60
            // An end on the next day (or before the start) runs to midnight.
            let e: Double
            if let end = i.end, !cal.isDate(end, inSameDayAs: i.start) || rawEnd <= s { e = 24 } else { e = rawEnd }
            return (i.id, s, max(e, s + 0.25))
        }
        let nowH = now.map(hourOf)

        // The column runs 7a–9p, stretched to hold everything on it and the now line.
        var startHour = defaultStart
        var endHour = defaultEnd
        for sp in spans {
            startHour = min(startHour, Int(sp.s.rounded(.down)))
            endHour = max(endHour, Int(sp.e.rounded(.up)))
        }
        if let nowH {
            startHour = min(startHour, Int(nowH.rounded(.down)))
            endHour = max(endHour, Int(nowH.rounded(.up)))
        }
        startHour = max(0, startHour)
        endHour = min(24, endHour)
        let y = { (h: Double) in (h - Double(startHour)) * pph }

        // Blocks in time order, longer first at the same start.
        var placed: [Block] = spans
            .sorted { $0.s != $1.s ? $0.s < $1.s : $0.e > $1.e }
            .map { sp in
                let natural = (sp.e - sp.s) * pph
                return Block(id: sp.id, top: y(sp.s), height: max(minBlock, natural), lane: 0, lanes: 1, compact: natural < compactBelow)
            }

        // Clusters of things that touch on screen. Two short ones stack (the
        // second just under the first, as a list would); anything else shares
        // the width, side by side, the way a calendar draws overlapping meetings.
        var cluster: [Int] = []
        var clusterBottom = -Double.infinity
        func flush() {
            var laneEnds: [Double] = []
            for i in cluster {
                var lane = laneEnds.firstIndex { $0 <= placed[i].top + 0.5 } ?? -1
                if lane == -1 { lane = laneEnds.count; laneEnds.append(0) }
                laneEnds[lane] = placed[i].top + placed[i].height
                placed[i].lane = lane
            }
            for i in cluster { placed[i].lanes = laneEnds.count }
        }
        for i in placed.indices {
            if cluster.isEmpty || placed[i].top >= clusterBottom {
                flush()
                cluster = [i]
                clusterBottom = placed[i].top + placed[i].height
                continue
            }
            if placed[i].compact && cluster.allSatisfy({ placed[$0].compact }) { placed[i].top = clusterBottom + stackGap }
            cluster.append(i)
            clusterBottom = max(clusterBottom, placed[i].top + placed[i].height)
        }
        flush()

        let columnHeight = max(y(Double(endHour)), placed.map { $0.top + $0.height + 8 }.max() ?? 0)

        // Free time: the gaps between taken time, an hour or more. On today the
        // part before now is spent, so a gap starts at now.
        let busy = spans.sorted { $0.s < $1.s }
        let from = nowH.map { max(Double(startHour), $0) } ?? Double(startHour)
        var windows: [(s: Double, e: Double)] = []
        var cursor = from
        for b in busy {
            if b.s - cursor >= minFreeHours { windows.append((cursor, b.s)) }
            cursor = max(cursor, b.e)
        }
        if Double(endHour) - cursor >= minFreeHours { windows.append((cursor, Double(endHour))) }

        var free: [Free] = []
        let startOf = Dictionary(spans.map { ($0.id, $0.s) }, uniquingKeysWith: { a, _ in a })
        for w in windows {
            // Kept clear of any block drawn into it (a chip pushed down, a
            // minimum height). Which side a block clears from is decided by its
            // TIME, not where it was drawn: a short chip stacked below another
            // still belongs before the stretch, so it pushes the top down —
            // judged by position it read as inside the stretch and cut the
            // evening to nothing.
            var top = y(w.s)
            var bottom = y(w.e)
            for b in placed where b.top < bottom && b.top + b.height > top {
                if (startOf[b.id] ?? 0) < w.s + 0.001 { top = max(top, b.top + b.height) } else { bottom = min(bottom, b.top) }
            }
            top += freeInset
            bottom -= freeInset
            if bottom - top < minFreePoints { continue }
            let toEnd = w.e >= Double(endHour)
            let label = toEnd && w.s >= 16
                ? "Evening open"
                : toEnd && w.s <= from
                    ? (nowH != nil ? "The rest of the day is open" : "Open all day")
                    : freeHoursLabel(w.e - w.s)
            free.append(Free(top: top, height: bottom - top, label: label))
        }

        let ticks = stride(from: startHour, through: endHour, by: 2).map { Tick(top: y(Double($0)), label: hourLabel($0)) }

        return Layout(startHour: startHour, endHour: endHour, pointsPerHour: pph, height: columnHeight,
                      blocks: placed, free: free, ticks: ticks, now: nowH.map(y))
    }
}
