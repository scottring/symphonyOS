import XCTest
@testable import RemindersBridge

final class ConfigTests: XCTestCase {
    func testParsesValidConfig() throws {
        let json = """
        {
          "supabaseUrl": "https://xyz.supabase.co",
          "serviceRoleKey": "eyJ.test.key",
          "userId": "00000000-0000-0000-0000-000000000001",
          "lists": [
            { "appleListName": "Groceries", "symphonyListId": "11111111-1111-1111-1111-111111111111" },
            { "appleListName": "Need now",  "symphonyListId": "22222222-2222-2222-2222-222222222222" }
          ]
        }
        """.data(using: .utf8)!

        let config = try Config.decode(from: json)

        XCTAssertEqual(config.supabaseUrl.absoluteString, "https://xyz.supabase.co")
        XCTAssertEqual(config.serviceRoleKey, "eyJ.test.key")
        XCTAssertEqual(config.userId, UUID(uuidString: "00000000-0000-0000-0000-000000000001"))
        XCTAssertEqual(config.lists.count, 2)
        XCTAssertEqual(config.lists[0].appleListName, "Groceries")
    }

    func testRejectsMissingFields() {
        let json = """
        { "supabaseUrl": "https://xyz.supabase.co" }
        """.data(using: .utf8)!

        XCTAssertThrowsError(try Config.decode(from: json))
    }

    func testRejectsNonHTTPSUrl() {
        let json = """
        {
          "supabaseUrl": "http://insecure",
          "serviceRoleKey": "k",
          "userId": "00000000-0000-0000-0000-000000000001",
          "lists": []
        }
        """.data(using: .utf8)!

        XCTAssertThrowsError(try Config.decode(from: json)) { err in
            guard let e = err as? ConfigError else { return XCTFail("wrong error type") }
            XCTAssertEqual(e, ConfigError.insecureURL)
        }
    }
}
