#if os(iOS)
import SwiftUI

/// The walk's scene on the 390 × 844 stage: the mountain (`WalkWorldView`),
/// the veil while the compass is open, and the words. It draws what the model's
/// layout returns and sends taps to the model; it decides nothing about the walk.
struct WalkSceneView: View {
    let model: WalkModel

    /// The camera's glide and the Reduce Motion cross-fade, kept here for the walk's other views.
    static let glide = WalkWorldView.glide
    static let crossFade = WalkWorldView.crossFade

    var body: some View {
        let art = model.art
        ZStack(alignment: .topLeading) {
            WalkWorldView(layout: model.layout, art: art,
                          onLabel: { model.send(.areaTapped($0.id)) },
                          onBanner: { banner, post in
                              if let event = WalkLayout.tapEvent(banner, on: post) { model.send(event) }
                          })
            // The open compass (and Welcome's choices): the mountain steps right back under a navy veil (80%),
            // so every point reads on an even dark ground; the words above stay bright. A tap on
            // it closes the compass (on Welcome the choices stay); flags and peaks take no tap.
            if model.state.showsVeil {
                WalkPalette.ground.opacity(0.8)
                    .frame(width: art.stage.width, height: art.stage.height)
                    .contentShape(Rectangle())
                    .onTapGesture { model.send(.veilTapped) }
                    .accessibilityHidden(true)
                    .transition(.opacity.animation(.easeOut(duration: 0.2)))
            }
            words
                .accessibilitySortPriority(1)       // read before the peaks and flags
        }
        .frame(width: art.stage.width, height: art.stage.height)
        .clipped()
        .accessibilityElement(children: .contain)
    }

    // MARK: The words

    @ViewBuilder private var words: some View {
        let s = model.state
        let p = model.periods
        let eyebrow = WalkCopy.eyebrow(s, p), question = WalkCopy.question(s, p), why = WalkCopy.why(s, p)
        if s.step == 0 {
            VStack(spacing: 16) {
                Text(eyebrow)
                    .font(.custom("CrimsonPro-Regular", size: 22))
                    .tracking(0.88)
                    .foregroundStyle(WalkPalette.gold)
                Text(question)
                    .font(.custom("CrimsonPro-Regular", size: 42))
                    .foregroundStyle(.white)
                    .walkGlow()
                Text(why)
                    .font(.custom("DMSans-Regular", size: 17))
                    .lineSpacing(3)
                    .foregroundStyle(.white)
                    .walkGlow()
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 32)
            .frame(maxWidth: .infinity)
            .modifier(WalkEntrance())
            .padding(.top, 140)
            .allowsHitTesting(false)
        } else if !question.isEmpty {
            VStack(spacing: 8) {
                Text(eyebrow.uppercased())
                    .font(.custom("DMSans-SemiBold", size: 12))
                    .tracking(1.2)
                    .foregroundStyle(.white)
                    .walkGlow()
                    .modifier(WalkEntrance())
                    .id(eyebrow)
                Text(question)
                    .font(.custom("CrimsonPro-Regular", size: 32))
                    .foregroundStyle(.white)
                    .walkGlow()
                Text(why)
                    .font(.custom("DMSans-Regular", size: 15))
                    .lineSpacing(1.5)
                    .foregroundStyle(.white)
                    .walkGlow()
                    .modifier(WalkEntrance())
                    .id(why)
            }
            .multilineTextAlignment(.center)
            .padding(.horizontal, 28)
            .frame(maxWidth: .infinity)
            .padding(.top, 64)
            .allowsHitTesting(false)
        }
    }
}

