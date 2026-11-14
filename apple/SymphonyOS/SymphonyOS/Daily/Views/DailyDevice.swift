#if os(iOS)
import UIKit

/// The one reading of the device the light gate takes (`DailyGate.shows`'s `phone`, ruling D17): the
/// light pages are built for the phone idiom only. The iPhone Duo is a phone: its simulator's device
/// type is product family "iPhone" (model iPhone19,4), and nothing in the app tells it apart by idiom
/// (its screens are told apart by their shapes, `TodayLayout`, and its fold and side bars, `DockLayout`,
/// `DuoPosture`). An iPad is not, whatever shape its window takes.
enum DailyDevice {
    @MainActor static var phone: Bool { UIDevice.current.userInterfaceIdiom == .phone }
}
#endif
