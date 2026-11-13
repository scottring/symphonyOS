import Testing
@testable import Symphony

struct EditionTests {
    @Test func resolveRules() {
        #expect(Edition.resolve([]) == .light)
        #expect(Edition.resolve(["light"]) == .light)
        #expect(Edition.resolve(["full"]) == .full)
        #expect(Edition.resolve([nil]) == .full)
        #expect(Edition.resolve(["light", "full"]) == .full)
        #expect(Edition.resolve(["something-new"]) == .full)
    }

    @Test func lightAllowsNothingFullAllowsAll() {
        for feature in Feature.allCases {
            #expect(!Edition.light.allows(feature))
            #expect(Edition.full.allows(feature))
        }
    }

    @Test func lightHidesRoutinesTab() {
        #expect(AppTab.visible(in: .light) == [.planner, .inbox, .more])
        #expect(AppTab.visible(in: .full) == [.planner, .inbox, .routines, .more])
    }

    @Test func assumedLifeArea() {
        #expect(Edition.light.assumedLifeArea == "personal")
        #expect(Edition.full.assumedLifeArea == nil)
    }
}
