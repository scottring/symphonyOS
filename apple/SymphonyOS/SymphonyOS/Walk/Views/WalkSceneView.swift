#if os(iOS)
import SwiftUI

/// The walk's scene on the 390 × 844 board: the mountain (`WalkWorldView`),
/// the veil while the compass is open, and the words. It draws what the model's
/// layout returns and sends taps to the model; it decides nothing about the walk.
/// The mountain's picture and the veil run past the board over its bleed, to the
/// window's edges; nothing here is clipped at the board (the window clips: `WalkView`).
struct WalkSceneView: View {
    let model: WalkModel
    @Environment(\.walkStage) private var stage

    /// The camera's glide and the Reduce Motion cross-fade, kept here for the walk's other views.
    static let glide = WalkWorldView.glide
    static let crossFade = WalkWorldView.crossFade

    var body: some View {
        let art = model.art
        ZStack(alignment: .topLeading) {
            WalkWorldView(layout: model.layout(wing: stage.wing), art: art, step: model.state.step, stage: stage,
                          veilsWords: model.state.veilsWords,
                          onLabel: { model.send(.areaTapped($0.id)) },
                          onBanner: { banner, post in
                              if let event = WalkLayout.tapEvent(banner, on: post) { model.send(event) }
                          },
                          onSide: { side in
                              if let event = WalkLayout.tapEvent(side) { model.send(event) }
                          })
            // The open compass (and Welcome's choices): the mountain steps right back under a navy veil (80%),
            // so every point reads on an even dark ground; the words above stay bright. A tap on
            // it closes the compass (on Welcome the choices stay); flags and peaks take no tap.
            if model.state.showsVeil {
                // Over the whole window, and it takes its tap there too.
                WalkPalette.ground.opacity(0.8)
                    .frame(width: stage.window.width, height: stage.window.height)
                    .contentShape(Rectangle())
                    .onTapGesture { model.send(.veilTapped) }
                    .accessibilityHidden(true)
                    .walkOverTheWindow(stage)
                    .transition(.opacity.animation(.easeOut(duration: 0.2)))
            }
            // VoiceOver reads the step's words first: above the standing pill (3), its cloths (2) and the
            // side posts (1), which are this container's children too.
            words
                .accessibilitySortPriority(4)
        }
        .frame(width: art.stage.width, height: art.stage.height)
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
            // Under the top row, as wide as the board's words (wider on a wider window), centred on x 195,
            // set as `WalkLayout.words` says (F30): a long question one size smaller, its why line only
            // where the block still ends above the flags, and at the last its quote cut at a word.
            // Its faces are fixed in size (as the cloths' are): the block's estimate assumes one size.
            let set = WalkLayout.words(s, p, wing: stage.wing)
            VStack(spacing: WalkLayout.blockGap) {
                eyebrowLine(eyebrow, count: WalkCopy.eyebrowCount(s))
                    .font(.custom("DMSans-SemiBold", fixedSize: 12))
                    .tracking(1.2)
                    .walkGlow()
                    .accessibilityIdentifier("walk.eyebrow")
                    .modifier(WalkEntrance())
                    .id(eyebrow)
                // The lines the layout broke the question into (F39), each as given, centred, on the
                // line height the block's height assumes; VoiceOver reads the question whole.
                VStack(spacing: 0) {
                    ForEach(Array(set.questionLines.enumerated()), id: \.offset) { _, line in
                        Text(line)
                            .font(.custom("CrimsonPro-Regular", fixedSize: set.questionSize))
                            .lineLimit(1)
                            .fixedSize(horizontal: true, vertical: false)
                            .frame(height: set.questionSize * WalkLayout.questionLineRatio)
                    }
                }
                .foregroundStyle(.white)
                .walkGlow()
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(set.question)
                .accessibilityAddTraits(.isStaticText)
                .accessibilityIdentifier("walk.question")
                if set.showsWhy {
                    Text(why)
                        .font(.custom("DMSans-Regular", fixedSize: 15))
                        .lineSpacing(WalkLayout.whySpacing)
                        .foregroundStyle(.white)
                        .walkGlow()
                        .modifier(WalkEntrance())
                        .id(why)
                }
            }
            .multilineTextAlignment(.center)
            .frame(width: WalkLayout.wordsWidth(wing: stage.wing))
            // Centred on the board, taking only the board's width: a block wider than the board runs past
            // both its edges and moves nothing else in the scene.
            .frame(width: WalkArt.stageSize.width)
            .padding(.top, WalkLayout.wordsTop)
            .allowsHitTesting(false)
        }
    }

    /// The eyebrow in capitals; on the whole-year walk's Year step the count follows it in gold
    /// (" · 1 OF 3", F1).
    private func eyebrowLine(_ eyebrow: String, count: String?) -> Text {
        let head = Text(eyebrow.uppercased()).foregroundStyle(.white)
        guard let count else { return head }
        return head + Text(WalkCopy.afterEyebrow(count).uppercased()).foregroundStyle(WalkPalette.gold)
    }
}

