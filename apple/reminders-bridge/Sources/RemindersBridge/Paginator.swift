import Foundation

public enum Paginator {
    /// Fetch all rows by paging through `fetchPage(offset, limit)` until a page
    /// shorter than `pageSize` is returned.
    ///
    /// Required because PostgREST caps a single response at a fixed maximum
    /// (default 1000 rows). An unpaged `.select()` silently truncates large
    /// lists, which makes the reconciler treat the unseen tail as "missing" and
    /// re-insert rows that already exist — colliding on the external-id unique
    /// index and wedging the whole sync pass.
    public static func fetchAll<T>(
        pageSize: Int,
        _ fetchPage: (_ offset: Int, _ limit: Int) async throws -> [T]
    ) async throws -> [T] {
        var all: [T] = []
        var offset = 0
        while true {
            let page = try await fetchPage(offset, pageSize)
            all.append(contentsOf: page)
            // A short page means we've reached the end. A full page means there
            // may be more, so keep going (an exact multiple ends on an empty page).
            if page.count < pageSize { break }
            offset += pageSize
        }
        return all
    }
}
