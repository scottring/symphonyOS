import XCTest
@testable import RemindersBridge

/// A fake paged source of `total` synthetic integer rows that records every
/// (offset, limit) window it was asked for.
final class FakePagedSource {
    let total: Int
    private(set) var windows: [(offset: Int, limit: Int)] = []
    init(total: Int) { self.total = total }

    func fetch(offset: Int, limit: Int) async throws -> [Int] {
        windows.append((offset, limit))
        if offset >= total { return [] }
        return Array(offset..<min(offset + limit, total))
    }
}

final class PaginatorTests: XCTestCase {
    func testReturnsAllItemsBeyondSinglePageCap() async throws {
        let source = FakePagedSource(total: 1229)
        let all = try await Paginator.fetchAll(pageSize: 1000, source.fetch)
        XCTAssertEqual(all, Array(0..<1229))
    }

    func testStopsAfterOnePageWhenSmallerThanPageSize() async throws {
        let source = FakePagedSource(total: 50)
        let all = try await Paginator.fetchAll(pageSize: 1000, source.fetch)
        XCTAssertEqual(all.count, 50)
        XCTAssertEqual(source.windows.count, 1)
    }

    func testExactMultipleFetchesTrailingEmptyPageToConfirmEnd() async throws {
        let source = FakePagedSource(total: 2000)
        let all = try await Paginator.fetchAll(pageSize: 1000, source.fetch)
        XCTAssertEqual(all.count, 2000)
        // 0-999, 1000-1999, then a third (empty) page proving we reached the end.
        XCTAssertEqual(source.windows.count, 3)
    }
}
