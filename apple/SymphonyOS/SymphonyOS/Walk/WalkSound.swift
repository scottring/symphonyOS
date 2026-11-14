#if os(iOS)
import Foundation
import AVFoundation
import UIKit

/// What plays the walk's five sounds: `WalkSound`, or a fake in tests.
@MainActor protocol WalkSoundPlaying: AnyObject {
    func play(_ name: WalkSoundName)
}

/// The walk's five sounds (contract §12) and the haptic that goes with each.
///
/// Files: `walk-<name>.wav`, `.caf` or `.m4a` when a recording has been dropped
/// in `Resources/WalkSounds`, otherwise the synthesized stand-in
/// `walk-<name>.PLACEHOLDER.wav` (rendered by
/// `scripts/render-walk-placeholder-sounds.py`). One preloaded `AVAudioPlayer`
/// per sound at volume 0.6.
///
/// When a sound is heard: only with the app's sound setting on
/// (`PaperSound.shared.isOn`), and never while speech holds the audio session.
/// The walk's `Dictation` puts the shared session in play-and-record while it
/// listens (which ignores the silent switch) and hands it back as ambient,
/// mixing, when it stops. So a sound plays only under ambient (or the app's
/// untouched solo ambient, which is changed to ambient, mixing, first: the
/// silent switch is respected and other apps' music keeps playing). The
/// category is never changed while speech holds it, and the session is never
/// deactivated here. The haptic goes with every sound, heard or not.
/// Anything that fails is silent, never a crash.
@MainActor final class WalkSound: WalkSoundPlaying {
    static let shared = WalkSound()

    static let volume: Float = 0.6

    /// The haptic that goes with a sound. The plant's thud lands 130 ms in, with the hit.
    enum Haptic: Equatable {
        case impact(UIImpactFeedbackGenerator.FeedbackStyle, intensity: CGFloat, afterMs: Int)
        case selection
    }

    /// What one `play` does: whether the sound is heard, and the haptic (always).
    struct Decision: Equatable {
        let plays: Bool
        let haptic: Haptic
    }

    private var players: [WalkSoundName: AVAudioPlayer] = [:]
    private let impacts: [UIImpactFeedbackGenerator.FeedbackStyle: UIImpactFeedbackGenerator] =
        Dictionary(uniqueKeysWithValues: [.soft, .rigid, .light, .medium].map { ($0, UIImpactFeedbackGenerator(style: $0)) })
    private let selection = UISelectionFeedbackGenerator()
    private var resetObserver: (any NSObjectProtocol)?

    /// The players are made here but not prepared: preparing can take the audio
    /// hardware under whatever category the session has, so the first `play`
    /// prepares them, after the category is right.
    private init() {
        load()
        // After a media services reset every player is dead: load them again.
        resetObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main
        ) { [weak self] _ in
            MainActor.assumeIsolated { self?.load() }
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

    /// A sound is heard only with the setting on and the session ambient (or the
    /// app's untouched solo ambient). Any other category belongs to speech
    /// (play and record, record) or to something else, and is left alone.
    static func mayPlay(soundOn: Bool, category: AVAudioSession.Category) -> Bool {
        soundOn && (category == .ambient || category == .soloAmbient)
    }

    static func haptic(for name: WalkSoundName) -> Haptic {
        switch name {
        case .bag: .impact(.soft, intensity: 0.5, afterMs: 0)
        case .poles: .impact(.rigid, intensity: 0.6, afterMs: 0)
        case .unfurl: .impact(.light, intensity: 0.7, afterMs: 0)
        case .plant: .impact(.medium, intensity: 1.0, afterMs: 130)
        case .tick: .selection
        }
    }

    static func decide(_ name: WalkSoundName, soundOn: Bool, category: AVAudioSession.Category) -> Decision {
        Decision(plays: mayPlay(soundOn: soundOn, category: category), haptic: haptic(for: name))
    }

    // MARK: Playing

    func play(_ name: WalkSoundName) {
        let session = AVAudioSession.sharedInstance()
        let decision = Self.decide(name, soundOn: PaperSound.shared.isOn, category: session.category)
        feel(decision.haptic)
        guard decision.plays else { return }
        if session.category != .ambient {
            // Solo ambient (nothing has set the session yet) would stop other apps' music.
            try? session.setCategory(.ambient, mode: .default, options: .mixWithOthers)
        }
        start(name)
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
        players = [:]
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
        return player
    }

    private func feel(_ haptic: Haptic) {
        switch haptic {
        case .selection:
            selection.selectionChanged()
        case .impact(let style, let intensity, let afterMs):
            guard let generator = impacts[style] else { return }
            guard afterMs > 0 else {
                generator.impactOccurred(intensity: intensity)
                return
            }
            // Part of the sound itself (the thud inside the file), not a wait of the walk's.
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(afterMs))
                generator.impactOccurred(intensity: intensity)
            }
        }
    }
}
#endif
