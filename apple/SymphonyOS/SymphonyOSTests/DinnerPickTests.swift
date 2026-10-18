import Testing
import Foundation
@testable import Symphony

/// Twin coverage for the web's src/lib/mealTitle.ts: the phone names and picks
/// a night's dinner the way the planner and the wall do.
@MainActor
struct DinnerPickTests {
    // Tuesday, October 6, 2026 — day_of_week 2 in a week starting Sunday Oct 4.
    let tuesday = Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 6, hour: 17))!

    func entry(_ id: UUID = UUID(), day: Int = 2, slot: String = "dinner", recipe: UUID? = nil,
               adHoc: String? = nil, notes: String? = nil, leftoverFrom: UUID? = nil, forMember: UUID? = nil) -> MealPlanEntryRow {
        MealPlanEntryRow(id: id, dayOfWeek: day, slot: slot, recipeId: recipe, adHocTitle: adHoc,
                         notes: notes, leftoverFrom: leftoverFrom, forMemberId: forMember)
    }

    @Test func readsTheDaysOfAMealPlanWeekFromSunday() {
        #expect(DinnerPick.dayOfWeek(tuesday) == 2)
        #expect(PlanCalendar.ymd(DinnerPick.weekStart(tuesday)) == "2026-10-04")
    }

    @Test func picksThatNightsDinnerWithItsRecipe() {
        let salmon = RecipeRow(id: UUID(), title: "Sheet-Pan Maple-Dijon Salmon", sourceUrl: "https://example.com/salmon",
                               imageUrl: "https://example.com/salmon.jpg", prepMinutes: 45,
                               ingredients: ["1 1/4 lb salmon", ""], instructions: ["Roast."])
        let dinner = DinnerPick.dinner(on: tuesday, entries: [
            entry(day: 2, slot: "lunch", adHoc: "Bagged salad"),
            entry(day: 1, adHoc: "Red lentil soup"),
            entry(day: 2, recipe: salmon.id, notes: "Roast double sweet potatoes — half for Wednesday. Try-it food: sprouts."),
        ], recipes: [salmon])
        #expect(dinner?.title == "Sheet-Pan Maple-Dijon Salmon")
        #expect(dinner?.prepMinutes == 45)
        #expect(dinner?.ingredients == ["1 1/4 lb salmon"])
        #expect(dinner?.cue == "Roast double sweet potatoes — half for Wednesday.")
        #expect(dinner?.hasRecipe == true)
    }

    @Test func nothingPlannedIsNoDinner() {
        #expect(DinnerPick.dinner(on: tuesday, entries: [entry(day: 3, adHoc: "Tacos")], recipes: []) == nil)
    }

    @Test func theFamilysDinnerComesBeforeOnePersons() {
        let dinner = DinnerPick.dinner(on: tuesday, entries: [
            entry(adHoc: "Iris's soup", forMember: UUID()),
            entry(adHoc: "Tacos"),
        ], recipes: [])
        #expect(dinner?.title == "Tacos")
    }

    @Test func aLeftoverIsNamedAndCookedFromItsSourceOneHopOnly() {
        let soup = RecipeRow(id: UUID(), title: "Red Lentil Soup", sourceUrl: nil, imageUrl: nil, prepMinutes: nil,
                             ingredients: ["lentils"], instructions: nil)
        let monday = entry(day: 1, recipe: soup.id)
        let leftover = entry(day: 2, leftoverFrom: monday.id)
        let dinner = DinnerPick.dinner(on: tuesday, entries: [monday, leftover], recipes: [soup])
        #expect(dinner?.title == "Leftovers: Red Lentil Soup")
        #expect(dinner?.ingredients == ["lentils"])

        // A leftover of a leftover does not chase the chain.
        let mondayLeftover = entry(day: 1, leftoverFrom: monday.id)
        let chained = entry(day: 2, leftoverFrom: mondayLeftover.id)
        #expect(DinnerPick.dinner(on: tuesday, entries: [monday, mondayLeftover, chained], recipes: [soup])?.title == "Leftovers")
        #expect(DinnerPick.dinner(on: tuesday, entries: [entry(leftoverFrom: UUID())], recipes: [])?.title == "Leftovers")
    }

    @Test func aLinkPastedIntoAnAdHocTitleIsTheRecipeLink() {
        let dinner = DinnerPick.dinner(on: tuesday, entries: [entry(adHoc: "Golden tofu noodle bowl - https://example.com/tofu")], recipes: [])
        #expect(dinner?.title == "Golden tofu noodle bowl")
        #expect(dinner?.sourceURL?.absoluteString == "https://example.com/tofu")
        #expect(dinner?.hasRecipe == false)
    }
}
