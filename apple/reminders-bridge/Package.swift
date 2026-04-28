// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "RemindersBridge",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .library(name: "RemindersBridge", targets: ["RemindersBridge"]),
        .executable(name: "reminders-bridge", targets: ["reminders-bridge"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0"),
    ],
    targets: [
        .target(
            name: "RemindersBridge",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift"),
            ]
        ),
        .executableTarget(
            name: "reminders-bridge",
            dependencies: ["RemindersBridge"],
            exclude: ["Info.plist"],
            linkerSettings: [
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", "Sources/reminders-bridge/Info.plist",
                ])
            ]
        ),
        .testTarget(
            name: "RemindersBridgeTests",
            dependencies: ["RemindersBridge"]
        ),
    ]
)