/// The mountain on the 390 × 844 stage, back to front: the stage's sky, the
/// world (sky, the painting, the peak labels and the posts with their banners)
/// and the dark band at the top. No words. It draws the layout it is given and
/// hands taps to its callbacks, so a page can draw it without the walk's model.
/// It makes no accessibility container of its own: whoever draws it does
/// (`WalkSceneView` does), so its peaks and flags sit beside that page's words.
///
/// The layout's frames are in stage space for the current camera. They are
/// put back into world space and drawn inside the same transformed container
/// as the painting, so during a camera glide a flag moves with the mountain
/// it stands on (stage = (world − camera) × k at every moment of the glide).
struct WalkWorldView: View {
    let layout: WalkLayout
    let art: WalkArt
    /// Whether banners that arrive after the world first draws drop in; those present at first stand still.
    let dropsIn: Bool
    /// VoiceOver's custom actions on a banner (none by default).
    let actions: (WalkLayout.Banner) -> [(name: String, run: () -> Void)]
    let onLabel: (WalkLayout.Label) -> Void
    let onBanner: (WalkLayout.Banner, WalkLayout.Post) -> Void
    /// Banners present when the world first draws stand still; later ones drop in.
    @State private var arrived = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let glide = Animation.timingCurve(0.45, 0.05, 0.2, 1, duration: 1.4)
    /// With Reduce Motion the camera does not glide: the whole view cross-fades to its new framing.
    static let crossFade = Animation.easeInOut(duration: 0.25)

    init(layout: WalkLayout, art: WalkArt, dropsIn: Bool = true,
         actions: @escaping (WalkLayout.Banner) -> [(name: String, run: () -> Void)] = { _ in [] },
         onLabel: @escaping (WalkLayout.Label) -> Void,
         onBanner: @escaping (WalkLayout.Banner, WalkLayout.Post) -> Void) {
        self.layout = layout
        self.art = art
        self.dropsIn = dropsIn
        self.actions = actions
        self.onLabel = onLabel
        self.onBanner = onBanner
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(stops: [.init(color: Color(hex: 0x00106E), location: 0),
                                   .init(color: Color(hex: 0x0A2A7A), location: 0.6),
                                   .init(color: Color(hex: 0x142430), location: 1)],
                           startPoint: .top, endPoint: .bottom)
            Group {
                if reduceMotion {
                    // A new framing is a new view, faded in over the old one.
                    world
                        .id([layout.camera.x, layout.camera.y, layout.camera.k])
                        .transition(.opacity)
                } else {
                    world
                }
            }
            .frame(width: art.stage.width, height: art.stage.height, alignment: .topLeading)
            .animation(reduceMotion ? Self.crossFade : nil, value: layout.camera)
            band
        }
        .frame(width: art.stage.width, height: art.stage.height)
        .clipped()
        .onAppear { arrived = true }
    }

    // MARK: The world

    private var world: some View {
        let camera = layout.camera
        return ZStack(alignment: .topLeading) {
            // The sky's top colour continues above the world, so its top edge
            // (on stage at y 328 on Welcome) shows no seam against the stage's sky.
            Color(hex: 0x00106E)
                .frame(width: art.world.width, height: art.world.height)
                .offset(y: -art.world.height)
            LinearGradient(stops: [.init(color: Color(hex: 0x00106E), location: 0),
                                   .init(color: Color(hex: 0x011C8C), location: 424 / art.world.height),
                                   .init(color: Color(hex: 0x0A2A9A), location: 1)],
                           startPoint: .top, endPoint: .bottom)
                .frame(width: art.world.width, height: art.world.height)
            Image(art.imageName)
                .resizable()
                .interpolation(.high)
                .antialiased(true)
                .frame(width: art.image.width, height: art.image.height)
                .offset(x: art.image.minX, y: art.image.minY)
                .accessibilityHidden(true)

            ForEach(layout.labels) { label in
                Button { onLabel(label) } label: { WalkLabelView(label: label) }
                    .buttonStyle(.plain)
                    .allowsHitTesting(label.tappable)
                    .accessibilityLabel(label.name)
                    .walkAccessibilityHint(label.hint)
                    .walkReadOnly(!label.tappable)
                    .accessibilityAddTraits(label.selected ? .isSelected : [])
                    .walkPlaced(label.frame, camera)
            }

            ForEach(layout.posts) { post in
                // The pole leans about its foot as the layout says; its banners' frames already lean with it.
                WalkPoleView(height: max(0, post.base.y - post.top), pale: post.pale)
                    .saturation(post.saturation)
                    .opacity(post.opacity)
                    .rotationEffect(.degrees(post.lean), anchor: .bottom)
                    .accessibilityHidden(true)
                    .walkPlaced(CGRect(x: post.base.x - 9, y: post.top, width: 18, height: max(0, post.base.y - post.top)),
                                camera)
                ForEach(post.banners) { banner in
                    Button { onBanner(banner, post) } label: {
                        WalkBannerView(banner: banner, poleX: banner.pivot.x, dropsIn: dropsIn && arrived)
                    }
                        .buttonStyle(.plain)
                        .saturation(post.saturation)
                        .opacity(post.opacity)
                        .accessibilityLabel(banner.label)
                        .walkReadOnly(!banner.taps)
                        .walkActions(actions(banner))
                        .walkPlaced(banner.frame, camera)
                }
            }
        }
        .frame(width: art.world.width, height: art.world.height, alignment: .topLeading)
        .scaleEffect(camera.k, anchor: .topLeading)
        .offset(x: -camera.x * camera.k, y: -camera.y * camera.k)
        .animation(reduceMotion ? nil : Self.glide, value: camera)
    }

    // MARK: The band

    /// A faint dark band at the top, so white words read over a pale sky (contract §14).
    private var band: some View {
        LinearGradient(stops: [.init(color: WalkPalette.navyBand.opacity(0.55), location: 0),
                               .init(color: WalkPalette.navyBand.opacity(0.25), location: 0.6),
                               .init(color: WalkPalette.navyBand.opacity(0), location: 1)],
                       startPoint: .top, endPoint: .bottom)
            .frame(height: 260)
            .allowsHitTesting(false)
    }
}

