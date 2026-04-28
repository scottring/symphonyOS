import XCTest
@testable import RemindersBridge

// MARK: - Test choice
//
// Mocks are extracted to `Mocks.swift` (option (a) from the review). The
// existing ApplierTests mocks were small and the new tests need a thrown
// error path on `fetchItems`, so the cleanest move is to centralize them
// once and add `fetchItemsError` hooks shared across both test files.

final class BridgeTests: XCTestCase {
    private func makeConfig(lists: [ListMapping]) -> Config {
        // Config has no public memberwise initializer, so build via decode.
        let listsJSON = lists.map {
            "{ \"appleListName\": \"\($0.appleListName)\", \"symphonyListId\": \"\($0.symphonyListId.uuidString)\" }"
        }.joined(separator: ",")
        let json = """
        {
          "supabaseUrl": "https://x.supabase.co",
          "serviceRoleKey": "k",
          "userId": "00000000-0000-0000-0000-000000000001",
          "lists": [\(listsJSON)]
        }
        """.data(using: .utf8)!
        return try! Config.decode(from: json)
    }

    func testEmptyMappingsCompletesWithoutThrow() async throws {
        let r = MockRemindersClient()
        let s = MockSymphonyClient()
        let bridge = Bridge(config: makeConfig(lists: []), reminders: r, symphony: s)

        try await bridge.runOnce()
        // No throw expected; nothing further to assert.
    }

    func testSingleSuccessfulMappingCompletesWithoutThrow() async throws {
        let r = MockRemindersClient()
        let s = MockSymphonyClient()
        let mapping = ListMapping(appleListName: "Groceries", symphonyListId: UUID())
        let bridge = Bridge(config: makeConfig(lists: [mapping]), reminders: r, symphony: s)

        try await bridge.runOnce()
        // Both mocks return empty arrays by default; reconciler emits no ops.
    }

    func testOneFailingMappingThrowsAllMappingsFailed() async throws {
        let r = MockRemindersClient()
        let s = MockSymphonyClient()
        s.fetchItemsError = NSError(domain: "test", code: 42)

        let mapping = ListMapping(appleListName: "Groceries", symphonyListId: UUID())
        let bridge = Bridge(config: makeConfig(lists: [mapping]), reminders: r, symphony: s)

        do {
            try await bridge.runOnce()
            XCTFail("expected throw")
        } catch BridgeError.allMappingsFailed(let count) {
            XCTAssertEqual(count, 1)
        } catch {
            XCTFail("wrong error: \(error)")
        }
    }

    func testPartialFailureDoesNotThrow() async throws {
        // Two mappings. Symphony fetchItems errors on the first call only.
        // Bridge should log the first error and complete the second list.
        final class FailFirstSymphonyMock: MockSymphonyClient {
            var callCount = 0
            override func fetchItems(listId: UUID) async throws -> [SymphonyItem] {
                callCount += 1
                if callCount == 1 {
                    throw NSError(domain: "test", code: 1)
                }
                return []
            }
        }

        let r = MockRemindersClient()
        let s = FailFirstSymphonyMock()
        let mappingA = ListMapping(appleListName: "Groceries", symphonyListId: UUID())
        let mappingB = ListMapping(appleListName: "Need now", symphonyListId: UUID())
        let bridge = Bridge(config: makeConfig(lists: [mappingA, mappingB]), reminders: r, symphony: s)

        try await bridge.runOnce()
        XCTAssertEqual(s.callCount, 2, "second mapping should still run after first fails")
    }
}
