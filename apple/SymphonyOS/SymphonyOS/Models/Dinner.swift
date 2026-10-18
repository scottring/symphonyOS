import Foundation

/// One night's planned dinner, as the meal plan holds it (Scott, 2026-10-07:
/// the phone should show tonight's dinner when there is one). Read-only —
/// planning meals stays on the web.
struct Dinner: Equatable, Identifiable {
    let id: UUID              // the meal_plan_entries row
    let title: String
    let notes: String?
    let imageURL: URL?
    let prepMinutes: Int?
    let sourceURL: URL?
    let ingredients: [String]
    let instructions: [String]

    /// Something to cook from without leaving the app.
    var hasRecipe: Bool { !ingredients.isEmpty || !instructions.isEmpty }

    /// The first sentence of the notes — the one cue worth a line on Today.
    var cue: String? {
        guard let notes = notes?.trimmingCharacters(in: .whitespacesAndNewlines), !notes.isEmpty else { return nil }
        if let end = notes.range(of: #"[.!?](\s|$)"#, options: .regularExpression) {
            return String(notes[..<end.lowerBound]) + String(notes[end.lowerBound])
        }
        return notes
    }
}

// MARK: - Rows

struct MealPlanEntryRow: Decodable, Equatable {
    let id: UUID
    let dayOfWeek: Int
    let slot: String
    let recipeId: UUID?
    let adHocTitle: String?
    let notes: String?
    let leftoverFrom: UUID?
    let forMemberId: UUID?

    enum CodingKeys: String, CodingKey {
        case id, slot, notes
        case dayOfWeek = "day_of_week"
        case recipeId = "recipe_id"
        case adHocTitle = "ad_hoc_title"
        case leftoverFrom = "leftover_from"
        case forMemberId = "for_member_id"
    }
}

struct RecipeRow: Decodable, Equatable {
    let id: UUID
    let title: String
    let sourceUrl: String?
    let imageUrl: String?
    let prepMinutes: Int?
    let ingredients: [String]?
    let instructions: [String]?

    enum CodingKeys: String, CodingKey {
        case id, title, ingredients, instructions
        case sourceUrl = "source_url"
        case imageUrl = "image_url"
        case prepMinutes = "prep_minutes"
    }
}

// MARK: - Choosing the night's dinner

/// The same rules the web uses (src/lib/mealTitle.ts), so the phone, the
/// wall and the planner name a dinner the same way.
enum DinnerPick {
    /// The plan's `day_of_week` for a date: Sunday = 0.
    static func dayOfWeek(_ date: Date, calendar: Calendar = PlanCalendar.calendar) -> Int {
        calendar.component(.weekday, from: date) - 1
    }

    /// The Sunday a meal plan's week starts on (meal plans are Sunday-keyed,
    /// whatever day the household's planning weeks start).
    static func weekStart(_ date: Date, calendar: Calendar = PlanCalendar.calendar) -> Date {
        let day = calendar.startOfDay(for: date)
        return calendar.date(byAdding: .day, value: -dayOfWeek(day, calendar: calendar), to: day) ?? day
    }

    /// The household's dinner that night: a dinner entry for the day, the
    /// family's (no `for_member_id`) ahead of one person's.
    static func dinner(on date: Date, entries: [MealPlanEntryRow], recipes: [RecipeRow]) -> Dinner? {
        let dow = dayOfWeek(date)
        let candidates = entries.filter { $0.slot == "dinner" && $0.dayOfWeek == dow }
        guard let entry = candidates.first(where: { $0.forMemberId == nil }) ?? candidates.first else { return nil }

        let byId = Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let recipesById = Dictionary(recipes.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        // A leftover cooks from its source's recipe, one hop, as its title does.
        let own: MealPlanEntryRow?
        if let from = entry.leftoverFrom {
            own = byId[from].flatMap { $0.leftoverFrom == nil ? $0 : nil }
        } else {
            own = entry
        }
        let recipe = own?.recipeId.flatMap { recipesById[$0] }
        let pastedURL = own.flatMap { $0.recipeId == nil ? splitTitleURL($0.adHocTitle).url : nil }

        return Dinner(
            id: entry.id,
            title: title(of: entry, entriesById: byId, recipesById: recipesById),
            notes: entry.notes,
            imageURL: recipe?.imageUrl.flatMap(URL.init(string:)),
            prepMinutes: recipe?.prepMinutes,
            sourceURL: recipe?.sourceUrl.flatMap(URL.init(string:)) ?? pastedURL,
            ingredients: (recipe?.ingredients ?? []).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty },
            instructions: (recipe?.instructions ?? []).filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
        )
    }

    /// resolveMealTitle: a leftover reads "Leftovers: <source>", one hop only;
    /// anything else is its recipe's title or its own ad-hoc name.
    static func title(of entry: MealPlanEntryRow, entriesById: [UUID: MealPlanEntryRow], recipesById: [UUID: RecipeRow]) -> String {
        if let from = entry.leftoverFrom {
            guard let source = entriesById[from], source.leftoverFrom == nil,
                  let sourceTitle = ownTitle(source, recipesById) else { return "Leftovers" }
            return "Leftovers: \(sourceTitle)"
        }
        return ownTitle(entry, recipesById) ?? "(unnamed)"
    }

    private static func ownTitle(_ entry: MealPlanEntryRow, _ recipesById: [UUID: RecipeRow]) -> String? {
        if let id = entry.recipeId { return recipesById[id]?.title }
        let name = splitTitleURL(entry.adHocTitle).name
        return name.isEmpty ? nil : name
    }

    /// splitRecipeTitleUrl: a recipe link pasted into an ad-hoc title is the
    /// link; the rest, tidied, is the dish.
    static func splitTitleURL(_ title: String?) -> (name: String, url: URL?) {
        let raw = (title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return ("", nil) }
        guard let range = raw.range(of: #"https?://[^\s<>"')\]]+"#, options: [.regularExpression, .caseInsensitive]) else {
            return (raw, nil)
        }
        let url = URL(string: String(raw[range]).trimmingCharacters(in: CharacterSet(charactersIn: ".,;:!?")))
        var name = raw.replacingCharacters(in: range, with: " ")
        name = name.replacingOccurrences(of: #"[\[\]()]"#, with: " ", options: .regularExpression)
        name = name.replacingOccurrences(of: #"\s+[-–—·:|]+\s*$"#, with: "", options: .regularExpression)
        name = name.replacingOccurrences(of: #"[\s,;]+$"#, with: "", options: .regularExpression)
        name = name.replacingOccurrences(of: #"\s{2,}"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces)
        if name.isEmpty, let host = url?.host { name = host.replacingOccurrences(of: "www.", with: "") }
        return (name, url)
    }
}
