#if os(iOS)
import UIKit

/// Ruling F26: a light household's phone-sized screens stay upright (`DailyGate.holdsUpright`), so a
/// phone on its side never shows the old screens in place of the light pages, nor the walk's stage
/// scaled into a strip. `Info.plist` still allows every orientation; the hold is decided at run time
/// and handed to the system by `AppDelegate.application(_:supportedInterfaceOrientationsFor:)`.
@MainActor
enum OrientationHold {
    /// What the app allows now: upright only while held, otherwise every orientation, as before.
    static private(set) var mask: UIInterfaceOrientationMask = .all

    /// Holds the screen upright (`upright`) or lets it turn again, and asks the system to read the
    /// mask again; held while the scene is already sideways, it is turned upright at once.
    static func apply(_ upright: Bool, scene: UIWindowScene?) {
        mask = upright ? .portrait : .all
        guard let scene else { return }
        scene.keyWindow?.rootViewController?.setNeedsUpdateOfSupportedInterfaceOrientations()
        if upright && scene.effectiveGeometry.interfaceOrientation != .portrait {
            scene.requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))
        }
    }
}
#endif
