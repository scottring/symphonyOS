import Foundation
import SwiftUI
import Supabase

/// Reads a night's planned dinner from the household's meal plan, the same
/// plan the web planner and the kitchen wall read. Read-only: a week with no
/// plan simply has no dinner here (the web creates plans; the phone never does).
@Observable
@MainActor
final class DinnerService {
    static let shared = DinnerService()

    /// Dinner per local day (YYYY-MM-DD). A key present with nil = loaded,
    /// nothing planned; a missing key = never loaded (or the load failed).
    private(set) var byDay: [String: Dinner?] = [:]
    private var fetchedAt: [String: Date] = [:]

    func dinner(on date: Date) -> Dinner? { byDay[PlanCalendar.ymd(date)] ?? nil }

    /// Load `date` unless it was loaded in the last `maxAge` seconds. A failed
    /// load caches nothing, so the next appear tries again — the wall's dinner
    /// once vanished for a whole evening because its one load failed at boot.
    func refresh(_ date: Date, maxAge: TimeInterval = 300) async {
        let key = PlanCalendar.ymd(date)
        #if DEBUG
        if DemoMode.isOn {   // a sample dinner, never a network call
            byDay[key] = .some(DemoMode.dinner(on: date))
            fetchedAt[key] = Date()
            return
        }
        #endif
        if let at = fetchedAt[key], Date().timeIntervalSince(at) < maxAge { return }
        do {
            byDay[key] = .some(try await fetchDinner(on: date))
            fetchedAt[key] = Date()
        } catch {
            print("DinnerService: \(error)")
        }
    }

    private func fetchDinner(on date: Date) async throws -> Dinner? {
        struct PlanRow: Decodable { let id: UUID }
        // RLS shows the household's plans; when more than one person made a
        // plan for the week, the oldest wins (as useMealPlan does on the web).
        let plans: [PlanRow] = try await supabase
            .from("meal_plans")
            .select("id")
            .eq("week_start", value: PlanCalendar.ymd(DinnerPick.weekStart(date)))
            .order("created_at", ascending: true)
            .limit(1)
            .execute()
            .value
        guard let plan = plans.first else { return nil }

        // The whole week: a leftover's source can be another day.
        let entries: [MealPlanEntryRow] = try await supabase
            .from("meal_plan_entries")
            .select("id, day_of_week, slot, recipe_id, ad_hoc_title, notes, leftover_from, for_member_id")
            .eq("meal_plan_id", value: plan.id)
            .execute()
            .value

        let recipeIds = Set(entries.compactMap(\.recipeId)).map(\.uuidString)
        let recipes: [RecipeRow] = recipeIds.isEmpty ? [] : try await supabase
            .from("recipes")
            .select("id, title, source_url, image_url, prep_minutes, ingredients, instructions")
            .in("id", values: recipeIds)
            .execute()
            .value

        return DinnerPick.dinner(on: date, entries: entries, recipes: recipes)
    }
}
