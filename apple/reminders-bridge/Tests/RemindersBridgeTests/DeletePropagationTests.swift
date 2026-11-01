import XCTest
@testable import RemindersBridge

/// Deleting an item in Symphony reaches Reminders (2026-11-01). Before, the
/// next pass saw a reminder Symphony lacked and copied it straight back.
final class DeletePropagationTests: XCTestCase {
    let listId = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
    var mapping: ListMapping { ListMapping(appleListName: "Groceries", symphonyListId: listId) }
    let t0 = Date(timeIntervalSince1970: 1_700_000_000)

    private func apple(_ id: String, _ title: String = "x") -> AppleItem {
        AppleItem(externalId: id, title: title, isCompleted: false, lastModified: t0)
    }
    private func symphony(_ ext: String?, _ text: String = "x") -> SymphonyItem {
        SymphonyItem(id: UUID(), listId: listId, text: text, completed: false, updatedAt: t0, externalId: ext)
    }

    func testReminderSeenOnBothSidesBeforeIsDeletedFromReminders() {
        let ops = Reconciler.reconcile(apple: [apple("a1")], symphony: [], mapping: mapping, paired: ["a1"])
        XCTAssertEqual(ops, [.deleteApple(externalId: "a1")])
    }

    func testReminderNeverSeenInSymphonyIsStillCopiedIn() {
        let a = apple("a2", "milk")
        let ops = Reconciler.reconcile(apple: [a], symphony: [], mapping: mapping, paired: ["a1"])
        XCTAssertEqual(ops, [.insertSymphony(listId: listId, apple: a)])
    }

    func testPairsAreOnlyWhatWasSeenOnBothSides() {
        let s1 = symphony("a1"), s3 = symphony("a3")
        let ops: [SyncOp] = [.deleteSymphony(symphonyId: s3.id)]
        let paired = Reconciler.pairedAfter(apple: [apple("a1"), apple("a2")], symphony: [s1, s3, symphony(nil)], ops: ops)
        XCTAssertEqual(paired, ["a1"])
    }

    func testBridgeRemembersPairsThenPropagatesADelete() async throws {
        let r = MockRemindersClient()
        let s = MockSymphonyClient()
        let pairs = MemoryPairStore()
        r.fetchItemsResult = [apple("a1", "milk")]
        s.fetchItemsResult = [symphony("a1", "milk")]
        let bridge = Bridge(config: config(), reminders: r, symphony: s, pairs: pairs)

        try await bridge.runOnce()
        XCTAssertEqual(pairs.load(listId: listId), ["a1"])

        s.fetchItemsResult = [] // deleted in Symphony
        try await bridge.runOnce()
        XCTAssertEqual(r.deleted, ["a1"])
        XCTAssertTrue(s.inserted.isEmpty, "the delete must not be copied back")
        XCTAssertEqual(pairs.load(listId: listId), [])
    }

    func testBridgeHoldsAMassDeleteThatLooksLikeABadRead() async throws {
        let r = MockRemindersClient()
        let s = MockSymphonyClient()
        let pairs = MemoryPairStore()
        let ids = (1...10).map { "a\($0)" }
        pairs.save(listId: listId, paired: Set(ids))
        r.fetchItemsResult = ids.map { apple($0) }
        s.fetchItemsResult = [] // Symphony suddenly empty
        let bridge = Bridge(config: config(), reminders: r, symphony: s, pairs: pairs)

        try await bridge.runOnce()
        XCTAssertTrue(r.deleted.isEmpty)
        XCTAssertTrue(s.inserted.isEmpty)
        XCTAssertEqual(pairs.load(listId: listId), Set(ids), "still known, so a real delete can go through later")
    }

    func testFilePairStoreRoundTrips() throws {
        let path = NSTemporaryDirectory() + "paired-\(UUID().uuidString).json"
        FilePairStore(path: path).save(listId: listId, paired: ["a1", "a2"])
        XCTAssertEqual(FilePairStore(path: path).load(listId: listId), ["a1", "a2"])
        XCTAssertEqual(FilePairStore(path: path + ".missing").load(listId: listId), [])
    }

    private func config() -> Config {
        let json = """
        { "supabaseUrl": "https://x.supabase.co", "serviceRoleKey": "k",
          "userId": "00000000-0000-0000-0000-000000000001",
          "lists": [{ "appleListName": "Groceries", "symphonyListId": "\(listId.uuidString)" }] }
        """.data(using: .utf8)!
        return try! Config.decode(from: json)
    }
}