/// The mountain on the 390 × 844 board, back to front: the stage's sky, the
/// painting (the art's backdrop, by its own camera for the step), the dark band at its top, the world (the
/// peak labels and the posts with their banners), over the band so it dims none of them. No words. It draws the layout it is given and
/// hands taps to its callbacks, so a page can draw it without the walk's model.
/// The sky, the painting and the band cover the board plus its bleed (`WalkStage.window`: the
/// whole window it stands on); it clips nothing, so whoever draws it clips at the window.
/// It makes no accessibility container of its own: whoever draws it does
/// (`WalkSceneView` does), so its peaks and flags sit beside that page's words.
///
/// The layout's frames are in stage space for the current camera. They are
/// put back into world space and drawn inside one transformed container, so
/// during a camera glide the flags move together (stage = (world − camera) × k
/// at every moment of the glide); the painting glides to its own camera on the
/// same curve and duration.
struct WalkWorldView: View {
    let layout: WalkLayout
    let art: WalkArt
    /// The walk's step: which of the picture's stops (`WalkArt.backdropCamera`) stands behind the layout.
    let step: Int
    /// The window the board stands on: how far the sky, the painting and the band run past the board.
    let stage: WalkStage
    /// Whether banners that arrive after the world first draws drop in; those present at first stand still.
    let dropsIn: Bool
    /// F22: the words on the mountain are not drawn and not read (the cloths, poles and pills stay under
    /// the veil) while the choices are open, the light is taught, or something is typed.
    let veilsWords: Bool
    /// VoiceOver's custom actions on a banner (none by default).
    let actions: (WalkLayout.Banner) -> [(name: String, run: () -> Void)]
    let onLabel: (WalkLayout.Label) -> Void
    let onBanner: (WalkLayout.Banner, WalkLayout.Post) -> Void
    /// A tap on a side post (the walk sends `WalkLayout.tapEvent(side)`: a named one walks there).
    let onSide: (WalkLayout.Side) -> Void
    /// Banners present when the world first draws stand still; later ones drop in.
    @State private var arrived = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static let glide = Animation.timingCurve(0.45, 0.05, 0.2, 1, duration: 1.4)
    /// With Reduce Motion the camera does not glide: the whole view cross-fades to its new framing.
    static let crossFade = Animation.easeInOut(duration: 0.25)

