import Foundation

public enum ConfigError: Error, Equatable {
    case insecureURL
    case fileNotFound(String)
}

public struct ListMapping: Codable, Equatable {
    public let appleListName: String
    public let symphonyListId: UUID

    public init(appleListName: String, symphonyListId: UUID) {
        self.appleListName = appleListName
        self.symphonyListId = symphonyListId
    }
}

public struct Config: Codable, Equatable {
    public let supabaseUrl: URL
    public let serviceRoleKey: String
    public let userId: UUID
    public let lists: [ListMapping]

    public static func decode(from data: Data) throws -> Config {
        let decoder = JSONDecoder()
        let config = try decoder.decode(Config.self, from: data)
        guard config.supabaseUrl.scheme == "https" else {
            throw ConfigError.insecureURL
        }
        return config
    }

    public static func load(fromPath path: String) throws -> Config {
        let url = URL(fileURLWithPath: (path as NSString).expandingTildeInPath)
        guard FileManager.default.fileExists(atPath: url.path) else {
            throw ConfigError.fileNotFound(url.path)
        }
        let data = try Data(contentsOf: url)
        return try decode(from: data)
    }
}
