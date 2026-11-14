import Foundation

/// What the half-open display draws, read from Today's page (`DailyTodayPage`, so the row being
/// pulled up is left out here too): on the half you touch the open rows in order, each a tick,
/// with the done ones as one count, and the ring; on the half you look at the next event and the
/// sign, which there cannot be touched.
struct DailyTentPage: Equatable {
    let open: [DailyDay.Row]
    let done: Int
    let ring: DailyTodayPage.Ring?
    let next: DailyDay.Next?
    let sign: Signpost.Sign?

    init(_ page: DailyTodayPage) {
        let split = DailyDay.split(page.rows)
        open = split.open
        done = split.done
        ring = page.ring
        next = page.next
        sign = page.sign
    }

    /// "1 done" after the open rows; nothing while none is done.
    var doneLine: String? { done > 0 ? DailyCopy.done(done) : nil }

    /// No task today at all: the touch half says so (`WalkCopy.nothingToday`).
    var nothing: Bool { open.isEmpty && done == 0 }
}