    init(layout: WalkLayout, art: WalkArt, step: Int, stage: WalkStage, dropsIn: Bool = true, veilsWords: Bool = false,
         actions: @escaping (WalkLayout.Banner) -> [(name: String, run: () -> Void)] = { _ in [] },
         onLabel: @escaping (WalkLayout.Label) -> Void,
         onBanner: @escaping (WalkLayout.Banner, WalkLayout.Post) -> Void,
         onSide: @escaping (WalkLayout.Side) -> Void) {
        self.layout = layout
        self.art = art
        self.step = step
        self.stage = stage
        self.dropsIn = dropsIn
        self.veilsWords = veilsWords
        self.actions = actions
        self.onLabel = onLabel
        self.onBanner = onBanner
        self.onSide = onSide
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            LinearGradient(stops: [.init(color: Color(hex: 0x00106E), location: 0),
                                   .init(color: Color(hex: 0x0A2A7A), location: 0.6),
                                   .init(color: Color(hex: 0x142430), location: 1)],
                           startPoint: .top, endPoint: .bottom)
                .frame(width: stage.window.width, height: stage.window.height)
                .walkOverTheWindow(stage)
            Group {
                if reduceMotion {
                    // A new framing is a new view, faded in over the old one.
                    scene
                        .id([layout.camera.x, layout.camera.y, layout.camera.k])
                        .transition(.opacity)
                } else {
                    scene
                }
            }
            .frame(width: art.stage.width, height: art.stage.height, alignment: .topLeading)
            .animation(reduceMotion ? Self.crossFade : nil, value: layout.camera)
        }
        .frame(width: art.stage.width, height: art.stage.height)
        .onAppear { arrived = true }
    }

    // MARK: The world

    /// The picture behind, the top shade over it, then the world of labels and flags over both: the
    /// shade darkens the painting behind the words and never dims a flag or a label.
    private var scene: some View {
        ZStack(alignment: .topLeading) {
            picture
            // From the window's top edge (the band's top strength held over the bleed above the board), side to side.
            VStack(spacing: 0) {
                WalkPalette.navyBand.opacity(bandTop)
                    .frame(height: stage.bleed.top)
                band
            }
            .frame(width: stage.window.width)
            .offset(x: stage.window.minX, y: stage.window.minY)
            .frame(width: art.stage.width, alignment: .leading)
            .allowsHitTesting(false)
            world
        }
    }

    /// The backdrop (`WalkBackdrop`): the tall painting by its own camera for this step and window.
    /// It glides with the layout's camera from one step to the next (never inside a step: a tap on a
    /// side post moves no camera), not when the window changes (a turn, a fold): there it stands at
    /// once where the new window puts it.
    @ViewBuilder private var picture: some View {
        if let backdrop = art.backdrop, let camera = art.backdropCamera(step: step, stage: stage) {
            Image(backdrop.imageName)
                .resizable()
                .interpolation(.high)
                .antialiased(true)
                .frame(width: backdrop.size.width, height: backdrop.size.height)
                .scaleEffect(camera.k, anchor: .topLeading)
                .offset(x: -camera.x * camera.k, y: -camera.y * camera.k)
                .animation(reduceMotion ? nil : Self.glide, value: [CGFloat(step), camera.x, camera.y, camera.k])
                .frame(width: art.stage.width, height: art.stage.height, alignment: .topLeading)
                .accessibilityHidden(true)
        }
    }

    /// Drawn: the side posts first, then the standing post (its pole, then its cloths), then the area's
    /// pill and its caret over the pole's top, so a cloth is never under a side post's touch shape.
    /// Read by VoiceOver: the standing pill ("you are here"), its cloths, then the side posts.
    private var world: some View {
        let camera = layout.camera
        return ZStack(alignment: .topLeading) {
            ForEach(layout.sides) { side in
                let box = side.touchFrame(touch: stage.touch)
                Button { onSide(side) } label: { WalkSideView(side: side, box: box, veiled: veilsWords) }
                    .buttonStyle(.plain)
                    .accessibilityLabel(side.label)
                    .accessibilityIdentifier("walk.side.\(side.name.isEmpty ? "loose" : side.name.lowercased())")
                    .walkAccessibilityHint(side.area == nil ? nil : WalkCopy.areaHint(ground: false, kept: true, focused: false))
                    .walkReadOnly(WalkLayout.tapEvent(side) == nil)
                    .accessibilityHidden(veilsWords)
                    .accessibilitySortPriority(1)             // after the area you stand in and its flags
                    .walkPlaced(box, camera)
            }

            ForEach(layout.posts) { post in
                // The pole leans about its foot as the layout says; its banners' frames already lean with it.
                WalkPoleView(height: max(0, post.base.y - post.top), pale: post.pale)
                    .rotationEffect(.degrees(post.lean), anchor: .bottom)
                    .accessibilityHidden(true)
                    .walkPlaced(CGRect(x: post.base.x - 9, y: post.top, width: 18, height: max(0, post.base.y - post.top)),
                                camera)
                ForEach(post.banners) { banner in
                    Button { onBanner(banner, post) } label: {
                        WalkBannerView(banner: banner, dropsIn: dropsIn && arrived, veiled: veilsWords)
                    }
                        .buttonStyle(.plain)
                        .accessibilityLabel(banner.label)
                        .walkReadOnly(!banner.taps)
                        .walkActions(actions(banner))
                        .accessibilityHidden(veilsWords)
                        .accessibilitySortPriority(2)
                        .walkPlaced(banner.frame, camera)
                }
            }

            ForEach(layout.labels) { label in
                Button { onLabel(label) } label: { WalkLabelView(label: label, veiled: veilsWords) }
                    .buttonStyle(.plain)
                    .allowsHitTesting(label.tappable)
                    .accessibilityLabel(label.name)
                    .walkAccessibilityHint(label.hint)
                    .walkReadOnly(!label.tappable)
                    .accessibilityAddTraits(label.selected ? .isSelected : [])
                    .walkStandingIdentifier(label.standing)
                    .accessibilityHidden(veilsWords)
                    .accessibilitySortPriority(3)             // "you are here" first, then its flags, then the side posts
                    .walkPlaced(label.frame, camera)
                if let caret = label.caret {
                    WalkCaret(colour: WalkPalette.gold)
                        .accessibilityHidden(true)
                        .walkPlaced(caret, camera)
                }
            }
        }
        .frame(width: art.world.width, height: art.world.height, alignment: .topLeading)
        .scaleEffect(camera.k, anchor: .topLeading)
        .offset(x: -camera.x * camera.k, y: -camera.y * camera.k)
        .animation(reduceMotion ? nil : Self.glide, value: camera)
    }

    // MARK: The band

    /// The band's strength at its top edge, which the bleed above the board carries on to the window's top.
    private var bandTop: Double { art.topShade(step: step, stage: stage) ?? 0.55 }

    /// A faint dark band at the top, so white words read over a pale sky (contract §14); where the
    /// step's painting behind the words is bright, a held shade to the question's foot (`WalkBackdrop.shade`,
    /// or the step's `stretchedShade` on a stage with wings).
    @ViewBuilder private var band: some View {
        if let strength = art.topShade(step: step, stage: stage) {
            let held = WalkLayout.question, length = WalkLayout.question + WalkBackdrop.shadeFade
            LinearGradient(stops: [.init(color: WalkPalette.navyBand.opacity(strength), location: 0),
                                   .init(color: WalkPalette.navyBand.opacity(strength), location: held / length),
                                   .init(color: WalkPalette.navyBand.opacity(0), location: 1)],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: length)
                .allowsHitTesting(false)
        } else {
            LinearGradient(stops: [.init(color: WalkPalette.navyBand.opacity(0.55), location: 0),
                                   .init(color: WalkPalette.navyBand.opacity(0.25), location: 0.6),
                                   .init(color: WalkPalette.navyBand.opacity(0), location: 1)],
                           startPoint: .top, endPoint: .bottom)
                .frame(height: 260)
                .allowsHitTesting(false)
        }
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

extension View {
    /// Places a view sized to a stage's window (`WalkStage.window`: the board plus its bleed) over
    /// that window, from inside a container laid out on the board: it runs past the board to the
    /// window's edges and takes only the board's room, so nothing around it moves.
    func walkOverTheWindow(_ stage: WalkStage) -> some View {
        offset(x: stage.window.minX, y: stage.window.minY)
            .frame(width: stage.board.width, height: stage.board.height, alignment: .topLeading)
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

    /// The standing pill is `walk.standing`; a ground chip keeps no identifier (it is found by its name).
    @ViewBuilder func walkStandingIdentifier(_ standing: Bool) -> some View {
        if standing { accessibilityIdentifier("walk.standing") } else { self }
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
