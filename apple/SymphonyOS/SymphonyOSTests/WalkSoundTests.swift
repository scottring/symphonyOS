#if os(iOS)
import Testing
import Foundation
import AVFoundation
import UIKit
@testable import Symphony

// The walk's five sounds: which file plays (a recording beats a placeholder),
// that every one ships, when a sound may be heard (the setting, and never
// while speech holds the audio session), the haptic that goes with each one
// (sound on or off), and that the model plays what the reducer asks, on time,
// and nothing after it is closed.

private func day(_ y: Int, _ m: Int, _ d: Int) -> Date {
    PlanCalendar.calendar.date(from: DateComponents(year: y, month: m, day: d))!
}

/// Friday 13 November 2026, as the other walk tests.
private let now = day(2026, 11, 13)

@MainActor
struct WalkSoundTests {
    let me = UUID()
    let scheduler = ManualWalkScheduler()
    let sound = FakeWalkSound()

    private func model() throws -> WalkModel {
        WalkModel(context: try walkTestContext(), userId: me, entry: .start, position: nil, edition: .light,
                  now: now, store: nil, scheduler: scheduler, listener: FakeWalkListener(), sound: sound)
    }

    // MARK: Files

    @Test func aRecordingBeatsAPlaceholder() {
        #expect(WalkSound.fileName(for: .bag, in: ["walk-bag.PLACEHOLDER.wav", "walk-bag.caf"]) == "walk-bag.caf")
        #expect(WalkSound.fileName(for: .bag, in: ["walk-bag.PLACEHOLDER.wav"]) == "walk-bag.PLACEHOLDER.wav")
        #expect(WalkSound.fileName(for: .bag, in: []) == nil)
        // Another sound's file is not this one's.
        #expect(WalkSound.fileName(for: .bag, in: ["walk-poles.wav", "walk-poles.PLACEHOLDER.wav"]) == nil)
    }

    @Test func everySoundIsInTheBundle() {
        let files = WalkSound.bundleFiles()
        for name in WalkSoundName.allCases {
            #expect(WalkSound.fileName(for: name, in: files) != nil, "no file for \(name)")
        }
    }

    // MARK: When a sound is heard

    /// Sound plays only with the setting on and the session as the walk leaves it
    /// between holds (ambient, or the app's untouched solo ambient). While speech
    /// holds the session (play and record, or record) nothing plays.
    @Test func speechHoldingTheSessionSilencesTheWalk() {
        let table: [(AVAudioSession.Category, Bool)] = [
            (.ambient, true), (.soloAmbient, true),
            (.playAndRecord, false), (.record, false),
            (.playback, false), (.multiRoute, false),
        ]
        for (category, plays) in table {
            #expect(WalkSound.mayPlay(soundOn: true, category: category) == plays, "\(category.rawValue)")
            #expect(!WalkSound.mayPlay(soundOn: false, category: category), "\(category.rawValue)")
        }
    }

    @Test func everySoundHasItsHaptic() {
        #expect(WalkSound.haptic(for: .bag) == .impact(.soft, intensity: 0.5, afterMs: 0))
        #expect(WalkSound.haptic(for: .poles) == .impact(.rigid, intensity: 0.6, afterMs: 0))
        #expect(WalkSound.haptic(for: .unfurl) == .impact(.light, intensity: 0.7, afterMs: 0))
        #expect(WalkSound.haptic(for: .plant) == .impact(.medium, intensity: 1.0, afterMs: 130))
        #expect(WalkSound.haptic(for: .tick) == .selection)
    }

    /// The path `play` takes: with the setting off, or speech holding the session,
    /// nothing is heard but the haptic still goes.
    @Test func withSoundOffTheHapticStillGoes() {
        for name in WalkSoundName.allCases {
            let off = WalkSound.decide(name, soundOn: false, category: .ambient)
            #expect(!off.plays)
            #expect(off.haptic == WalkSound.haptic(for: name))
            let listening = WalkSound.decide(name, soundOn: true, category: .playAndRecord)
            #expect(!listening.plays)
            #expect(listening.haptic == WalkSound.haptic(for: name))
            #expect(WalkSound.decide(name, soundOn: true, category: .ambient).plays)
        }
    }

    // MARK: The model

    @Test func theModelPlaysWhatTheReducerAsks() throws {
        let m = try model()
        m.choose(.quick)
        m.choose(.next)                                   // the Year step, off the ground
        m.send(.orbDown)
        #expect(sound.played == [.bag])
        scheduler.advance(120)
        #expect(sound.played == [.bag, .poles])
        m.send(.orbUp(heldMs: 120))                       // a tap: the compass opens
        m.choose(.type)
        m.send(.typeChanged("feel strong again"))
        m.send(.typeSubmitted)
        #expect(sound.played == [.bag, .poles, .plant])
        m.choose(.back)                                   // back down to the ground
        let health = try #require(m.state.areas.first { $0.name == "Health" })
        m.send(.areaTapped(health.id))
        #expect(sound.played == [.bag, .poles, .plant, .tick])
    }

    @Test func aDelayedSoundDoesNotOutliveClose() throws {
        let m = try model()
        m.choose(.quick)
        m.choose(.next)
        m.send(.orbDown)                                  // the bag now, the poles at +120
        #expect(sound.played == [.bag])
        m.close()
        scheduler.advance(1_000)
        #expect(sound.played == [.bag])
    }

    @Test func eachDelayedSoundWaitsOnItsOwn() throws {
        let m = try model()
        m.choose(.quick)
        m.choose(.next)
        m.send(.orbDown)                                  // poles at +120, the hold at +420
        scheduler.advance(WalkOrb.holdMs)                 // the hold: listening, and the unfurl at +280
        #expect(sound.played == [.bag, .poles])
        scheduler.advance(279)
        #expect(sound.played == [.bag, .poles])
        scheduler.advance(1)
        #expect(sound.played == [.bag, .poles, .unfurl])
    }
}
#endif
