import XCTest
@testable import RemindersBridge

final class MockRemindersClient: RemindersClientProtocol {
    var inserted: [(title: String, completed: Bool, list: String)] = []
    var updated: [(externalId: String, title: String, completed: Bool)] = []
    var deleted: [String] = []
    var nextInsertedId = "new-apple-id"

    func requestAccess() async throws {}
    func fetchItems(fromListNamed name: String) async throws -> [AppleItem] { [] }

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

    func fetchItems(listId: UUID) async throws -> [SymphonyItem] { [] }
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

final class ApplierTests: XCTestCase {
    let userId = UUID()
    let listId = UUID()
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    func testInsertSymphonyCallsSymphonyInsert() async throws {
        let r = MockRemindersClient(); let s = MockSymphonyClient()
        let applier = Applier(reminders: r, symphony: s, userId: userId)
        let apple = AppleItem(externalId: "a1", title: "milk", isCompleted: false, lastModified: t0)

        try await applier.apply([.insertSymphony(listId: listId, apple: apple)])

        XCTAssertEqual(s.inserted.count, 1)
        XCTAssertEqual(s.inserted[0].listId, listId)
        XCTAssertEqual(s.inserted[0].text, "milk")
        XCTAssertEqual(s.inserted[0].externalId, "a1")
    }

    func testInsertAppleSetsExternalIdBack() async throws {
        let r = MockRemindersClient(); let s = MockSymphonyClient()
        r.nextInsertedId = "fresh-apple-id"
        let applier = Applier(reminders: r, symphony: s, userId: userId)
        let sym = SymphonyItem(id: UUID(), listId: listId, text: "bread", completed: false, updatedAt: t0, externalId: nil)

        try await applier.apply([.insertApple(symphony: sym, appleListName: "Groceries")])

        XCTAssertEqual(r.inserted.count, 1)
        XCTAssertEqual(r.inserted[0].title, "bread")
        XCTAssertEqual(r.inserted[0].list, "Groceries")
        XCTAssertEqual(s.externalIdSet.count, 1)
        XCTAssertEqual(s.externalIdSet[0].id, sym.id)
        XCTAssertEqual(s.externalIdSet[0].externalId, "fresh-apple-id")
    }

    func testDeleteSymphonyCallsSymphonyDelete() async throws {
        let r = MockRemindersClient(); let s = MockSymphonyClient()
        let applier = Applier(reminders: r, symphony: s, userId: userId)
        let symId = UUID()

        try await applier.apply([.deleteSymphony(symphonyId: symId)])

        XCTAssertEqual(s.deleted, [symId])
    }

    func testUpdateApplePassesNewValues() async throws {
        let r = MockRemindersClient(); let s = MockSymphonyClient()
        let applier = Applier(reminders: r, symphony: s, userId: userId)
        let sym = SymphonyItem(id: UUID(), listId: listId, text: "olive oil", completed: true, updatedAt: t0, externalId: "a1")

        try await applier.apply([.updateApple(externalId: "a1", fromSymphony: sym)])

        XCTAssertEqual(r.updated.count, 1)
        XCTAssertEqual(r.updated[0].externalId, "a1")
        XCTAssertEqual(r.updated[0].title, "olive oil")
        XCTAssertEqual(r.updated[0].completed, true)
    }

    func testUpdateSymphonyPassesAppleValues() async throws {
        let r = MockRemindersClient(); let s = MockSymphonyClient()
        let applier = Applier(reminders: r, symphony: s, userId: userId)
        let symId = UUID()
        let apple = AppleItem(externalId: "a1", title: "milk 2%", isCompleted: true, lastModified: t0)

        try await applier.apply([.updateSymphony(symphonyId: symId, fromApple: apple)])

        XCTAssertEqual(s.updated.count, 1)
        XCTAssertEqual(s.updated[0].id, symId)
        XCTAssertEqual(s.updated[0].text, "milk 2%")
        XCTAssertEqual(s.updated[0].completed, true)
    }

    func testInsertAppleCompensatesWhenSetExternalIdFails() async throws {
        let r = MockRemindersClient(); let s = FailingSetExternalIdSymphonyMock()
        r.nextInsertedId = "ghost-id"
        let applier = Applier(reminders: r, symphony: s, userId: userId)
        let sym = SymphonyItem(id: UUID(), listId: listId, text: "phantom", completed: false, updatedAt: t0, externalId: nil)

        do {
            try await applier.apply([.insertApple(symphony: sym, appleListName: "Groceries")])
            XCTFail("expected throw")
        } catch {
            // expected
        }

        XCTAssertEqual(r.inserted.count, 1)
        XCTAssertEqual(r.deleted, ["ghost-id"]) // compensating delete invoked
    }
}
