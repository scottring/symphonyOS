#if os(iOS)
import SwiftUI
import UIKit

/// Where the dock sits. On iPhone Duo the system puts its own bars in a side
/// column on the outside screen and on the inside screen held sideways, and
/// back along the bottom when the inside screen is upright. Our dock is
/// custom, so it follows the system's `verticalBarEdge` trait itself.
enum DockEdge: Equatable {
    case bottom, leading, trailing

    @available(iOS 27.1, *)
    init(_ edge: UIVerticalBarEdge) {
        switch edge {
        case .leading: self = .leading
        case .trailing: self = .trailing
        default: self = .bottom
        }
    }
}

/// The side dock's place in the window, as the system lays out a bar of the
/// dock's width on that edge: below the status bar and clear of the camera,
/// which on iPhone Duo means inside the status-bar column.
struct DockLayout: Equatable {
    var edge: DockEdge = .bottom
    /// The dock's frame in window coordinates (side edges only).
    var frame: CGRect = .zero
    /// How far the content stays in from the dock's window edge: the dock's
    /// inner side, never less than the safe area.
    var contentInset: CGFloat = 0
    /// The window's own safe-area inset on the dock's edge.
    var safeInset: CGFloat = 0
    /// The fold, in window coordinates, when the screen has one (iPhone Duo's
    /// inside screen): two-column layouts split along it.
    var fold: CGRect?

    static let sideWidth: CGFloat = 72

    /// The bar region's insets → the dock's frame and the content inset.
    /// `onLeft` is the physical side (leading flips in right-to-left).
    static func side(_ edge: DockEdge, onLeft: Bool, window: CGSize, barInsets: UIEdgeInsets, safeInset: CGFloat) -> DockLayout {
        let frame = CGRect(x: barInsets.left, y: barInsets.top,
                           width: max(0, window.width - barInsets.left - barInsets.right),
                           height: max(0, window.height - barInsets.top - barInsets.bottom))
        let fromEdge = onLeft ? frame.maxX : window.width - frame.minX
        return DockLayout(edge: edge, frame: frame, contentInset: max(fromEdge, safeInset), safeInset: safeInset)
    }
}

/// An invisible view that reports the dock layout now and whenever it
/// changes (folding, unfolding, turning the phone). Before iOS 27.1, and on
/// every phone without vertical bars, it reports the bottom dock.
struct DockLayoutReader: UIViewRepresentable {
    let onChange: (DockLayout) -> Void

    func makeUIView(context: Context) -> ReaderView {
        let view = ReaderView()
        view.onChange = onChange
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: ReaderView, context: Context) {
        view.onChange = onChange
    }

    final class ReaderView: UIView {
        var onChange: ((DockLayout) -> Void)?
        private var last: DockLayout?

        override init(frame: CGRect) {
            super.init(frame: frame)
            if #available(iOS 27.1, *) {
                registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) { (view: ReaderView, _) in
                    view.setNeedsLayout()
                }
            }
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            report()
        }

        // A fold or turn resizes the window, and the reader with it.
        override func layoutSubviews() {
            super.layoutSubviews()
            report()
        }

        private func report() {
            guard let window else { return }
            var layout = DockLayout()
            if #available(iOS 27.1, *) {
                let edge = DockEdge(traitCollection.verticalBarEdge)
                if edge != .bottom {
                    let isRTL = window.effectiveUserInterfaceLayoutDirection == .rightToLeft
                    let onLeft = (edge == .leading) != isRTL
                    let insets = window.edgeInsets(for: .bar(onEdge: onLeft ? UIRectEdge.left : UIRectEdge.right,
                                                             extent: DockLayout.sideWidth))
                    let safe = onLeft ? window.safeAreaInsets.left : window.safeAreaInsets.right
                    layout = .side(edge, onLeft: onLeft, window: window.bounds.size, barInsets: insets, safeInset: safe)
                }
                layout.fold = window.reservedRegions(kind: .division, options: .includeInactive).first?.frame
            }
            guard layout != last else { return }
            last = layout
            let onChange = onChange
            // Report after this layout pass; SwiftUI state can't change mid-layout.
            DispatchQueue.main.async { onChange?(layout) }
        }
    }
}
#endif
