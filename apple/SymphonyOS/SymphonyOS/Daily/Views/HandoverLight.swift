#if os(iOS)
import SwiftUI

/// The walk's light on its way down to the bar: the bar's own light drawing (the walk's colours,
/// `DailyPalette.lightStops`), at the place and size `DailyHandover.light` gives for `progress`,
/// with no microphone. Decoration only: hidden from VoiceOver and taking no touches. `progress`
/// is animatable, so an animation to 1 carries it down the whole path.
struct HandoverLight: View, Animatable {
    var progress: Double
    let from: (centre: CGPoint, diameter: CGFloat)
    let to: (centre: CGPoint, diameter: CGFloat)

    nonisolated var animatableData: Double {
        get { progress }
        set { progress = newValue }
    }

    var body: some View {
        let light = DailyHandover.light(at: progress, from: from, to: to)
        DailyLight(diameter: light.diameter, listening: false, mic: false)
            .position(light.centre)
            .opacity(light.opacity)
            .allowsHitTesting(false)
            .accessibilityHidden(true)
    }
}
#endif
