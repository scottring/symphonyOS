#if os(iOS)
import Foundation
import AVFoundation
import UIKit

/// What plays the walk's five sounds and their haptics: `WalkSound`, or a fake in tests.
/// The model times both: a sound's haptic is asked for with it, or `hapticDelayMs` later.
@MainActor protocol WalkSoundPlaying: AnyObject {
    /// `listening`: the walk's own speech holds the audio session, so nothing is heard.
    func play(_ name: WalkSoundName, listening: Bool)
    /// The haptic that goes with a sound, at once, sound on or off.
    func feel(_ name: WalkSoundName)
}

/// The walk's five sounds (contract §12) and the haptic that goes with each.
///
/// Files: `walk-<name>.wav`, `.caf` or `.m4a` when a recording has been dropped
/// in `Resources/WalkSounds`, otherwise the synthesized stand-in
/// `walk-<name>.PLACEHOLDER.wav` (rendered by
/// `scripts/render-walk-placeholder-sounds.py`). One `AVAudioPlayer` per sound
/// at volume 0.6, loaded and prepared when this is made; the haptic generators
/// are prepared then and again after each fire.
///
/// When a sound is heard: only with the app's sound setting on
/// (`PaperSound.shared.isOn`), and never while the walk's own listening holds
/// the audio session (the model says which; `Dictation` has the session in
/// play-and-record then, which ignores the silent switch). Otherwise the
/// session is made ambient, mixing, if it is anything else (solo ambient, or a
/// `.record` that Tell left behind), so the silent switch is respected and other
/// apps' music keeps playing. The session is never deactivated here.
/// Anything that fails is silent, never a crash.
@MainActor final class WalkSound: WalkSoundPlaying {
    /// Made with the first walk model, which is not listening yet.
    static let shared = WalkSound()

    static let volume: Float = 0.6

    enum Haptic: Equatable {
        case impact(UIImpactFeedbackGenerator.FeedbackStyle, intensity: CGFloat)
        case selection
    }

    private var players: [WalkSoundName: AVAudioPlayer] = [:]
    private let impacts: [UIImpactFeedbackGenerator.FeedbackStyle: UIImpactFeedbackGenerator] =
        Dictionary(uniqueKeysWithValues: [.soft, .rigid, .light, .medium].map { ($0, UIImpactFeedbackGenerator(style: $0)) })
    private let selection = UISelectionFeedbackGenerator()
    private var resetObserver: (any NSObjectProtocol)?

    /// Preparing a player can take the audio hardware under the session's category,
    /// so the session is made ambient first: an untouched solo ambient would stop
    /// other apps' music, and a `.record` left by Tell would duck it.
    private init() {
        Self.useAmbient()
        load()
        impacts.values.forEach { $0.prepare() }
        selection.prepare()
        // After a media services reset every player is dead; the next play loads it again.
        resetObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.players = [:] }
        }
    }

    // MARK: Rules

    /// The names of the bundle's files that begin "walk-".
    static func bundleFiles(_ bundle: Bundle = .main) -> [String] {
        guard let path = bundle.resourcePath,
              let names = try? FileManager.default.contentsOfDirectory(atPath: path) else { return [] }
        return names.filter { $0.hasPrefix("walk-") }.sorted()
    }

    /// A recording (`walk-<name>.wav`, `.caf`, `.m4a`) beats the placeholder.
    static func fileName(for name: WalkSoundName, in files: [String]) -> String? {
        let candidates = ["wav", "caf", "m4a"].map { "walk-\(name.rawValue).\($0)" }
            + ["walk-\(name.rawValue).PLACEHOLDER.wav"]
        return candidates.first { files.contains($0) }
    }

    /// A sound is heard only with the setting on and the walk's own listening not holding the session.
    static func mayPlay(soundOn: Bool, ownListening: Bool) -> Bool {
        soundOn && !ownListening
    }

    /// Whether playing must first make the session ambient, mixing. Asked only when `mayPlay`.
    static func setsAmbient(over category: AVAudioSession.Category) -> Bool {
        category != .ambient
    }

    static func haptic(for name: WalkSoundName) -> Haptic {
        switch name {
        case .bag: .impact(.soft, intensity: 0.5)
        case .poles: .impact(.rigid, intensity: 0.6)
        case .unfurl: .impact(.light, intensity: 0.7)
        case .plant: .impact(.medium, intensity: 1.0)
        case .tick: .selection
        }
    }

    /// How long after its sound starts a haptic is felt: the plant's thud lands with the hit.
    static func hapticDelayMs(for name: WalkSoundName) -> Int {
        name == .plant ? 130 : 0
    }

    // MARK: Playing

    func play(_ name: WalkSoundName, listening: Bool) {
        guard Self.mayPlay(soundOn: PaperSound.shared.isOn, ownListening: listening) else { return }
        Self.useAmbient()
        start(name)
    }

    func feel(_ name: WalkSoundName) {
        switch Self.haptic(for: name) {
        case .selection:
            selection.selectionChanged()
            selection.prepare()
        case .impact(let style, let intensity):
            guard let generator = impacts[style] else { return }
            generator.impactOccurred(intensity: intensity)
            generator.prepare()
        }
    }

    private static func useAmbient() {
        let session = AVAudioSession.sharedInstance()
        guard setsAmbient(over: session.category) else { return }
        try? session.setCategory(.ambient, mode: .default, options: .mixWithOthers)
    }

    /// Starts from the top; a player that will not start is loaded again once, then left silent.
    private func start(_ name: WalkSoundName) {
        if let player = players[name] {
            player.currentTime = 0
            if player.play() { return }
        }
        guard let player = makePlayer(name, files: Self.bundleFiles()) else { return }
        players[name] = player
        player.play()
    }

    private func load() {
        let files = Self.bundleFiles()
        for name in WalkSoundName.allCases {
            players[name] = makePlayer(name, files: files)
        }
    }

    /// A missing or unreadable file gives no player: that sound is silent.
    private func makePlayer(_ name: WalkSoundName, files: [String]) -> AVAudioPlayer? {
        guard let file = Self.fileName(for: name, in: files),
              let url = Bundle.main.resourceURL?.appendingPathComponent(file),
              let player = try? AVAudioPlayer(contentsOf: url) else { return nil }
        player.volume = Self.volume
        player.prepareToPlay()
        return player
    }
}
#endif
