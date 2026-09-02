import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

/// A button revealed when a `SlideRow` is swiped open to the right.
struct SlideAction: Identifiable {
    let id = UUID()
    let label: String
    let systemImage: String
    let tint: Color
    let action: () -> Void

    init(label: String, systemImage: String, tint: Color, action: @escaping () -> Void) {
        self.label = label
        self.systemImage = systemImage
        self.tint = tint
        self.action = action
    }
}

/// A row that slides horizontally, ported from the web app's `SwipeableCard`:
/// - **Swipe left** past the complete threshold → fires `onComplete`, with a green
///   completion zone that grows and deepens as you drag.
/// - **Swipe right** past the action threshold → snaps open to reveal `actions`
///   on the leading edge. Tapping the content (or an action) closes it.
///
/// The gesture locks to horizontal on the first move, so vertical scrolling in an
/// enclosing `ScrollView` is preserved. Thresholds/resistance mirror the web values;
/// the exact feel is meant to be tuned on-device.
struct SlideRow<Content: View>: View {
    private let onComplete: (() -> Void)?
    private let actions: [SlideAction]
    private let cornerRadius: CGFloat
    private let content: Content

    init(
        onComplete: (() -> Void)? = nil,
        actions: [SlideAction] = [],
        cornerRadius: CGFloat = 14,
        @ViewBuilder content: () -> Content
    ) {
        self.onComplete = onComplete
        self.actions = actions
        self.cornerRadius = cornerRadius
        self.content = content()
    }

    // Ported thresholds (points)
    private let completeThreshold: CGFloat = 80
    private let actionThreshold: CGFloat = 60
    private let resistance: CGFloat = 0.4
    private let buttonWidth: CGFloat = 64

    private var panelWidth: CGFloat { CGFloat(actions.count) * buttonWidth }

    // hsl(152 50% 32%) — same completion green as the web SwipeableCard
    private let completeGreen = Color.successGreen

    @State private var translateX: CGFloat = 0
    @State private var showActions = false
    @State private var axisHorizontal: Bool? = nil

    private var completeProgress: CGFloat {
        min(max(-translateX, 0) / completeThreshold, 1)
    }

    var body: some View {
        ZStack(alignment: .leading) {
            // Completion zone — right edge, revealed on left swipe.
            if translateX < 0, onComplete != nil {
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    ZStack(alignment: .trailing) {
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .fill(completeGreen.opacity(0.45 + 0.55 * completeProgress))
                        Image(systemName: "checkmark")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(.white)
                            .opacity(Double(completeProgress))
                            .scaleEffect(0.6 + 0.4 * completeProgress)
                            .padding(.trailing, 18)
                    }
                    .frame(width: max(-translateX, 0))
                }
            }

            // Action panel — leading edge, revealed on right swipe.
            if (translateX > 0 || showActions), !actions.isEmpty {
                HStack(spacing: 0) {
                    ForEach(actions) { action in
                        Button {
                            action.action()
                            close()
                        } label: {
                            VStack(spacing: 4) {
                                Image(systemName: action.systemImage)
                                    .font(.system(size: 18, weight: .medium))
                                Text(action.label)
                                    .font(.captionBold)
                            }
                            .foregroundStyle(.white)
                            .frame(width: buttonWidth)
                            .frame(maxHeight: .infinity)
                            .background(action.tint)
                        }
                        .buttonStyle(.plain)
                    }
                    Spacer(minLength: 0)
                }
                .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            }

            // Foreground content — carries its own background.
            // NOTE: no `.contentShape(Rectangle())` here. `.offset` shifts the
            // card's rendering right to reveal the action panel, but contentShape
            // would keep its hit area at the original full width — sitting on top
            // of the action buttons and swallowing their taps (the row would just
            // collapse instead of running the action). The card's own opaque
            // background is the hit area, which correctly follows the offset.
            content
                .offset(x: translateX)
                .simultaneousGesture(dragGesture)
                .onTapGestureCompat { if showActions { close() } }
        }
    }

    private var dragGesture: some Gesture {
        // A higher minimumDistance lets the enclosing ScrollView win ordinary
        // vertical pans first, so scrolling works anywhere on a row. The axis lock
        // then only claims clearly-horizontal drags for the swipe.
        DragGesture(minimumDistance: 24, coordinateSpace: .local)
            .onChanged { value in
                let w = value.translation.width
                let h = value.translation.height
                if axisHorizontal == nil {
                    axisHorizontal = abs(w) > abs(h) + 6
                }
                guard axisHorizontal == true else { return }

                var dx = w + (showActions ? panelWidth : 0)
                if dx < -completeThreshold {
                    dx = -completeThreshold + (dx + completeThreshold) * resistance
                } else if dx > panelWidth {
                    dx = panelWidth + (dx - panelWidth) * resistance
                }
                translateX = dx
            }
            .onEnded { value in
                defer { axisHorizontal = nil }
                guard axisHorizontal == true else { return }

                let dx = value.translation.width + (showActions ? panelWidth : 0)
                if dx < -completeThreshold, let onComplete {
                    haptic()
                    onComplete()
                    snap(to: 0, openActions: false)
                } else if dx > actionThreshold, !actions.isEmpty {
                    haptic()
                    snap(to: panelWidth, openActions: true)
                } else {
                    snap(to: 0, openActions: false)
                }
            }
    }

    private func snap(to x: CGFloat, openActions: Bool) {
        withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) {
            translateX = x
            showActions = openActions
        }
    }

    private func close() {
        snap(to: 0, openActions: false)
    }

    private func haptic() {
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        #endif
    }
}

private extension View {
    /// Tap handling that doesn't swallow the drag gesture.
    func onTapGestureCompat(_ action: @escaping () -> Void) -> some View {
        simultaneousGesture(TapGesture().onEnded(action))
    }
}
