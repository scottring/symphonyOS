#if os(iOS)
import SwiftUI
import UIKit

/// An invisible view that reports the hinge: its angle in radians and
/// whether it's partly open, now and on every change. Before iOS 27.1, and on
/// every phone without a hinge, it reports nothing (nil).
struct HingeReader: UIViewRepresentable {
    struct Reading: Equatable {
        var angle: Double
        var partlyOpen: Bool
    }

    let onChange: (Reading?) -> Void

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        if #available(iOS 27.1, *) {
            let coordinator = context.coordinator
            view.addInteraction(UIHingeInteraction { _, update in
                coordinator.report(update.hinge.map { Reading(angle: Double($0.angle), partlyOpen: $0.status == .partiallyOpen) })
            })
        }
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.onChange = onChange
    }

    func makeCoordinator() -> Coordinator { Coordinator(onChange: onChange) }

    final class Coordinator {
        var onChange: (Reading?) -> Void
        private var last: Reading??
        init(onChange: @escaping (Reading?) -> Void) { self.onChange = onChange }

        func report(_ reading: Reading?) {
            guard last != .some(reading) else { return }
            last = .some(reading)
            let onChange = onChange
            // Report after this pass; SwiftUI state can't change mid-update.
            DispatchQueue.main.async { onChange(reading) }
        }
    }
}
#endif
