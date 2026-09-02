import Testing
import Foundation
@testable import Symphony

/// Mirrors src/lib/pageParse.ts + src/lib/planParse.ts on the web: the phone must
/// place a photographed page exactly where the desktop would.
struct PageParseTests {
    private let cal = Calendar.current

    private func ymd(_ y: Int, _ m: Int, _ d: Int) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d))!
    }

    @Test func windowIsFourteenDaysStartingToday() {
        let dates = PageParse.windowDates(from: ymd(2026, 9, 2))
        #expect(dates.count == 14)
        #expect(dates.first == "2026-09-02")
        #expect(dates.last == "2026-09-15")
    }

    @Test func localYmdRoundTrips() {
        let d = ymd(2026, 3, 8)
        #expect(PageParse.localYmd(d) == "2026-03-08")
        #expect(PageParse.parseLocalYmd("2026-03-08") == d)
        #expect(PageParse.parseLocalYmd("garbage") == nil)
    }

    @Test func weekStartAnchorDefaultsToSunday() {
        // 2026-09-02 is a Wednesday → the Sunday before is 2026-08-30.
        #expect(PageParse.weekStartAnchor(now: ymd(2026, 9, 2)) == ymd(2026, 8, 30))
        // Monday start (2) → 2026-08-31.
        #expect(PageParse.weekStartAnchor(now: ymd(2026, 9, 2), weekStartsOn: 2) == ymd(2026, 8, 31))
        // Already on the anchor day → same day.
        #expect(PageParse.weekStartAnchor(now: ymd(2026, 8, 30)) == ymd(2026, 8, 30))
    }

    private func response(items: [PageParseResponse.Item] = [], notes: [PageParseResponse.Note] = [],
                          unclear: [String] = [], window: [String]? = nil, storagePath: String? = "u/pages/p.jpg") -> PageParseResponse {
        PageParseResponse(ok: true, error: nil, items: items, notes: notes, unclear: unclear, window: window, storagePath: storagePath)
    }

    @Test func validateMapsPlacementsAndClampsToWindow() {
        let member = UUID()
        let window = ["2026-09-02", "2026-09-03"]
        let r = response(items: [
            .init(title: " Buy cleats ", day: "2026-09-03", assignee_id: member.uuidString, note: " size 4 "),
            .init(title: "Call school", day: "week", assignee_id: nil, note: nil),
            .init(title: "Someday idea", day: "inbox", assignee_id: "not-a-uuid", note: ""),
            .init(title: "Past day", day: "2026-08-01", assignee_id: nil, note: nil),
            .init(title: "", day: "inbox", assignee_id: nil, note: nil),
        ], window: window)
        let out = PageParse.validate(r, fallbackWindow: ["x"], memberIds: [member])
        #expect(out.windowDates == window)
        #expect(out.items.map(\.title) == ["Buy cleats", "Call school", "Someday idea", "Past day"])
        #expect(out.items[0].placement == .date("2026-09-03"))
        #expect(out.items[0].assigneeId == member)
        #expect(out.items[0].note == "size 4")
        #expect(out.items[1].placement == .week)
        #expect(out.items[2].placement == .inbox)
        #expect(out.items[2].assigneeId == nil)
        #expect(out.items[2].note == nil)
        #expect(out.items[3].placement == .week)      // outside the window → week
        #expect(out.storagePath == "u/pages/p.jpg")
    }

    @Test func validateUsesFallbackWindowAndUnknownMemberBecomesNil() {
        let r = response(items: [.init(title: "A", day: "2026-09-02", assignee_id: UUID().uuidString, note: nil)], window: nil)
        let out = PageParse.validate(r, fallbackWindow: ["2026-09-02"], memberIds: [])
        #expect(out.windowDates == ["2026-09-02"])
        #expect(out.items[0].placement == .date("2026-09-02"))
        #expect(out.items[0].assigneeId == nil)
    }

    @Test func validateCapsNotesAndUnclearAndDerivesNoteTitles() {
        let notes = (0..<25).map { PageParseResponse.Note(title: $0 == 0 ? nil : "T\($0)", content: "line one \($0)\nline two") }
        let r = response(notes: notes, unclear: Array(repeating: " ?? ", count: 25))
        let out = PageParse.validate(r, fallbackWindow: [], memberIds: [])
        #expect(out.notes.count == 20)
        #expect(out.notes[0].title == "line one 0")     // missing title → first line
        #expect(out.notes[1].title == "T1")
        #expect(out.unclear.count == 20)
        #expect(out.unclear[0] == "??")
    }

    @Test func taskFieldsForEachPlacement() {
        let me = UUID(), other = UUID()
        let weekStart = ymd(2026, 8, 30)
        let dated = PageItem(id: UUID(), title: "Buy cleats", placement: .date("2026-09-03"), assigneeId: other, note: "size 4")
        let f1 = PageParse.taskFields(for: dated, currentWeekStart: weekStart, defaultAssignee: me, selfMemberId: me)
        #expect(f1.scheduledFor == ymd(2026, 9, 3))
        #expect(f1.isAllDay == true)
        #expect(f1.bucket == "timed")
        #expect(f1.weekStart == nil)
        #expect(f1.assignedTo == other)
        #expect(f1.notes == "size 4")
        #expect(f1.scope == "couple")         // assigned to someone else → shared

        let week = PageItem(id: UUID(), title: "Call school", placement: .week, assigneeId: nil, note: nil)
        let f2 = PageParse.taskFields(for: week, currentWeekStart: weekStart, defaultAssignee: me, selfMemberId: me)
        #expect(f2.scheduledFor == nil)
        #expect(f2.bucket == "week")
        #expect(f2.weekStart == weekStart)
        #expect(f2.assignedTo == me)          // unassigned → the planner
        #expect(f2.scope == "individual")     // defaults to me → private

        let inbox = PageItem(id: UUID(), title: "Idea", placement: .inbox, assigneeId: nil, note: nil)
        let f3 = PageParse.taskFields(for: inbox, currentWeekStart: weekStart, defaultAssignee: nil, selfMemberId: me)
        #expect(f3.bucket == "inbox")
        #expect(f3.scheduledFor == nil)
        #expect(f3.weekStart == nil)
        #expect(f3.assignedTo == nil)
        #expect(f3.scope == "individual")     // unassigned → private

        // Assigned explicitly to me (not just defaulted) also stays private.
        let assignedToMe = PageItem(id: UUID(), title: "Water plants", placement: .inbox, assigneeId: me, note: nil)
        let f4 = PageParse.taskFields(for: assignedToMe, currentWeekStart: weekStart, defaultAssignee: nil, selfMemberId: me)
        #expect(f4.assignedTo == me)
        #expect(f4.scope == "individual")
    }
}
