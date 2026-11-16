import Foundation

#if DEBUG
/// Stress plans for screenshots. `-SymphonyWalkSeed full|long` for the
/// walk's preview, `-SymphonyDailySeed full|long` for the everyday pages.
/// `full`: five areas, three or four goals each at Year, Season and Month, twelve tasks in the week, nine today.
/// `long`: titles of about forty characters and an area of the person's own with a 24-character name.
enum DemoStress {
    struct Plan {
        let areas: [String]
        let customArea: String?
        /// level, words, area
        let script: [(WalkLevel, String, String)]
    }

    static let customName = "Side projects and making"      // 24 characters

    static func named(_ name: String?) -> Plan? {
        switch name?.lowercased() {
        case "full": return full
        case "long": return long
        default: return nil
        }
    }

    static var walk: Plan? {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-SymphonyWalkSeed"), i + 1 < args.count else { return nil }
        return named(args[i + 1])
    }

    static let full = Plan(areas: ["Health", "Home", "People", "Work", "Money"], customArea: nil, script: [
        (.year, "Feel strong again", "Health"), (.year, "Sleep seven hours most nights", "Health"),
        (.year, "Run a 10k in the fall", "Health"), (.year, "Cook at home on weeknights", "Health"),
        (.year, "Finish the bathroom", "Home"), (.year, "Clear out the garage", "Home"),
        (.year, "Plant a kitchen garden", "Home"),
        (.year, "More slow weekends together", "People"), (.year, "See old friends each month", "People"),
        (.year, "Call Mom every Sunday", "People"), (.year, "Host one big family dinner", "People"),
        (.year, "Sign one more contract", "Work"), (.year, "Raise my day rate", "Work"), (.year, "Write one talk", "Work"),
        (.year, "Build a three-month cushion", "Money"), (.year, "Pay off the car", "Money"),
        (.year, "Sort out retirement savings", "Money"), (.year, "Spend less on takeout", "Money"),

        (.season, "Lift twice a week", "Health"), (.season, "In bed by eleven", "Health"),
        (.season, "Run three times a week", "Health"),
        (.season, "Bathroom done by February", "Home"), (.season, "Empty half the garage", "Home"),
        (.season, "Build two raised beds", "Home"), (.season, "Fix the back fence", "Home"),
        (.season, "One slow Sunday a month", "People"), (.season, "Dinner with the Okafors", "People"),
        (.season, "Plan the winter visit", "People"),
        (.season, "Pitch three new clients", "Work"), (.season, "Rewrite the proposal", "Work"),
        (.season, "Draft the talk outline", "Work"), (.season, "Update the portfolio", "Work"),
        (.season, "Save two thousand", "Money"), (.season, "Clear the car loan", "Money"),
        (.season, "Find the old retirement account", "Money"),

        (.month, "Find a gym that fits", "Health"), (.month, "Buy running shoes", "Health"),
        (.month, "No screens after ten", "Health"), (.month, "Book a checkup", "Health"),
        (.month, "Pick the tile and pay the deposit", "Home"), (.month, "Clear out the old vanity", "Home"),
        (.month, "Rent a dumpster", "Home"),
        (.month, "Book the cabin", "People"), (.month, "Invite the Okafors", "People"),
        (.month, "Call Dad about December", "People"),
        (.month, "Make 10 sales calls", "Work"), (.month, "Send two proposals", "Work"),
        (.month, "Ask for a testimonial", "Work"), (.month, "Sketch the first slides", "Work"),
        (.month, "Open a savings account", "Money"), (.month, "Cancel two subscriptions", "Money"),
        (.month, "Call about the retirement account", "Money"),

        (.week, "Send the contractor the deposit, today", "Home"), (.week, "Tour the gym on Main Street, today", "Health"),
        (.week, "Call the first three leads, today", "Work"), (.week, "Move 200 into savings, today", "Money"),
        (.week, "Text the Okafors about Friday, today", "People"), (.week, "Measure the bathroom window, today", "Home"),
        (.week, "Lay out running clothes, today", "Health"), (.week, "Cancel the movie channel, today", "Money"),
        (.week, "Write the proposal intro, today", "Work"),
        (.week, "Choose the tile, Saturday", "Home"), (.week, "Slow morning with pancakes, Sunday", "People"),
        (.week, "Order the dumpster", "Home"),
    ])

    static let long = Plan(areas: ["Health", "Home", customName], customArea: customName, script: [
        (.year, "Get strong enough to carry the kids uphill", "Health"),
        (.year, "Sleep seven hours on most weeknights again", "Health"),
        (.year, "Finish the upstairs bathroom before spring", "Home"),
        (.year, "Ship the first version of the woodwork shop", customName),
        (.year, "Record twelve songs with the old band again", customName),
        (.season, "Lift twice a week with the trainer on Main", "Health"),
        (.season, "Tile and plumbing signed off by February", "Home"),
        (.season, "Open the shop with ten pieces photographed", customName),
        (.month, "Book eight sessions and buy proper shoes", "Health"),
        (.month, "Pick the tile and pay the contractor deposit", "Home"),
        (.month, "Photograph the first five pieces in daylight", customName),
        (.week, "Send the contractor the signed deposit form, today", "Home"),
        (.week, "Call the trainer about the Tuesday slot, today", "Health"),
        (.week, "Sand and oil the walnut side table top, today", customName),
        (.week, "Choose between the two grey floor tiles, Saturday", "Home"),
    ])
}
#endif
