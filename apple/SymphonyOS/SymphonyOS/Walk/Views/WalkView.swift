#if os(iOS)
import SwiftUI

/// The walk, full screen: the 390 × 844 stage scaled to fit the device and
/// centred on the deep sky colour, over the safe areas (D21).
struct WalkView: View {
    let model: WalkModel

    init(model: WalkModel) {
        self.model = model
    }

    var body: some View {
        GeometryReader { geo in
            let stage = model.art.stage
            let scale = min(geo.size.width / stage.width, geo.size.height / stage.height)
            ZStack {
                WalkPalette.ground
                WalkSceneView(model: model)
                    .frame(width: stage.width, height: stage.height)
                    .scaleEffect(scale)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .ignoresSafeArea()
    }
}
#endif
