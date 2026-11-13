import Testing
import Foundation
@testable import Symphony

struct WalkClassifierTests {
    private func area(_ name: String) -> WalkArea { WalkArea(id: UUID(), name: name) }
    private let health = WalkArea(id: UUID(), name: "Health")
    private let home = WalkArea(id: UUID(), name: "Home")
    private let people = WalkArea(id: UUID(), name: "People")
    private var kept: [WalkArea] { [health, home, people] }

    @Test func listsAreDisjointAndSized() {
        var seen = Set<String>()
        for name in WalkClassifier.defaults {
            let list = WalkClassifier.keywords[name] ?? []
            #expect((15...25).contains(list.count), "\(name) has \(list.count)")
            #expect(list.contains(name.lowercased()))
            for w in list { #expect(seen.insert(w).inserted, "\(w) is in two lists") }
        }
        #expect(WalkClassifier.keywords.count == WalkClassifier.defaults.count)
    }

    @Test func itGoesWhereItSays() {
        #expect(WalkClassifier.place("Finish the bathroom", kept: kept, focus: nil) == .area(home.id, moved: false))
        #expect(WalkClassifier.place("Feel strong again", kept: kept, focus: nil) == .area(health.id, moved: false))
        #expect(WalkClassifier.place("More slow weekends together", kept: kept, focus: nil) == .area(people.id, moved: false))
        #expect(WalkClassifier.place("Run a 5K", kept: kept, focus: nil) == .area(health.id, moved: false))
    }

    @Test func aClearAreaBeatsTheFocusedPeak() {
        #expect(WalkClassifier.place("Finish the bathroom", kept: kept, focus: health.id) == .area(home.id, moved: true))
    }

    @Test func theFocusedPeakCatchesTheRest() {
        #expect(WalkClassifier.place("Learn the cello", kept: kept, focus: health.id) == .area(health.id, moved: false))
        #expect(WalkClassifier.place("Learn the cello", kept: kept, focus: nil) == .unlabeled)
    }

    @Test func aTieIsNotClear() {
        #expect(WalkClassifier.place("Run to the garage", kept: kept, focus: nil) == .unlabeled)
        #expect(WalkClassifier.place("Run to the garage", kept: kept, focus: people.id) == .area(people.id, moved: false))
    }

    @Test func anAreaNotKeptIsNeverChosen() {
        #expect(WalkClassifier.place("Pay off the car", kept: [health], focus: nil) == .unlabeled)
        #expect(WalkClassifier.place("Pay off the car", kept: [health], focus: health.id) == .area(health.id, moved: false))
    }

    @Test func aNamedAreaMatchesItsOwnName() {
        let faith = area("Faith")
        #expect(WalkClassifier.place("Go deeper in my faith", kept: kept + [faith], focus: nil) == .area(faith.id, moved: false))
    }

    @Test func aNamedAreaHasOnlyItsOwnWords() {
        let faith = area("Faith")
        #expect(WalkClassifier.score("run the faith", areaName: "Faith") == 1)
        #expect(WalkClassifier.place("Run a 5K", kept: [faith], focus: nil) == .unlabeled)
    }

    @Test func wordsNotPieces() {
        #expect(WalkClassifier.score("Workshop for the choir", areaName: "Work") == 0)
        #expect(WalkClassifier.score("Do my homework", areaName: "Work") == 0)
        #expect(WalkClassifier.score("Watch fireworks", areaName: "Work") == 0)
        #expect(WalkClassifier.score("Prune the roses", areaName: "Health") == 0)
        #expect(WalkClassifier.score("Work on the job", areaName: "Work") == 2)
    }

    @Test func caseAccentsAndApostrophesDoNotMatter() {
        #expect(WalkClassifier.score("FINISH THE BATHROOM", areaName: "Home") == 1)
        #expect(WalkClassifier.score("Call mom’s neighbour", areaName: "People") == 2)
        #expect(WalkClassifier.score("Café time", areaName: "Café") == 1)
        #expect(WalkClassifier.score("Cafe time", areaName: "Café") == 1)
        #expect(WalkClassifier.score("Dad's friends", areaName: "People") == 2)
    }

    @Test func eachWordCountsOnce() {
        #expect(WalkClassifier.score("run run run", areaName: "Health") == 1)
    }

    @Test func nothingScoresOnNothing() {
        #expect(WalkClassifier.score("", areaName: "Home") == 0)
        #expect(WalkClassifier.place("", kept: kept, focus: nil) == .unlabeled)
        #expect(WalkClassifier.place("Finish the bathroom", kept: [], focus: nil) == .unlabeled)
    }
}
