import XCTest
@testable import RemindersBridge

final class ReconcilerTests: XCTestCase {
    let listId = UUID(uuidString: "11111111-1111-1111-1111-111111111111")!
    let appleListName = "Groceries"
    var mapping: ListMapping {
        ListMapping(appleListName: appleListName, symphonyListId: listId)
    }

    let t0 = Date(timeIntervalSince1970: 1_700_000_000)
    var t1: Date { t0.addingTimeInterval(60) }

    // MARK: - Apple -> Symphony

    func testAppleOnlyItemInsertsIntoSymphony() {
        let apple = [AppleItem(externalId: "a1", title: "milk", isCompleted: false, lastModified: t0)]
        let symphony: [SymphonyItem] = []

        let ops = Reconciler.reconcile(apple: apple, symphony: symphony, mapping: mapping)

        XCTAssertEqual(ops, [.insertSymphony(listId: listId, apple: apple[0])])
    }

    func testAppleNewerThanSymphonyUpdatesSymphony() {
        let apple = [AppleItem(externalId: "a1", title: "milk 2%", isCompleted: false, lastModified: t1)]
        let s = SymphonyItem(id: UUID(), listId: listId, text: "milk", completed: false, updatedAt: t0, externalId: "a1")

        let ops = Reconciler.reconcile(apple: apple, symphony: [s], mapping: mapping)

        XCTAssertEqual(ops, [.updateSymphony(symphonyId: s.id, fromApple: apple[0])])
    }

    func testSymphonyNewerThanAppleUpdatesApple() {
        let apple = [AppleItem(externalId: "a1", title: "milk", isCompleted: false, lastModified: t0)]
        let s = SymphonyItem(id: UUID(), listId: listId, text: "milk 2%", completed: false, updatedAt: t1, externalId: "a1")

        let ops = Reconciler.reconcile(apple: apple, symphony: [s], mapping: mapping)

        XCTAssertEqual(ops, [.updateApple(externalId: "a1", fromSymphony: s)])
    }

    func testSameTimestampNoOp() {
        let apple = [AppleItem(externalId: "a1", title: "milk", isCompleted: false, lastModified: t0)]
        let s = SymphonyItem(id: UUID(), listId: listId, text: "milk", completed: false, updatedAt: t0, externalId: "a1")

        let ops = Reconciler.reconcile(apple: apple, symphony: [s], mapping: mapping)

        XCTAssertEqual(ops, [])
    }

    // MARK: - Symphony -> Apple (new items added on kiosk)

    func testSymphonyOnlyWithoutExternalIdInsertsToApple() {
        let s = SymphonyItem(id: UUID(), listId: listId, text: "olive oil", completed: false, updatedAt: t0, externalId: nil)

        let ops = Reconciler.reconcile(apple: [], symphony: [s], mapping: mapping)

        XCTAssertEqual(ops, [.insertApple(symphony: s, appleListName: appleListName)])
    }

    // MARK: - Deletes

    func testSymphonyHasExternalIdButAppleMissingDeletesSymphony() {
        let s = SymphonyItem(id: UUID(), listId: listId, text: "milk", completed: false, updatedAt: t0, externalId: "a1")

        let ops = Reconciler.reconcile(apple: [], symphony: [s], mapping: mapping)

        XCTAssertEqual(ops, [.deleteSymphony(symphonyId: s.id)])
    }

    // MARK: - Completion sync

    func testCompletionPropagatesViaUpdate() {
        // Apple completed, Symphony not, Apple newer -> updateSymphony carries isCompleted=true
        let apple = [AppleItem(externalId: "a1", title: "milk", isCompleted: true, lastModified: t1)]
        let s = SymphonyItem(id: UUID(), listId: listId, text: "milk", completed: false, updatedAt: t0, externalId: "a1")

        let ops = Reconciler.reconcile(apple: apple, symphony: [s], mapping: mapping)

        XCTAssertEqual(ops, [.updateSymphony(symphonyId: s.id, fromApple: apple[0])])
    }

    // MARK: - Mixed scenarios

    func testMixedSet() {
        let s1 = SymphonyItem(id: UUID(), listId: listId, text: "olives", completed: false, updatedAt: t0, externalId: nil) // -> insertApple
        let s2 = SymphonyItem(id: UUID(), listId: listId, text: "milk", completed: false, updatedAt: t0, externalId: "a1") // -> no-op
        let s3 = SymphonyItem(id: UUID(), listId: listId, text: "stale", completed: false, updatedAt: t0, externalId: "a-gone") // -> deleteSymphony

        let a1 = AppleItem(externalId: "a1", title: "milk", isCompleted: false, lastModified: t0)
        let a2 = AppleItem(externalId: "a-new", title: "bread", isCompleted: false, lastModified: t0) // -> insertSymphony

        let ops = Reconciler.reconcile(apple: [a1, a2], symphony: [s1, s2, s3], mapping: mapping)

        let expected: Set<SyncOp> = [
            .insertApple(symphony: s1, appleListName: appleListName),
            .deleteSymphony(symphonyId: s3.id),
            .insertSymphony(listId: listId, apple: a2),
        ]
        XCTAssertEqual(Set(ops), expected)
    }
}