/// The words arrive: they fade in and rise 8 points, after a moment (`.wk-q`).
/// With Reduce Motion they only fade in.
struct WalkEntrance: ViewModifier {
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 8)
            .onAppear { withAnimation(.easeOut(duration: 0.7).delay(0.5)) { shown = true } }
    }
}

extension View {
    /// A hint for VoiceOver only when there is one: an empty hint is no hint.
    @ViewBuilder func walkAccessibilityHint(_ hint: String?) -> some View {
        if let hint, !hint.isEmpty {
            accessibilityHint(hint)
        } else {
            self
        }
    }

    /// A control that does nothing on a tap here is read as text, not offered as a button.
    func walkReadOnly(_ readOnly: Bool) -> some View {
        accessibilityRemoveTraits(readOnly ? .isButton : [])
            .accessibilityAddTraits(readOnly ? .isStaticText : [])
    }
}

private extension View {
    /// Puts a view laid out at a stage frame's size into world space, under the
    /// camera: it is drawn at `1 / k` inside the world, which the camera scales by `k`.
    func walkPlaced(_ frame: CGRect, _ camera: WalkLayout.Camera) -> some View {
        self.frame(width: frame.width, height: frame.height, alignment: .topLeading)
            .scaleEffect(1 / camera.k, anchor: .topLeading)
            .offset(x: frame.minX / camera.k + camera.x, y: frame.minY / camera.k + camera.y)
    }

    /// VoiceOver's custom actions, only when there are some: none leaves the view as it was.
    @ViewBuilder func walkActions(_ actions: [(name: String, run: () -> Void)]) -> some View {
        if actions.isEmpty {
            self
        } else {
            accessibilityActions {
                ForEach(actions.indices, id: \.self) { i in
                    Button(actions[i].name, action: actions[i].run)
                }
            }
        }
    }
}
#endif
