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
    let calendar = FakeWalkCalendar()

    private func model() throws -> WalkModel {
        WalkModel(context: try walkTestContext(), userId: me, entry: .start, position: nil, edition: .light,
                  now: now, store: nil, scheduler: scheduler, listener: FakeWalkListener(), sound: sound,
                  calendarAccess: { [calendar] in calendar.access }, requestCalendar: { [calendar] in await calendar.request() })
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

    /// Sound plays only with the setting on and the walk's own listening not
    /// holding the audio session.
    @Test func ownListeningSilencesTheWalk() {
        #expect(WalkSound.mayPlay(soundOn: true, ownListening: false))
        #expect(!WalkSound.mayPlay(soundOn: true, ownListening: true))
        #expect(!WalkSound.mayPlay(soundOn: false, ownListening: false))
        #expect(!WalkSound.mayPlay(soundOn: false, ownListening: true))
    }

    /// When a sound may play, any category but ambient is made ambient first,
    /// a `.record` left behind by Tell included.
    @Test func anythingButAmbientIsMadeAmbient() {
        #expect(!WalkSound.setsAmbient(over: .ambient))
        for category in [AVAudioSession.Category.soloAmbient, .record, .playAndRecord, .playback, .multiRoute] {
            #expect(WalkSound.setsAmbient(over: category), "\(category.rawValue)")
        }
    }

    @Test func everySoundHasItsHaptic() {
        #expect(WalkSound.haptic(for: .bag) == .impact(.soft, intensity: 0.5))
        #expect(WalkSound.haptic(for: .poles) == .impact(.rigid, intensity: 0.6))
        #expect(WalkSound.haptic(for: .unfurl) == .impact(.light, intensity: 0.7))
        #expect(WalkSound.haptic(for: .plant) == .impact(.medium, intensity: 1.0))
        #expect(WalkSound.haptic(for: .tick) == .selection)
        #expect(WalkSoundName.allCases.map(WalkSound.hapticDelayMs) == [0, 0, 0, 130, 0])
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

    // MARK: Listening and haptics through the model

    /// While the walk listens its sounds are asked for silent; once the session
    /// has ended the next one (the plant) plays.
    @Test func afterListeningEndsTheNextSoundPlays() async throws {
        let listener = FakeWalkListener()
        let m = WalkModel(context: try walkTestContext(), userId: me, entry: .start, position: nil, edition: .light,
                          now: now, store: nil, scheduler: scheduler, listener: listener, sound: sound,
                          calendarAccess: { [calendar] in calendar.access }, requestCalendar: { [calendar] in await calendar.request() })
        m.choose(.quick)
        m.choose(.next)
        m.send(.orbDown)
        scheduler.advance(WalkOrb.holdMs)                 // the hold asks to listen
        await scheduler.settle()
        scheduler.advance(280)                            // the unfurl, while listening
        listener.hear("feel strong again")
        m.send(.orbUp(heldMs: 900))
        #expect(sound.played == [.bag, .poles, .unfurl])
        #expect(sound.whileListening == [false, false, true])
        listener.end()                                    // the session ends: the flag is planted
        #expect(sound.played == [.bag, .poles, .unfurl, .plant])
        #expect(sound.whileListening == [false, false, true, false])
    }

    /// Every sound is felt, heard or not; the plant's thud 130 ms after its sound.
    @Test func everySoundIsFeltAndThePlantWithItsHit() throws {
        let m = try model()
        m.choose(.quick)
        m.choose(.next)
        m.send(.orbDown)
        scheduler.advance(120)
        #expect(sound.felt == [.bag, .poles])
        m.send(.orbUp(heldMs: 120))
        m.choose(.type)
        m.send(.typeChanged("feel strong again"))
        m.send(.typeSubmitted)
        #expect(sound.played.last == .plant)
        scheduler.advance(129)
        #expect(sound.felt == [.bag, .poles])
        scheduler.advance(1)
        #expect(sound.felt == [.bag, .poles, .plant])
    }

    @Test func closingBeforeTheThudLeavesNoHapticDue() throws {
        let m = try model()
        m.choose(.quick)
        m.choose(.next)
        m.choose(.type)
        m.send(.typeChanged("feel strong again"))
        m.send(.typeSubmitted)
        #expect(sound.played == [.plant])
        m.close()
        scheduler.advance(1_000)
        #expect(sound.felt.isEmpty)
    }
}
#endif
