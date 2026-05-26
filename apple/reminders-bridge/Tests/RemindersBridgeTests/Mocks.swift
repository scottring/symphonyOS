import Foundation
@testable import RemindersBridge

class MockRemindersClient: RemindersClientProtocol {
    var inserted: [(title: String, completed: Bool, list: String)] = []
    var updated: [(externalId: String, title: String, completed: Bool)] = []
    var deleted: [String] = []
    var nextInsertedId = "new-apple-id"

    /// If non-nil, `fetchItems(fromListNamed:)` throws this error.
    var fetchItemsError: Error?
    /// Items returned by `fetchItems(fromListNamed:)` when no error is set.
    var fetchItemsResult: [AppleItem] = []

    func requestAccess() async throws {}

    func fetchItems(fromListNamed name: String) async throws -> [AppleItem] {
        if let err = fetchItemsError { throw err }
        return fetchItemsResult
    }

    func insert(title: String, completed: Bool, intoListNamed name: String) async throws -> String {
        inserted.append((title, completed, name))
        return nextInsertedId
    }
    func update(externalId: String, title: String, completed: Bool) async throws {
        updated.append((externalId, title, completed))
    }
    func delete(externalId: String) async throws {
        deleted.append(externalId)
    }
}

class MockSymphonyClient: SymphonyClientProtocol {
    var inserted: [(listId: UUID, text: String, completed: Bool, externalId: String)] = []
    var updated: [(id: UUID, text: String, completed: Bool)] = []
    var externalIdSet: [(id: UUID, externalId: String)] = []
    var deleted: [UUID] = []

    /// If non-nil, `fetchItems(listId:)` throws this error.
    var fetchItemsError: Error?
    /// Items returned by `fetchItems(listId:)` when no error is set.
    var fetchItemsResult: [SymphonyItem] = []

    func fetchItems(listId: UUID) async throws -> [SymphonyItem] {
        if let err = fetchItemsError { throw err }
        return fetchItemsResult
    }
    func insert(listId: UUID, userId: UUID, text: String, completed: Bool, externalId: String) async throws {
        inserted.append((listId, text, completed, externalId))
    }
    func update(symphonyId: UUID, text: String, completed: Bool) async throws {
        updated.append((symphonyId, text, completed))
    }
    func setExternalId(symphonyId: UUID, externalId: String) async throws {
        externalIdSet.append((symphonyId, externalId))
    }
    func delete(symphonyId: UUID) async throws {
        deleted.append(symphonyId)
    }
}

final class FailingSetExternalIdSymphonyMock: MockSymphonyClient {
    override func setExternalId(symphonyId: UUID, externalId: String) async throws {
        throw NSError(domain: "test", code: 1)
    }
}

/// Symphony mock whose `insert` throws for one specific externalId (simulating a
/// unique-constraint collision on a single row), recording all other inserts.
final class FailingInsertSymphonyMock: MockSymphonyClient {
    var failForExternalId: String

    init(failForExternalId: String) {
        self.failForExternalId = failForExternalId
    }

    override func insert(listId: UUID, userId: UUID, text: String, completed: Bool, externalId: String) async throws {
        if externalId == failForExternalId {
            throw NSError(domain: "test", code: 23505)
        }
        try await super.insert(listId: listId, userId: userId, text: text, completed: completed, externalId: externalId)
    }
}
