#if os(iOS)
import Testing
import SwiftUI
import UIKit
@testable import Symphony

/// Draws every widget face at about its iPhone Duo size, so a face that
/// fails to lay out is caught here. Set `WIDGET_GALLERY_DIR` (as
/// `TEST_RUNNER_WIDGET_GALLERY_DIR` to xcodebuild) to keep the pictures.
@MainActor
struct WidgetFacesTests {
    static let small = CGSize(width: 170, height: 170)
    static let medium = CGSize(width: 364, height: 170)
    static let large = CGSize(width: 364, height: 382)
    static let page = CGSize(width: 364, height: 594)

    func at(_ h: Int, _ m: Int = 0) -> Date {
        Calendar.current.date(from: DateComponents(year: 2026, month: 11, day: 14, hour: h, minute: m))!
    }

    func draw<V: View>(_ name: String, _ size: CGSize, _ face: V) throws {
        let framed = face
            .padding(16)
            .frame(width: size.width, height: size.height)
            .background(WidgetPalette.paper)
            .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        let renderer = ImageRenderer(content: framed)
        renderer.scale = 3
        let image = try #require(renderer.uiImage)
        #expect(image.size == size)
        if let dir = ProcessInfo.processInfo.environment["WIDGET_GALLERY_DIR"], let png = image.pngData() {
            try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            try png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(name).png"))
        }
    }

    @Test func everyFaceDrawsThroughTheDay() throws {
        let sample = WidgetSnapshot.sample(now: at(8))
        let moments: [(String, WidgetMoment)] = [
            ("morning", .make(sample, now: at(8, 20))),
            ("soon", .make(sample, now: at(14, 5))),
            ("now", .make(sample, now: at(14, 40))),
            ("evening", .make(sample, now: at(21))),
            ("unopened", .make(nil, now: at(8))),
        ]
        for (name, m) in moments {
            try draw("nextup-small-\(name)", Self.small, NextUpSmall(moment: m))
            try draw("nextup-medium-\(name)", Self.medium, NextUpMedium(moment: m))
            try draw("todo-small-\(name)", Self.small, ToDoSmall(moment: m))
            try draw("todo-medium-\(name)", Self.medium, ToDoMedium(moment: m))
            try draw("today-medium-\(name)", Self.medium, TodayMedium(moment: m))
            try draw("today-large-\(name)", Self.large, TodayPage(moment: m))
            try draw("today-page-\(name)", Self.page, TodayPage(moment: m, tall: true))
        }
    }
}
#endif
