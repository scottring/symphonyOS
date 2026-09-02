# iOS Landing-Page Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the iOS app look like www.symphony-os.com and deliver its four Mobile promises: quick-add, day view, context on the card, and "snap the paper plan — it lands placed".

**Architecture:** Three shippable checkpoints on the `ios-sliders` branch. (1) Bundle Crimson Pro + DM Sans and swap the design tokens in place so every screen restyles through the names it already uses. (2) Enrich `TimelineItem` with notes/links/phone/source/children and render the landing's two-density row (plain row vs. block). (3) Replace the single-task "Scan document" with a page flow that calls the web's `parse-page` edge function and commits placed tasks through the SwiftData sync queue.

**Tech Stack:** SwiftUI + SwiftData (iOS 17), supabase-swift 2.x, xcodegen 2.42 (`project.yml` → `.xcodeproj`), Swift Testing (`import Testing`, `@testable import Symphony`), XCUITest for screenshots, Xcode Cloud builds `ios-sliders`.

**Spec:** `docs/superpowers/specs/2026-09-02-ios-landing-parity-design.md`

## Global Constraints

- All work happens in the worktree `/Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders` on branch `ios-sliders`. Never touch the main worktree. Never `cd` in a compound command that also commits; use `git -C <path>` or run `cd` alone.
- App sources live at `apple/SymphonyOS/SymphonyOS/`. Paths below are relative to `apple/SymphonyOS/` unless they start with `docs/`.
- **After any change to `project.yml` or adding/removing files that xcodegen must know about (fonts, new Swift files):** run `xcodegen generate` from `apple/SymphonyOS/`. xcodegen picks up new `.swift` and `.ttf` files under `SymphonyOS/` automatically on regeneration; a stale `.xcodeproj` ships no fonts and no error.
- Build/test commands (run from `apple/SymphonyOS/`):
  - Build: `xcodebuild -scheme SymphonyOS -destination 'platform=iOS Simulator,id=BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E' build 2>&1 | tail -20` (iPhone 17 Pro simulator)
  - Unit tests: `xcodebuild -scheme SymphonyOS -destination 'platform=iOS Simulator,id=BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E' -only-testing:SymphonyOSTests test 2>&1 | grep -E "Test Suite|Test Case|error:|passed|failed" | tail -40`
  - One test struct: append `/StructName` to `-only-testing:SymphonyOSTests`.
- Token NAMES stay the same (`bgBase`, `primaryTint`, `textPrimary`, `displayLarge`, `bodyMedium`, …). Landing VALUES replace the old ones. Light appearance only (`UIUserInterfaceStyle` = Light already in Info.plist).
- Landing palette, verbatim from `landing/index.html`: bg `#FAF7F2`, bg-deep `#F0EBE3`, bg-warm `#F5EFE7`, text `#2C2520`, text-secondary `#6B5E54`, text-muted `#9B8E84`, text-light `#BEB3A9`, amber `#D97706`, amber-soft `#F59E0B`, amber-bg `#FEF3C7`, blue `#2563EB`, blue-bg `#DBEAFE`, green `#059669`, green-bg `#D1FAE5`, card `#FFFFFF`, card-border `#E8E0D8`, card-shadow `rgba(44,37,32,0.06)`, radii 16 / 10 / 6.
- Font PostScript names (Google Fonts static builds): `CrimsonPro-Regular`, `CrimsonPro-Italic`, `CrimsonPro-SemiBold`, `DMSans-Regular`, `DMSans-Medium`, `DMSans-SemiBold`.
- `SlideRow` gesture code (thresholds, `minimumDistance: 24`, axis bias) must NOT change. Only tints.
- Web contracts mirrored on the phone (each gets a comment naming its twin): `PLAN_WINDOW_DAYS = 14` (`src/lib/planParse.ts`), `DEFAULT_CADENCE.weekStartsOn = 0` Sunday (`src/lib/cadence/config.ts`), `GRACE_DAYS` already mirrored.
- **Spec correction:** the spec said the fonts register through `project.yml` and that week start defaults to Monday. The app uses a manual `Info.plist` (`INFOPLIST_FILE`, `GENERATE_INFOPLIST_FILE: NO`), so `UIAppFonts` goes in `SymphonyOS/App/Info.plist`. The web's default week start is Sunday (0), so the phone defaults to Sunday.
- Commit after every task with the trailer:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R
  ```
- Never push `ios-sliders` with a red build. Xcode Cloud builds every push.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `SymphonyOS/Resources/Fonts/*.ttf` (new) | six static font files | 1 |
| `SymphonyOS/App/Info.plist` | `UIAppFonts` list | 1 |
| `SymphonyOS/DesignSystem/Typography.swift` | named `Font` styles → Crimson Pro / DM Sans; delete `FontLoader` | 1 |
| `SymphonyOSTests/DesignSystemTests.swift` (new) | font resolution + hex color tests | 1, 2 |
| `SymphonyOS/DesignSystem/NordicColors.swift` | landing palette under existing names + `Color(hex:)` | 2 |
| `SymphonyOS/DesignSystem/CardStyle.swift` | white card, ink button, cream input | 2 |
| `SymphonyOS/App/MainView.swift` | dock restyle; later the Snap-a-page wiring | 3, 10 |
| `SymphonyOS/Views/Timeline/TodayView.swift` | masthead, eyebrow section labels, carried-over tints | 3 |
| `SymphonyOS/Views/Capture/QuickCaptureBar.swift` | capture bar restyle | 3 |
| `SymphonyOS/Views/Components/SlideRow.swift` | tint tokens only | 3 |
| `SymphonyOS/Views/Inbox/InboxView.swift` | tints + card rows | 4 |
| `SymphonyOS/Views/Task/TaskDetailView.swift`, `Views/Event/EventDetailView.swift`, `Views/Settings/*.swift`, `Views/Shared/AuthView.swift`, `Views/Project/*.swift`, `Views/Routine/*.swift`, `Views/Contact/*.swift`, `Views/Playbook/FamilyRulesView.swift` | `.red`/`.blue` → tokens, eyebrow section labels | 4 |
| `SymphonyOS/Models/SymphonyTask.swift` | `scope`, `captureId`, `weekStart` | 5 |
| `SymphonyOS/Services/SyncEngine/RowMapper.swift` | read the three columns | 5 |
| `SymphonyOS/Services/SyncEngine/SyncEngine.swift` | push `week_start` when set | 5 |
| `SymphonyOSTests/SyncSerializationTests.swift` | `week_start` serialization | 5 |
| `SymphonyOS/ViewModels/TimelineViewModel.swift` | `TimelineItem` enrichment, `Source`, `ChildItem`, child grouping, event-note merge | 6 |
| `SymphonyOSTests/TimelineEnrichmentTests.swift` (new) | grouping + source tests | 6 |
| `SymphonyOS/Views/Timeline/TodayView.swift` | pass `eventNotes` into `buildTimeline` | 6 |
| `SymphonyOS/Views/Timeline/TimelineItemCard.swift` | plain row vs block, `SourcePill`, `ChildRow`, context icons | 7 |
| `SymphonyOS/Services/PageParse.swift` (new) | pure: window, validation, placement → task fields, week anchor | 8 |
| `SymphonyOSTests/PageParseTests.swift` (new) | pure tests | 8 |
| `SymphonyOS/Services/PageIngest.swift` (new) | upload, invoke `parse-page`, commit | 9 |
| `SymphonyOS/Models/FamilyMember.swift` | `current(in:for:)` lookup | 9 |
| `SymphonyOS/ViewModels/TaskViewModel.swift` | `createTask(fields:userId:)` | 9 |
| `SymphonyOS/Services/DocumentIngest.swift` | `attach(entityType:)`; delete `extract` + `ScanExtraction` | 9, 10 |
| `SymphonyOS/Views/Capture/PageReviewSheet.swift` (new) | review + commit UI | 10 |
| `SymphonyOS/Views/Capture/ScanReviewSheet.swift` | deleted | 10 |
| `SymphonyOSUITests/LandingParityUITests.swift` (new) | screenshots of Today, Inbox, Add sheet | 11 |

---

## Checkpoint 1 — Skin

### Task 1: Bundle the fonts and point Typography at them

**Files:**
- Create: `SymphonyOS/Resources/Fonts/CrimsonPro-Regular.ttf`, `CrimsonPro-Italic.ttf`, `CrimsonPro-SemiBold.ttf`, `DMSans-Regular.ttf`, `DMSans-Medium.ttf`, `DMSans-SemiBold.ttf`
- Modify: `SymphonyOS/App/Info.plist`
- Modify: `SymphonyOS/DesignSystem/Typography.swift` (whole file)
- Test: `SymphonyOSTests/DesignSystemTests.swift` (new)

**Interfaces:**
- Produces: `Font.displayLarge/.displayMedium/.displaySmall/.displayItalic/.bodyLarge/.bodyMedium/.bodySmall/.bodyLargeBold/.bodyMediumBold/.bodySmallBold/.captionText/.captionBold/.eyebrow` and `View.eyebrowStyle()`.

- [ ] **Step 1: Write the failing font-resolution test**

Create `SymphonyOSTests/DesignSystemTests.swift`:

```swift
import Testing
import Foundation
#if canImport(UIKit)
import UIKit
#endif
@testable import Symphony

/// The app shipped for months with `Font.custom("InstrumentSerif-Regular")`
/// and no font files in the bundle — SwiftUI silently fell back to San
/// Francisco. This guards the bundled faces by PostScript name.
struct DesignSystemTests {
    static let requiredFonts = [
        "CrimsonPro-Regular", "CrimsonPro-Italic", "CrimsonPro-SemiBold",
        "DMSans-Regular", "DMSans-Medium", "DMSans-SemiBold",
    ]

    @Test(arguments: requiredFonts)
    func bundledFontResolves(name: String) {
        #if canImport(UIKit)
        #expect(UIFont(name: name, size: 12) != nil, "\(name) is not registered — check Info.plist UIAppFonts and the Resources/Fonts files")
        #endif
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run from `apple/SymphonyOS/`:
```bash
xcodegen generate && xcodebuild -scheme SymphonyOS -destination 'platform=iOS Simulator,id=BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E' -only-testing:SymphonyOSTests/DesignSystemTests test 2>&1 | grep -E "Test Case|error:|passed|failed" | tail -20
```
Expected: 6 failures, each "is not registered".

- [ ] **Step 3: Download the six static TTFs**

```bash
mkdir -p SymphonyOS/Resources/Fonts && cd SymphonyOS/Resources/Fonts
curl -sSL -o CrimsonPro-Regular.ttf  "https://fonts.gstatic.com/s/crimsonpro/v28/q5uUsoa5M_tv7IihmnkabC5XiXCAlXGks1WZzm18OJE_VNWoyQ.ttf"
curl -sSL -o CrimsonPro-SemiBold.ttf "https://fonts.gstatic.com/s/crimsonpro/v28/q5uUsoa5M_tv7IihmnkabC5XiXCAlXGks1WZEGp8OJE_VNWoyQ.ttf"
curl -sSL -o CrimsonPro-Italic.ttf   "https://fonts.gstatic.com/s/crimsonpro/v28/q5uSsoa5M_tv7IihmnkabAReu49Y_Bo-HVKMBi6Ue5s7dtC4yZNE.ttf"
curl -sSL -o DMSans-Regular.ttf      "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxhTmf3ZGMZpg.ttf"
curl -sSL -o DMSans-Medium.ttf       "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAkJxhTmf3ZGMZpg.ttf"
curl -sSL -o DMSans-SemiBold.ttf     "https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAfJthTmf3ZGMZpg.ttf"
for f in *.ttf; do echo "$f -> $(fc-scan --format '%{postscriptname}\n' "$f")"; done
```
Expected: each file's PostScript name equals its basename without `.ttf`. If a URL has rotated, get fresh ones with `curl -sL "https://fonts.google.com/download/list?family=Crimson%20Pro" | sed "1s/^)]}'//"` and pick the `static/` entries. Both families are SIL OFL 1.1.

- [ ] **Step 4: Register the fonts in Info.plist**

In `SymphonyOS/App/Info.plist`, add before `<key>UIApplicationSceneManifest</key>`:

```xml
	<key>UIAppFonts</key>
	<array>
		<string>CrimsonPro-Regular.ttf</string>
		<string>CrimsonPro-Italic.ttf</string>
		<string>CrimsonPro-SemiBold.ttf</string>
		<string>DMSans-Regular.ttf</string>
		<string>DMSans-Medium.ttf</string>
		<string>DMSans-SemiBold.ttf</string>
	</array>
```
(Xcode flattens resources into the bundle root, so bare filenames are correct.)

- [ ] **Step 5: Replace Typography.swift**

Overwrite `SymphonyOS/DesignSystem/Typography.swift`:

```swift
import SwiftUI

// MARK: - Typography (landing-page kit)
//
// Crimson Pro — display (mastheads, block titles, the italic note line)
// DM Sans — body, captions, eyebrows
// Both are bundled under Resources/Fonts and registered via Info.plist
// UIAppFonts. `DesignSystemTests.bundledFontResolves` fails if one goes missing.

extension Font {
    // MARK: Display (Crimson Pro)
    static let displayLarge  = Font.custom("CrimsonPro-Regular", size: 34)
    static let displayMedium = Font.custom("CrimsonPro-Regular", size: 24)
    static let displaySmall  = Font.custom("CrimsonPro-SemiBold", size: 18)
    /// The one-line serif note on a block card.
    static let displayItalic = Font.custom("CrimsonPro-Italic", size: 14)

    // MARK: Body (DM Sans)
    static let bodyLarge  = Font.custom("DMSans-Regular", size: 17)
    static let bodyMedium = Font.custom("DMSans-Regular", size: 15)
    static let bodySmall  = Font.custom("DMSans-Regular", size: 13)

    static let bodyLargeBold  = Font.custom("DMSans-SemiBold", size: 17)
    static let bodyMediumBold = Font.custom("DMSans-SemiBold", size: 15)
    static let bodySmallBold  = Font.custom("DMSans-SemiBold", size: 13)

    // MARK: Caption
    static let captionText = Font.custom("DMSans-Regular", size: 11)
    static let captionBold = Font.custom("DMSans-Medium", size: 11)

    /// Tracked uppercase section label (MORNING, AFTERNOON…). Pair with
    /// `.eyebrowStyle()` for the tracking + case.
    static let eyebrow = Font.custom("DMSans-Medium", size: 11)
}

extension View {
    /// Landing `.section-eyebrow`: 11pt medium, uppercase, 1.2pt tracking, muted.
    func eyebrowStyle() -> some View {
        self.font(.eyebrow)
            .textCase(.uppercase)
            .kerning(1.2)
            .foregroundStyle(Color.textTertiary)
    }
}
```

- [ ] **Step 6: Remove the dead `FontLoader` call**

```bash
grep -rn "FontLoader" SymphonyOS
```
Delete every call site found (expected: one `FontLoader.registerFonts()` in `SymphonyOS/App/SymphonyApp.swift`). The enum itself was removed with the file rewrite above.

- [ ] **Step 7: Regenerate, build, run the test**

```bash
xcodegen generate && xcodebuild -scheme SymphonyOS -destination 'platform=iOS Simulator,id=BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E' -only-testing:SymphonyOSTests/DesignSystemTests test 2>&1 | grep -E "Test Case|error:|passed|failed" | tail -20
```
Expected: 6 passed, build clean. Also confirm the fonts are in the built app:
```bash
ls ~/Library/Developer/Xcode/DerivedData/SymphonyOS-*/Build/Products/Debug-iphonesimulator/Symphony.app/*.ttf
```
Expected: six files.

- [ ] **Step 8: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add apple/SymphonyOS/SymphonyOS/Resources apple/SymphonyOS/SymphonyOS/App/Info.plist apple/SymphonyOS/SymphonyOS/DesignSystem/Typography.swift apple/SymphonyOS/SymphonyOS/App/SymphonyApp.swift apple/SymphonyOS/SymphonyOSTests/DesignSystemTests.swift apple/SymphonyOS/SymphonyOS.xcodeproj
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): bundle Crimson Pro + DM Sans; the app shipped with no font files

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

---

### Task 2: Landing palette and card style

**Files:**
- Modify: `SymphonyOS/DesignSystem/NordicColors.swift` (whole file)
- Modify: `SymphonyOS/DesignSystem/CardStyle.swift` (whole file)
- Test: `SymphonyOSTests/DesignSystemTests.swift`

**Interfaces:**
- Produces: `Color(hex: UInt32)`; tokens `bgBase, bgElevated, bgSurface, bgWarm, textPrimary, textSecondary, textTertiary, textLight, primaryTint, primaryLight, accentBg, ink, infoBlue, infoBlueBg, successGreen, successGreenBg, cardBorder, cardShadow, coachingTint, coachingBg, feedbackGreen/Amber/Red, contextWork/Family/Personal, status*, block*, memberColor(_:)`; `View.cardStyle(padding:)`, `ButtonStyle.symphony` (ink), `ButtonStyle.symphonySecondary` (cream pill), `TextFieldStyle.symphony`.

- [ ] **Step 1: Write the failing hex test**

Append to `DesignSystemTests` in `SymphonyOSTests/DesignSystemTests.swift`:

```swift
    @Test func hexInitializerProducesExactChannels() {
        #if canImport(UIKit)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(Color(hex: 0xD97706)).getRed(&r, green: &g, blue: &b, alpha: &a)
        #expect(Int((r * 255).rounded()) == 0xD9)
        #expect(Int((g * 255).rounded()) == 0x77)
        #expect(Int((b * 255).rounded()) == 0x06)
        #expect(a == 1)
        #endif
    }
```

- [ ] **Step 2: Run it to verify it fails**

Same test command as Task 1 Step 7. Expected: compile error, `Color` has no `init(hex:)`.

- [ ] **Step 3: Replace NordicColors.swift**

```swift
import SwiftUI

// MARK: - Landing-page palette
//
// Values are verbatim from landing/index.html `:root`. Token NAMES are the
// ones the app already uses so every call site restyles without moving.

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }

    // MARK: Ground
    static let bgBase     = Color(hex: 0xFAF7F2)   // --bg
    static let bgElevated = Color(hex: 0xFFFFFF)   // --card
    static let bgSurface  = Color(hex: 0xF0EBE3)   // --bg-deep
    static let bgWarm     = Color(hex: 0xF5EFE7)   // --bg-warm

    // MARK: Text
    static let textPrimary   = Color(hex: 0x2C2520) // --text
    static let textSecondary = Color(hex: 0x6B5E54) // --text-secondary
    static let textTertiary  = Color(hex: 0x9B8E84) // --text-muted
    static let textLight     = Color(hex: 0xBEB3A9) // --text-light

    // MARK: Accent (amber) + ink
    static let primaryTint  = Color(hex: 0xD97706)  // --amber
    static let primaryLight = Color(hex: 0xF59E0B)  // --amber-soft
    static let accentBg     = Color(hex: 0xFEF3C7)  // --amber-bg
    /// Primary buttons and the active dock tab — the landing's `.btn-primary`.
    static let ink          = Color(hex: 0x2C2520)

    // MARK: Info / success
    static let infoBlue       = Color(hex: 0x2563EB) // --blue
    static let infoBlueBg     = Color(hex: 0xDBEAFE) // --blue-bg
    static let successGreen   = Color(hex: 0x059669) // --green
    static let successGreenBg = Color(hex: 0xD1FAE5) // --green-bg

    // MARK: Card chrome
    static let cardBorder = Color(hex: 0xE8E0D8)                       // --card-border
    static let cardShadow = Color(hex: 0x2C2520).opacity(0.06)         // --card-shadow

    // MARK: Context / Domain (unchanged)
    static let contextWork     = Color(hue: 220/360, saturation: 0.55, brightness: 0.55)
    static let contextFamily   = Color(hue: 30/360,  saturation: 0.65, brightness: 0.55)
    static let contextPersonal = Color(hue: 270/360, saturation: 0.45, brightness: 0.55)

    // MARK: Coaching / Playbook → amber family
    static let coachingTint = primaryTint
    static let coachingBg   = accentBg

    // MARK: Feedback
    static let feedbackGreen = successGreen
    static let feedbackAmber = primaryTint
    static let feedbackRed   = Color(hex: 0xB91C1C)

    // MARK: Status
    static let statusActive    = successGreen
    static let statusOnHold    = primaryTint
    static let statusCompleted = infoBlue

    // MARK: Block Types (unchanged)
    static let blockSolo       = Color(hue: 30/360,  saturation: 0.08, brightness: 0.40)
    static let blockTransition = Color(hue: 30/360,  saturation: 0.08, brightness: 0.40)
    static let blockRoutine    = Color(hue: 40/360,  saturation: 0.60, brightness: 0.50)
    static let blockConnection = Color(hue: 145/360, saturation: 0.35, brightness: 0.45)
    static let blockTogether   = Color(hue: 220/360, saturation: 0.50, brightness: 0.50)
    static let blockBuffer     = Color(hue: 0/360,   saturation: 0.00, brightness: 0.45)
    static let blockDeparture  = Color(hue: 25/360,  saturation: 0.60, brightness: 0.50)
    static let blockPartner    = Color(hue: 345/360, saturation: 0.50, brightness: 0.50)
    static let blockSibling    = Color(hue: 270/360, saturation: 0.45, brightness: 0.50)
    static let blockHousehold  = Color(hue: 175/360, saturation: 0.45, brightness: 0.45)
}

// MARK: - Family member colors (unchanged)

extension Color {
    static func memberColor(_ name: String) -> Color {
        switch name.lowercased() {
        case "blue":   return Color(hue: 220/360, saturation: 0.55, brightness: 0.60)
        case "purple": return Color(hue: 270/360, saturation: 0.48, brightness: 0.60)
        case "teal":   return Color(hue: 175/360, saturation: 0.50, brightness: 0.50)
        case "orange": return Color(hue: 25/360,  saturation: 0.70, brightness: 0.65)
        case "green":  return Color(hue: 145/360, saturation: 0.45, brightness: 0.50)
        case "red":    return Color(hue: 0/360,   saturation: 0.55, brightness: 0.60)
        case "pink":   return Color(hue: 340/360, saturation: 0.50, brightness: 0.65)
        case "yellow": return Color(hue: 45/360,  saturation: 0.70, brightness: 0.68)
        case "indigo": return Color(hue: 245/360, saturation: 0.50, brightness: 0.60)
        default:       return .primaryTint
        }
    }
}

// MARK: - Semantic Colors

extension ShapeStyle where Self == Color {
    static var symphonyBackground: Color { .bgBase }
    static var symphonyCard: Color { .bgElevated }
    static var symphonyPrimary: Color { .primaryTint }
}
```

- [ ] **Step 4: Replace CardStyle.swift**

```swift
import SwiftUI

// MARK: - Card (landing `.card`: white, warm 1px border, soft shadow, r16)

struct CardStyle: ViewModifier {
    var padding: CGFloat = 16
    var cornerRadius: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Color.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .strokeBorder(Color.cardBorder, lineWidth: 1)
            )
            .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
    }
}

extension View {
    func cardStyle(padding: CGFloat = 16, cornerRadius: CGFloat = 16) -> some View {
        modifier(CardStyle(padding: padding, cornerRadius: cornerRadius))
    }
}

// MARK: - Coaching Card (amber tint)

struct CoachingCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .background(Color.coachingBg)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(Color.coachingTint.opacity(0.3), lineWidth: 1)
            )
            .shadow(color: Color.cardShadow, radius: 6, x: 0, y: 2)
    }
}

extension View {
    func coachingCardStyle() -> some View { modifier(CoachingCardStyle()) }
}

// MARK: - Primary button (landing `.btn-primary`: ink pill, white text)

struct SymphonyButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bodyMediumBold)
            .foregroundStyle(.white)
            .padding(.horizontal, 22)
            .padding(.vertical, 13)
            .background(Color.ink)
            .clipShape(Capsule())
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == SymphonyButtonStyle {
    static var symphony: SymphonyButtonStyle { SymphonyButtonStyle() }
}

// MARK: - Secondary button (landing `.btn-secondary`: cream pill, warm border)

struct SymphonySecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.bodyMediumBold)
            .foregroundStyle(Color.textPrimary)
            .padding(.horizontal, 22)
            .padding(.vertical, 13)
            .background(Color.bgWarm)
            .clipShape(Capsule())
            .overlay(Capsule().strokeBorder(Color.cardBorder, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.85 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == SymphonySecondaryButtonStyle {
    static var symphonySecondary: SymphonySecondaryButtonStyle { SymphonySecondaryButtonStyle() }
}

// MARK: - Input (cream field, warm border, r10)

struct SymphonyTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(.bodyLarge)
            .padding(12)
            .background(Color.bgSurface)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .strokeBorder(Color.cardBorder, lineWidth: 1)
            )
    }
}

extension TextFieldStyle where Self == SymphonyTextFieldStyle {
    static var symphony: SymphonyTextFieldStyle { SymphonyTextFieldStyle() }
}
```

- [ ] **Step 5: Build and run DesignSystemTests**

Same command as Task 1 Step 7. Expected: 7 passed, no compile errors anywhere (the token names are unchanged; `coachingTint`/`coachingBg` are still present).

- [ ] **Step 6: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add apple/SymphonyOS/SymphonyOS/DesignSystem apple/SymphonyOS/SymphonyOSTests/DesignSystemTests.swift
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): landing palette + white-card style under the existing token names

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

---

### Task 3: Dock, Today masthead, capture bar, swipe tints

**Files:**
- Modify: `SymphonyOS/App/MainView.swift:55-110` (`SymphonyDock`)
- Modify: `SymphonyOS/Views/Timeline/TodayView.swift` (masthead ~120-200, `TimelineSectionView`, `CarriedOverSection`, `InboxSectionView`)
- Modify: `SymphonyOS/Views/Capture/QuickCaptureBar.swift:14-85`
- Modify: `SymphonyOS/Views/Components/SlideRow.swift:57-58, 76-80, 96-101`
- Modify: `SymphonyOS/Views/Timeline/TimelineItemCard.swift:96-134` (action tints only; the card body is rebuilt in Task 7)
- Modify: `SymphonyOS/Views/Inbox/InboxView.swift:103-113, 223-224`

No unit test covers layout; the check is the simulator screenshot in Step 7.

- [ ] **Step 1: Restyle the dock**

In `SymphonyOS/App/MainView.swift`, replace the body of `SymphonyDock` (keep the struct signature and the `tab(_:icon:label:)` / `addSlot` names):

```swift
    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            tab(.today, icon: "sun.max", label: "Today")
            tab(.inbox, icon: "tray", label: "Inbox")
            addSlot
            tab(.projects, icon: "folder", label: "Projects")
            tab(.more, icon: "ellipsis", label: "More")
        }
        .padding(.top, 10)
        .padding(.horizontal, 6)
        .background(
            Color.bgBase.opacity(0.97)
                .overlay(alignment: .top) {
                    Rectangle().fill(Color.cardBorder).frame(height: 1)
                }
                .ignoresSafeArea(edges: .bottom)
        )
    }

    private func tab(_ t: AppTab, icon: String, label: String) -> some View {
        Button {
            activeTab = t
        } label: {
            VStack(spacing: 3) {
                Image(systemName: icon).font(.system(size: 20, weight: activeTab == t ? .semibold : .regular))
                Text(label).font(.captionBold)
            }
            .foregroundStyle(activeTab == t ? Color.ink : Color.textTertiary)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private var addSlot: some View {
        Button(action: onAdd) {
            Image(systemName: "plus")
                .font(.system(size: 24, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 56, height: 56)
                .background(Circle().fill(Color.ink))
                .shadow(color: Color.cardShadow, radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .frame(maxWidth: .infinity)
        .offset(y: -8)
    }
```

- [ ] **Step 2: Restyle the Today masthead and section labels**

In `SymphonyOS/Views/Timeline/TodayView.swift`:

(a) In `editorialHeader`, the date line under the title: change `.font(.bodySmall)` to `.font(.bodySmall)` (unchanged) and its color to `Color.textTertiary` (already). Change the three round icon buttons' `.background(Color.bgSurface.opacity(0.6))` to `.background(Color.bgSurface)` and add `.overlay(Circle().strokeBorder(Color.cardBorder, lineWidth: 1))` after each `.clipShape(Circle())`. The "Today" jump pill: replace its `.foregroundStyle(Color.primaryTint)` / `.background(Color.primaryTint.opacity(0.1))` with `.foregroundStyle(Color.ink)` / `.background(Color.bgWarm)` and add `.overlay(Capsule().strokeBorder(Color.cardBorder, lineWidth: 1))`.

(b) In `TimelineSectionView.body`, replace the title block:

```swift
            Text(title)
                .eyebrowStyle()
                .padding(.horizontal, 20)
                .padding(.top, 24)
                .padding(.bottom, 2)
```

(c) In `InboxSectionView.body`, replace the title `Text(title)...kerning(1.2)` chain with `Text(title).eyebrowStyle()`, and the count pill's `Color.primaryTint` / `.opacity(0.1)` with `Color.textSecondary` / `Color.bgSurface`.

(d) In `CarriedOverSection`, `Color.feedbackAmber` stays (it now resolves to the landing amber). Replace the two `.font(.system(size: 10, weight: .semibold))` chevrons and the `.font(.system(size: 11, weight: .semibold))` arrow with `.font(.captionBold)`.

(e) `searchField`: `.background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 12))` → `.background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 12))` and add `.overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(Color.cardBorder, lineWidth: 1))`.

(f) Empty state: the 64pt rounded square → `.fill(Color.bgSurface)` stays; `Text("Your day is clear").font(.displayMedium)`.

- [ ] **Step 3: Restyle QuickCaptureBar**

In `SymphonyOS/Views/Capture/QuickCaptureBar.swift` replace the `.padding(.horizontal, 20)` … `.overlay(alignment: .top) { … }` chain on the outer `HStack` with:

```swift
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.cardShadow, radius: 12, x: 0, y: 4)
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
```
And the three icons: plus → `.foregroundStyle(Color.textTertiary)`; submit arrow → `.foregroundStyle(Color.ink)`; camera → `.foregroundStyle(Color.textSecondary)`. Keep the `.symbolRenderingMode(.hierarchical)` lines.

The bar now floats as a card over the cream ground instead of a frosted strip. In `TodayView` and `InboxView` the bar is placed with `VStack { Spacer(); QuickCaptureBar(...) }` — no change needed.

- [ ] **Step 4: Swipe tints**

`SymphonyOS/Views/Components/SlideRow.swift`: replace `private let completeGreen = Color(red: 0.16, green: 0.48, blue: 0.33)` with `private let completeGreen = Color.successGreen`. Replace the three `.font(.system(size: 18, weight: .bold))` / `(size: 18, weight: .medium)` / `(size: 11, weight: .semibold)` with `.font(.system(size: 18, weight: .bold))` (keep, SF Symbol), `.font(.system(size: 18, weight: .medium))` (keep), and `.font(.captionBold)` for the label. Nothing else in this file changes.

`SymphonyOS/Views/Timeline/TimelineItemCard.swift`: delete `pushAmber` and `neutralSlate`; use `tint: Color.primaryTint` for Push, `Color.textSecondary` for Context and Skip, `Color.infoBlue` for More and Details.

`SymphonyOS/Views/Inbox/InboxView.swift`: delete `todayAmber` and `neutralSlate`; Today → `Color.primaryTint`, When → `Color.infoBlue`, More → `Color.textSecondary`.

- [ ] **Step 5: Build**

```bash
xcodebuild -scheme SymphonyOS -destination 'platform=iOS Simulator,id=BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E' build 2>&1 | grep -E "error:|BUILD" | tail -10
```
Expected: `BUILD SUCCEEDED`.

- [ ] **Step 6: Run the full unit suite**

Unit test command from Global Constraints. Expected: all green (CarriedOverTests, SyncSerializationTests, DesignSystemTests).

- [ ] **Step 7: Look at it**

Boot the simulator, install, launch, and screenshot:
```bash
xcrun simctl boot BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E 2>/dev/null; open -a Simulator
APP=$(ls -d ~/Library/Developer/Xcode/DerivedData/SymphonyOS-*/Build/Products/Debug-iphonesimulator/Symphony.app | head -1)
xcrun simctl install BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E "$APP"
xcrun simctl launch BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E com.scottkaufman.symphonyos
sleep 6; xcrun simctl io BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E screenshot /private/tmp/claude-501/-Users-scottkaufman-Developer-Developer-symphonyOS/26289c14-f58c-4f75-a4a7-497e2e285c3b/scratchpad/today-skin.png
```
If the simulator shows the sign-in screen, sign in as `symphonytest4444@gmail.com` / `SymphonyTest!2026` (scratch account) by tapping in the simulator, then screenshot again. Open the PNG with the Read tool and confirm: serif "Today" masthead, DM Sans date, MORNING eyebrow in muted ink, white cards with warm borders, cream dock with ink "+" circle, floating capture card. Fix anything that doesn't match before committing.

- [ ] **Step 8: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add -A apple/SymphonyOS/SymphonyOS
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): dock, masthead, capture bar and swipe tints in the landing kit

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

---

### Task 4: Card pass on the remaining screens

**Files:**
- Modify: `SymphonyOS/Views/Inbox/InboxView.swift` (empty state, `navigationTitle`)
- Modify: `SymphonyOS/Views/Task/TaskDetailView.swift`, `SymphonyOS/Views/Event/EventDetailView.swift`
- Modify: `SymphonyOS/Views/Shared/AuthView.swift:57`, `SymphonyOS/Views/Settings/SettingsView.swift:85`, `SymphonyOS/App/MainView.swift:333` (MoreView Sign Out)
- Modify: `SymphonyOS/Views/Project/ProjectListView.swift:66`, `Views/Routine/RoutineListView.swift:81`, `Views/Contact/ContactListView.swift:74`, `Views/Playbook/FamilyRulesView.swift:17`, `Views/Timeline/DateNavigator.swift:14,40`, `Views/Timeline/DomainSwitcher.swift:20`, `Views/Settings/CalendarSettingsView.swift:15`

- [ ] **Step 1: Replace hard-coded colors**

```bash
grep -rn '\.foregroundStyle(\.red)' SymphonyOS
```
Replace every `.foregroundStyle(.red)` with `.foregroundStyle(Color.feedbackRed)` (AuthView error text, SettingsView and MoreView Sign Out, TaskDetailView Clear/Delete, InboxView delete). Confirm afterwards:
```bash
grep -rn '\.blue\b\|\.red\b\|Color(red:' SymphonyOS/Views SymphonyOS/App
```
Expected: no matches.

- [ ] **Step 2: Section labels become eyebrows**

In `TaskDetailView.swift` and `EventDetailView.swift`, every `Label("Schedule", systemImage: "calendar").font(.bodySmallBold).foregroundStyle(Color.textSecondary)`-style section header (Schedule, Context, Assign, Project, Notes, Links, Phone, Location, Photos, Attachments — grep `.font(.bodySmallBold)` inside those two files to find them) becomes:

```swift
                    Label("Schedule", systemImage: "calendar")
                        .eyebrowStyle()
```
Keep the `systemImage`. The title `TextField` at the top of `TaskDetailView` keeps `.font(.displayMedium)` (now Crimson Pro 24).

- [ ] **Step 3: Empty-state glyphs and nav-title sizes**

The five `.font(.system(size: 48))` SF Symbol glyphs (Inbox, Projects, Routines, Contacts, FamilyRules empty states) stay system-sized but recolor to `Color.textLight`. Their headline `Text` gets `.font(.displayMedium)`; their subtitle keeps `.bodySmall`.

`DateNavigator.swift` and `DomainSwitcher.swift`: replace `.font(.system(size: 16, weight: .semibold))` with `.font(.bodyMediumBold)` and `.font(.system(size: 13, weight: isSelected ? .semibold : .regular))` with `isSelected ? .bodySmallBold : .bodySmall`. `DomainSwitcher` selected chip: `Color.ink` text on `Color.bgElevated` with a `cardBorder` stroke; unselected `Color.textSecondary` on clear.

`InboxView`: `.navigationTitle("Inbox (\(filteredTasks.count))")` → `.navigationTitle("Inbox")` (the landing sidebar shows a quiet count badge; the phone title stays plain — counts on titles read as scoreboards).

`MoreView` list rows: add `.listRowBackground(Color.bgElevated)` on each `Section` and `.scrollContentBackground(.hidden).background(Color.bgBase)` on the `List`.

- [ ] **Step 4: Build, test, screenshot Inbox and a task sheet**

Build + unit-test commands from Global Constraints. Then, with the app running in the simulator, tap the Inbox tab and screenshot to `.../scratchpad/inbox-skin.png`; tap a row to open the detail sheet and screenshot to `.../scratchpad/task-sheet-skin.png`. Read both PNGs. Expected: white card rows with warm borders on cream, eyebrow section labels, Crimson Pro title in the sheet, no stray blue/red system colors.

- [ ] **Step 5: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add -A apple/SymphonyOS/SymphonyOS
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): card pass on Inbox, More, detail sheets and empty states

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

**Checkpoint 1 ships here.** Push `ios-sliders` (`git -C <worktree> push origin ios-sliders`) so Xcode Cloud produces a TestFlight build Scott can look at on-device.

---

## Checkpoint 2 — The block card

### Task 5: Sync `scope`, `capture_id`, `week_start`

**Files:**
- Modify: `SymphonyOS/Models/SymphonyTask.swift`
- Modify: `SymphonyOS/Services/SyncEngine/RowMapper.swift:47-83`
- Modify: `SymphonyOS/Services/SyncEngine/SyncEngine.swift:426-465`
- Test: `SymphonyOSTests/SyncSerializationTests.swift`

**Interfaces:**
- Produces: `SymphonyTask.scope: String?`, `.captureId: UUID?`, `.weekStart: Date?`. Push sends `week_start` (local `yyyy-MM-dd`) only when `weekStart != nil`; never sends `scope` or `capture_id`.

- [ ] **Step 1: Write the failing serialization tests**

Append inside `struct SyncSerializationTests` in `SymphonyOSTests/SyncSerializationTests.swift`:

```swift
    @Test func taskRowSendsWeekStartAsLocalDateOnlyWhenSet() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Plan the week")
        task.bucket = "week"
        // 23:30 local — ISO/UTC would land on the wrong day west of Greenwich.
        task.weekStart = Calendar.current.date(
            bySettingHour: 23, minute: 30, second: 0,
            of: Calendar.current.startOfDay(for: Date())
        )!
        context.insert(task)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        #expect(row["week_start"]?.stringValue == f.string(from: task.weekStart!))
    }

    @Test func taskRowOmitsWeekStartScopeAndCaptureIdByDefault() throws {
        let context = try makeContext()
        let task = SymphonyTask(userId: UUID(), title: "Call plumber")
        task.scope = "compound"
        task.captureId = UUID()
        context.insert(task)
        try context.save()

        let row = try #require(SyncEngine.serializeRow(table: "tasks", id: task.id, context: context))
        // A blanket null would wipe a week placement made on the web; scope and
        // capture_id are server/web-owned and the phone never writes them.
        #expect(row["week_start"] == nil)
        #expect(row["scope"] == nil)
        #expect(row["capture_id"] == nil)
    }
```

Also add `"week_start", "capture_id",` to the `prodColumns` set in `taskRowHasNoPhantomColumns` (both exist in prod: the web writes `week_start` since 2026-07-15 and `extract-email` writes `capture_id`).

- [ ] **Step 2: Run to verify failure**

`-only-testing:SymphonyOSTests/SyncSerializationTests`. Expected: compile errors `weekStart`, `scope`, `captureId` not members of `SymphonyTask`.

- [ ] **Step 3: Add the model fields**

In `SymphonyOS/Models/SymphonyTask.swift`, after `var parentTaskId: UUID?` add:

```swift
    /// Who can SEE it: "individual" | "couple" | "compound". Read-only on the
    /// phone — the web derives it (scopeForDomain) and the phone never writes it.
    var scope: String?
    /// Set when this task was extracted from a capture (school email, paper
    /// page). Read-only on the phone; drives the "From an email" source pill.
    var captureId: UUID?
    /// Which week a bucket=="week" row belongs to (placement cascade). Local
    /// midnight. Sent as a DATE column — see `SyncEngine.taskRow`.
    var weekStart: Date?
```
In `init`, after `self.parentTaskId = nil` add `self.scope = nil`, `self.captureId = nil`, `self.weekStart = nil`. In `columnMap` add `"scope": "scope"`, `"captureId": "capture_id"`, `"weekStart": "week_start"`.

- [ ] **Step 4: Read them on pull**

In `RowMapper.taskFromRow`, after `task.parentTaskId = row.uuid("parent_task_id")` add:

```swift
        task.scope = row.string("scope")
        task.captureId = row.uuid("capture_id")
        task.weekStart = row.date("week_start")
```
Check `row.date(_:)` at line ~348 handles a bare `yyyy-MM-dd` string. If it only parses ISO-8601 timestamps, add a date-only fallback inside `date(_:)`:

```swift
        if let s = self[key]?.stringValue, s.count == 10 {
            let f = DateFormatter()
            f.dateFormat = "yyyy-MM-dd"; f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = .current
            if let d = f.date(from: s) { return d }
        }
```

- [ ] **Step 5: Send `week_start` on push**

In `SyncEngine.taskRow`, after the `capture_meta` block and before `return row`:

```swift
        // Only when set: a blanket null would wipe a week placement made on the
        // web. DATE column → local yyyy-MM-dd (dateOnly), never ISO.
        if let ws = t.weekStart {
            row["week_start"] = dateOnly(ws)
        }
```

- [ ] **Step 6: Run the tests**

`-only-testing:SymphonyOSTests/SyncSerializationTests`. Expected: all pass including the two new ones and `taskRowHasNoPhantomColumns`.

- [ ] **Step 7: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add apple/SymphonyOS/SymphonyOS/Models/SymphonyTask.swift apple/SymphonyOS/SymphonyOS/Services/SyncEngine apple/SymphonyOS/SymphonyOSTests/SyncSerializationTests.swift
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): sync scope, capture_id and week_start on tasks

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

---

### Task 6: Enrich `TimelineItem` — children, source, notes, links, phone

**Files:**
- Modify: `SymphonyOS/ViewModels/TimelineViewModel.swift`
- Modify: `SymphonyOS/Views/Timeline/TodayView.swift` (`rebuildTimeline`, add an `@Query` for `EventNote`)
- Test: `SymphonyOSTests/TimelineEnrichmentTests.swift` (new)

**Interfaces:**
- Produces on `TimelineItem`: `notes: String?`, `links: [TaskLink]`, `phoneNumber: String?`, `locationPlaceId: String?`, `source: TimelineItem.Source?`, `children: [TimelineItem.ChildItem]`, computed `isBlock: Bool`, `noteLine: String?`.
- `TimelineItem.Source: String { case email, calendar, shared }` with `label` ("From an email", "From the calendar", "Shared").
- `TimelineItem.ChildItem: Identifiable { id: UUID, title: String, completed: Bool, assignedTo: [UUID] }`.
- `TimelineViewModel.buildTimeline(... eventItems:, eventNotes: [EventNote] = [])`.
- `static func source(type:captureId:scope:) -> Source?` (pure, tested).

- [ ] **Step 1: Write the failing tests**

Create `SymphonyOSTests/TimelineEnrichmentTests.swift`:

```swift
import Testing
import Foundation
@testable import Symphony

/// The landing's block card renders per-kid child items under their parent and
/// a source pill. These pin the data side: subtasks attach to an on-day parent,
/// orphans stay excluded, and the pill derives from capture/scope/type.
private func task(_ title: String, today: Bool = true, parent: UUID? = nil, createdOffset: TimeInterval = 0) -> SymphonyTask {
    let t = SymphonyTask(userId: UUID(), title: title, scheduledFor: today ? Calendar.current.startOfDay(for: Date()) : nil)
    t.isAllDay = today
    t.parentTaskId = parent
    t.createdAt = Date(timeIntervalSince1970: 1_000_000 + createdOffset)
    return t
}

private func build(_ tasks: [SymphonyTask]) -> [TimelineItem] {
    let vm = TimelineViewModel()
    vm.buildTimeline(tasks: tasks, routines: [], instances: [], playbookBlocks: [], playbookInstances: [],
                     date: Date(), domainFilter: .all, showCoaching: false)
    return vm.timelineItems
}

struct TimelineEnrichmentTests {
    @Test func subtasksAttachToTheirOnDayParentInCreatedOrder() {
        let parent = task("School — Picture Day")
        let mia = task("School colors laid out", today: false, parent: parent.id, createdOffset: 20)
        let liam = task("Payment envelope in backpack", today: false, parent: parent.id, createdOffset: 10)
        let items = build([parent, mia, liam])
        #expect(items.count == 1)
        #expect(items[0].children.map(\.title) == ["Payment envelope in backpack", "School colors laid out"])
        #expect(items[0].isBlock)
    }

    @Test func orphanSubtasksStayOffTheDay() {
        // Parent is not on the day → the child is excluded (documented iOS/web divergence, unchanged).
        let child = task("Loose child", parent: UUID())
        #expect(build([child]).isEmpty)
    }

    @Test func childCompletionIsCarried() {
        let parent = task("Parent")
        let done = task("Done child", today: false, parent: parent.id)
        done.completed = true
        #expect(build([parent, done])[0].children.first?.completed == true)
    }

    @Test func plainTaskIsNotABlock() {
        let items = build([task("Pack lunches")])
        #expect(items[0].isBlock == false)
        #expect(items[0].source == nil)
    }

    @Test func notesLinksPhoneMakeABlock() {
        let a = task("A"); a.notes = "Bring the form"
        let b = task("B"); b.links = [TaskLink(url: "https://x", title: nil)]
        let c = task("C"); c.phoneNumber = "410-555-0100"
        let items = build([a, b, c])
        #expect(items.allSatisfy(\.isBlock))
        #expect(items[0].noteLine == "Bring the form")
    }

    @Test func noteLineIsTheFirstNonEmptyLine() {
        let a = task("A"); a.notes = "\n\nFirst line here\nSecond"
        #expect(build([a])[0].noteLine == "First line here")
    }

    @Test func sourceDerivation() {
        #expect(TimelineViewModel.source(type: .event, captureId: nil, scope: nil) == .calendar)
        #expect(TimelineViewModel.source(type: .task, captureId: UUID(), scope: "compound") == .email)
        #expect(TimelineViewModel.source(type: .task, captureId: nil, scope: "couple") == .shared)
        #expect(TimelineViewModel.source(type: .task, captureId: nil, scope: "compound") == .shared)
        #expect(TimelineViewModel.source(type: .task, captureId: nil, scope: "individual") == nil)
        #expect(TimelineViewModel.source(type: .routine, captureId: nil, scope: nil) == nil)
    }

    @Test func sharedSourceAloneMakesABlockButCalendarDoesNot() {
        let shared = task("Handoff — pickup"); shared.scope = "couple"
        #expect(build([shared])[0].isBlock)
        // A bare calendar event (no location/notes) renders as a plain row, like
        // "Team standup" on the landing.
        let event = TimelineItem(id: "gcal-1", type: .event, title: "Team standup", startTime: Date(), isAllDay: false,
                                 completed: false, context: nil, entityId: UUID(), eventKey: "1", source: .calendar)
        #expect(event.isBlock == false)
    }
}
```

- [ ] **Step 2: Run to verify failure**

`-only-testing:SymphonyOSTests/TimelineEnrichmentTests`. Expected: compile errors (`children`, `isBlock`, `source`, `noteLine` missing).

- [ ] **Step 3: Extend `TimelineItem`**

In `SymphonyOS/ViewModels/TimelineViewModel.swift`, replace the `TimelineItem` struct with:

```swift
struct TimelineItem: Identifiable {
    let id: String
    let type: ItemType
    let title: String
    let startTime: Date?
    let isAllDay: Bool
    var completed: Bool
    let context: String?
    let entityId: UUID
    var blockType: String? = nil
    var assignedTo: [UUID] = []
    var location: String? = nil
    /// Google event id — the actionable_instances entity_id for events
    /// (matches the web: entity_id = google_event_id).
    var eventKey: String? = nil

    // Context that surfaces on the card (landing: "every block carries everything you need")
    var notes: String? = nil
    var links: [TaskLink] = []
    var phoneNumber: String? = nil
    var locationPlaceId: String? = nil
    var source: Source? = nil
    var children: [ChildItem] = []

    enum ItemType: String {
        case task
        case routine
        case event
        case playbook
    }

    /// Where a block came from — the pill in its top-right corner.
    enum Source: String {
        case email, calendar, shared

        var label: String {
            switch self {
            case .email:    return "From an email"
            case .calendar: return "From the calendar"
            case .shared:   return "Shared"
            }
        }
    }

    /// A subtask rendered as a check-circle row under its parent.
    struct ChildItem: Identifiable, Equatable {
        let id: UUID
        let title: String
        var completed: Bool
        let assignedTo: [UUID]
    }

    /// Block (rich card) vs plain row. A bare calendar event is a plain row —
    /// the calendar pill only shows once the event carries something else.
    var isBlock: Bool {
        noteLine != nil
            || !links.isEmpty
            || phoneNumber != nil
            || location != nil
            || !children.isEmpty
            || source == .email
            || source == .shared
    }

    /// First non-empty line of `notes`, for the italic serif line.
    var noteLine: String? {
        guard let notes else { return nil }
        return notes
            .split(separator: "\n", omittingEmptySubsequences: true)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first { !$0.isEmpty }
    }

    var timeString: String? {
        guard let time = startTime else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "h:mm a"
        return formatter.string(from: time)
    }
}
```

- [ ] **Step 4: Group children and derive source in `buildTimeline`**

In `TimelineViewModel`:

(a) Change the signature to add a trailing parameter: `eventItems: [TimelineItem] = [], eventNotes: [EventNote] = []`.

(b) Add the pure derivation as a static method on `TimelineViewModel`:

```swift
    /// Source pill rule (spec §3): event → calendar; capture → email;
    /// couple/compound scope → shared; otherwise none.
    static func source(type: TimelineItem.ItemType, captureId: UUID?, scope: String?) -> TimelineItem.Source? {
        if type == .event { return .calendar }
        if captureId != nil { return .email }
        if scope == "couple" || scope == "compound" { return .shared }
        return nil
    }
```

(c) Before the `for task in tasks` loop, index the subtasks:

```swift
        // Subtasks attach to their parent's card. Not filtered by domain — they
        // inherit the parent's placement. Orphans (parent not on this day) are
        // excluded, the same stance as before.
        var childrenByParent: [UUID: [SymphonyTask]] = [:]
        for task in tasks {
            if let pid = task.parentTaskId { childrenByParent[pid, default: []].append(task) }
        }
```

(d) Keep `if task.parentTaskId != nil { continue }` in the loop (subtasks never become top-level items). Replace the `items.append(TimelineItem(...))` for tasks with:

```swift
            let kids = (childrenByParent[task.id] ?? [])
                .sorted { $0.createdAt < $1.createdAt }
                .map { TimelineItem.ChildItem(id: $0.id, title: $0.title, completed: $0.completed,
                                              assignedTo: $0.assignedToAll ?? ($0.assignedTo.map { [$0] } ?? [])) }
            items.append(TimelineItem(
                id: "task-\(task.id.uuidString)",
                type: .task,
                title: task.title,
                startTime: task.isAllDay ? nil : task.scheduledFor,
                isAllDay: task.isAllDay,
                completed: task.completed,
                context: task.context,
                entityId: task.id,
                assignedTo: task.assignedToAll ?? (task.assignedTo.map { [$0] } ?? []),
                location: task.location,
                notes: task.notes,
                links: task.links ?? [],
                phoneNumber: task.phoneNumber,
                locationPlaceId: task.locationPlaceId,
                source: Self.source(type: .task, captureId: task.captureId, scope: task.scope),
                children: kids
            ))
```

(e) In the events loop, merge the event note and stamp the source:

```swift
        for var event in eventItems {
            if let key = event.eventKey {
                let status = instances.first { ... }?.status      // unchanged
                event.completed = status == "completed" || status == "skipped"
                if let note = eventNotes.first(where: { $0.googleEventId == key }) {
                    event.notes = note.notes
                    event.links = note.links ?? []
                }
            }
            event.source = Self.source(type: .event, captureId: nil, scope: nil)
            items.append(event)
        }
```

- [ ] **Step 5: Pass event notes from TodayView**

In `SymphonyOS/Views/Timeline/TodayView.swift` add `@Query private var eventNotes: [EventNote]` beside the other queries, and in `rebuildTimeline()` add `eventNotes: eventNotes` after `eventItems: calendar.eventItems`.

- [ ] **Step 6: Run the tests**

`-only-testing:SymphonyOSTests/TimelineEnrichmentTests` then the whole `SymphonyOSTests`. Expected: all pass; `CarriedOverTests` still green.

- [ ] **Step 7: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add apple/SymphonyOS/SymphonyOS/ViewModels/TimelineViewModel.swift apple/SymphonyOS/SymphonyOS/Views/Timeline/TodayView.swift apple/SymphonyOS/SymphonyOSTests/TimelineEnrichmentTests.swift
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): TimelineItem carries notes, links, phone, source and child items

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

---

### Task 7: The two-density row

**Files:**
- Modify: `SymphonyOS/Views/Timeline/TimelineItemCard.swift` — replace `cardContent`, `typeIcon`; add `SourcePill`, `ChildRow`, `CheckCircle`, `contextRow`; keep `SlideRow` wiring, sheets, `toggleCompletion`, `setInstanceStatus`, `ContextBadge`, `AssigneeAvatars`.

**Interfaces:**
- Consumes: `TimelineItem.isBlock`, `.noteLine`, `.source`, `.children`, `.links`, `.phoneNumber`, `.location`, `.locationPlaceId`; `TaskViewModel.toggleComplete(_:)`; `SafariView` (existing, `Views/Components/SafariView.swift`).

- [ ] **Step 1: Replace `cardContent`**

In `TimelineItemCard`, replace the `cardContent` computed property and `typeIcon` with:

```swift
    @State private var safariURL: URL?

    @ViewBuilder
    private var cardContent: some View {
        if item.isBlock { blockContent } else { plainRow }
    }

    // MARK: Plain row — time · dot · title · check circle (landing "Just a list" row)

    private var plainRow: some View {
        HStack(spacing: 12) {
            Text(item.timeString ?? "")
                .font(.captionText)
                .foregroundStyle(Color.textTertiary)
                .frame(width: 52, alignment: .leading)

            Circle()
                .fill(isCompleted ? Color.textLight : accentColor)
                .frame(width: 6, height: 6)

            HStack(spacing: 6) {
                typeIcon
                Text(item.title)
                    .font(.bodyMedium)
                    .foregroundStyle(isCompleted ? Color.textTertiary : Color.textPrimary)
                    .strikethrough(isCompleted)
                    .lineLimit(2)
            }

            Spacer(minLength: 0)

            AssigneeAvatars(memberIds: item.assignedTo, members: familyMembers, size: 20)

            if item.type != .playbook {
                CheckCircle(checked: isCompleted) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { isCompleted.toggle() }
                    toggleCompletion()
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(Color.bgSurface, in: RoundedRectangle(cornerRadius: 10))
        .opacity(isCompleted ? 0.7 : 1.0)
    }

    // MARK: Block — rail · time + pill · serif title · note line · children · context row

    private var blockContent: some View {
        HStack(spacing: 0) {
            RoundedRectangle(cornerRadius: 2)
                .fill(isCompleted ? Color.textLight : Color.primaryTint)
                .frame(width: 3)

            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(item.timeString ?? (item.isAllDay ? "All day" : ""))
                        .font(.captionText)
                        .foregroundStyle(Color.textTertiary)
                    Spacer()
                    if let source = item.source { SourcePill(source: source) }
                }

                HStack(alignment: .top, spacing: 6) {
                    typeIcon
                    Text(item.title)
                        .font(.displaySmall)
                        .foregroundStyle(isCompleted ? Color.textTertiary : Color.textPrimary)
                        .strikethrough(isCompleted)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    AssigneeAvatars(memberIds: item.assignedTo, members: familyMembers, size: 20)
                }

                if let line = item.noteLine {
                    Text(line)
                        .font(.displayItalic)
                        .foregroundStyle(Color.textSecondary)
                        .lineLimit(2)
                }

                if !item.children.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(item.children) { child in
                            ChildRow(child: child, members: familyMembers) { toggleChild(child) }
                        }
                    }
                    .padding(.top, 2)
                }

                if hasContextRow { contextRow.padding(.top, 2) }
            }
            .padding(.leading, 12)
            .padding(.trailing, 14)
            .padding(.vertical, 12)
        }
        .background(item.type == .playbook ? Color.coachingBg : Color.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.cardBorder, lineWidth: 1))
        .shadow(color: Color.cardShadow, radius: 8, x: 0, y: 2)
        .opacity(isCompleted ? 0.7 : 1.0)
        .sheet(item: $safariURL) { url in SafariView(url: url) }
    }

    private var hasContextRow: Bool {
        !item.links.isEmpty || item.phoneNumber != nil || item.location != nil
    }

    /// Link · phone · directions — small muted icons that open on tap.
    private var contextRow: some View {
        HStack(spacing: 14) {
            ForEach(Array(item.links.prefix(3).enumerated()), id: \.offset) { _, link in
                if let url = URL(string: link.url) {
                    Button { safariURL = url } label: {
                        Label(link.title ?? url.host ?? "Link", systemImage: "link")
                    }
                }
            }
            if let phone = item.phoneNumber,
               let url = URL(string: "tel:" + phone.filter { $0.isNumber || $0 == "+" }) {
                Link(destination: url) { Label(phone, systemImage: "phone") }
            }
            if let location = item.location {
                Link(destination: Self.mapsURL(location: location, placeId: item.locationPlaceId)) {
                    Label("Directions", systemImage: "arrow.triangle.turn.up.right.diamond")
                }
            }
        }
        .font(.captionBold)
        .foregroundStyle(Color.textSecondary)
        .labelStyle(.titleAndIcon)
        .buttonStyle(.plain)
        .lineLimit(1)
    }

    static func mapsURL(location: String, placeId: String?) -> URL {
        var c = URLComponents(string: "https://www.google.com/maps/dir/")!
        c.queryItems = [URLQueryItem(name: "api", value: "1"), URLQueryItem(name: "destination", value: location)]
        if let placeId { c.queryItems?.append(URLQueryItem(name: "destination_place_id", value: placeId)) }
        return c.url!
    }

    private func toggleChild(_ child: TimelineItem.ChildItem) {
        let descriptor = FetchDescriptor<SymphonyTask>()
        guard let task = (try? modelContext.fetch(descriptor))?.first(where: { $0.id == child.id }) else { return }
        #if os(iOS)
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        #endif
        TaskViewModel(modelContext: modelContext).toggleComplete(task)
    }

    // MARK: - Type Icon

    @ViewBuilder
    private var typeIcon: some View {
        switch item.type {
        case .task, .event:
            EmptyView()
        case .routine:
            Image(systemName: "repeat")
                .font(.captionBold)
                .foregroundStyle(Color.textSecondary)
        case .playbook:
            Image(systemName: "book.pages")
                .font(.captionBold)
                .foregroundStyle(Color.coachingTint)
        }
    }
```

`URL` needs `Identifiable` for `.sheet(item:)`; add at file bottom:

```swift
extension URL: @retroactive Identifiable { public var id: String { absoluteString } }
```
(If the compiler rejects `@retroactive` under Swift 5.9, drop the attribute.)

- [ ] **Step 2: Add the three small views**

At the bottom of `TimelineItemCard.swift`, before `ContextBadge`:

```swift
// MARK: - Source Pill (landing `.pill`: "From an email" / "From the calendar" / "Shared")

struct SourcePill: View {
    let source: TimelineItem.Source

    var body: some View {
        Text(source.label)
            .font(.captionBold)
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(background, in: RoundedRectangle(cornerRadius: 6))
    }

    private var foreground: Color { source == .calendar ? .infoBlue : .primaryTint }
    private var background: Color { source == .calendar ? .infoBlueBg : .accentBg }
}

// MARK: - Check circle (plain rows + child rows)

struct CheckCircle: View {
    let checked: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ZStack {
                Circle().strokeBorder(checked ? Color.successGreen : Color.textLight, lineWidth: 1.5)
                if checked {
                    Circle().fill(Color.successGreen)
                    Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                }
            }
            .frame(width: 20, height: 20)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(checked ? "Completed" : "Mark complete")
    }
}

// MARK: - Child row (per-kid item under a block)

struct ChildRow: View {
    let child: TimelineItem.ChildItem
    let members: [FamilyMember]
    let onToggle: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            CheckCircle(checked: child.completed, action: onToggle)
            if let m = members.first(where: { child.assignedTo.contains($0.id) }) {
                Text(m.name.split(separator: " ").first.map(String.init) ?? m.name)
                    .font(.captionBold)
                    .foregroundStyle(Color.memberColor(m.color))
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(Color.memberColor(m.color).opacity(0.15), in: RoundedRectangle(cornerRadius: 6))
            }
            Text(child.title)
                .font(.bodySmall)
                .foregroundStyle(child.completed ? Color.textTertiary : Color.textPrimary)
                .strikethrough(child.completed)
                .lineLimit(1)
        }
    }
}
```

- [ ] **Step 3: `ContextBadge` and `AssigneeAvatars` fonts**

`ContextBadge`: `.font(.system(size: 10, weight: .semibold))` → `.font(.captionBold)`. `AssigneeAvatars`: keep the size-relative system fonts (initials inside a circle scale with `size`). Border `Color.bgElevated` is now white — fine.

- [ ] **Step 4: Build, unit tests, screenshot with a block on screen**

Build and run the full unit suite. To see a block, seed the scratch account with a parent + two children + a note via the Management API (the same account the UI harness uses; token per memory `reference_supabase_management_token`), or simpler: in the running simulator, open a task from Today, type a note in its Notes field, and return to Today. Screenshot to `.../scratchpad/today-block.png` and Read it. Expected: a white block with an amber rail, small time, serif title, italic note line; plain rows for the rest; check circles on the right of plain rows. Swipe left on a block in the simulator (drag with the mouse) and confirm the green completion zone still appears.

- [ ] **Step 5: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add apple/SymphonyOS/SymphonyOS/Views/Timeline/TimelineItemCard.swift
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): Today rows render as plain rows or context blocks like the landing hero

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

**Checkpoint 2 ships here.** Push `ios-sliders`.

---

## Checkpoint 3 — Paper snap

### Task 8: `PageParse` — the pure half

**Files:**
- Create: `SymphonyOS/Services/PageParse.swift`
- Test: `SymphonyOSTests/PageParseTests.swift` (new)

**Interfaces:**
- Produces:
  ```swift
  enum PagePlacement: Equatable { case date(String); case week; case inbox }
  struct PageItem: Identifiable, Equatable { let id: UUID; var title: String; var placement: PagePlacement; var assigneeId: UUID?; var note: String? }
  struct PageNote: Identifiable, Equatable { let id: UUID; var title: String; var content: String }
  struct PageResult: Equatable { var items: [PageItem]; var notes: [PageNote]; var unclear: [String]; var windowDates: [String]; var storagePath: String? }
  struct PageParseResponse: Decodable { ... }   // wire shape of parse-page
  struct PageTaskFields: Equatable { title, scheduledFor: Date?, isAllDay: Bool, bucket: String, weekStart: Date?, assignedTo: UUID?, notes: String? }
  enum PageParse {
      static let windowDays = 14
      static let defaultWeekStartsOn = 1   // Calendar weekday: 1 = Sunday
      static func windowDates(from today: Date, calendar: Calendar = .current) -> [String]
      static func localYmd(_ d: Date, calendar: Calendar = .current) -> String
      static func parseLocalYmd(_ s: String, calendar: Calendar = .current) -> Date?
      static func validate(_ r: PageParseResponse, fallbackWindow: [String], memberIds: Set<UUID>) -> PageResult
      static func weekStartAnchor(now: Date, weekStartsOn: Int = defaultWeekStartsOn, calendar: Calendar = .current) -> Date
      static func taskFields(for item: PageItem, currentWeekStart: Date, defaultAssignee: UUID?) -> PageTaskFields
  }
  ```

- [ ] **Step 1: Write the failing tests**

Create `SymphonyOSTests/PageParseTests.swift`:

```swift
import Testing
import Foundation
@testable import Symphony

/// Mirrors src/lib/pageParse.ts + src/lib/planParse.ts on the web: the phone must
/// place a photographed page exactly where the desktop would.
struct PageParseTests {
    private let cal = Calendar.current

    private func ymd(_ y: Int, _ m: Int, _ d: Int) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d))!
    }

    @Test func windowIsFourteenDaysStartingToday() {
        let dates = PageParse.windowDates(from: ymd(2026, 9, 2))
        #expect(dates.count == 14)
        #expect(dates.first == "2026-09-02")
        #expect(dates.last == "2026-09-15")
    }

    @Test func localYmdRoundTrips() {
        let d = ymd(2026, 3, 8)
        #expect(PageParse.localYmd(d) == "2026-03-08")
        #expect(PageParse.parseLocalYmd("2026-03-08") == d)
        #expect(PageParse.parseLocalYmd("garbage") == nil)
    }

    @Test func weekStartAnchorDefaultsToSunday() {
        // 2026-09-02 is a Wednesday → the Sunday before is 2026-08-30.
        #expect(PageParse.weekStartAnchor(now: ymd(2026, 9, 2)) == ymd(2026, 8, 30))
        // Monday start (2) → 2026-08-31.
        #expect(PageParse.weekStartAnchor(now: ymd(2026, 9, 2), weekStartsOn: 2) == ymd(2026, 8, 31))
        // Already on the anchor day → same day.
        #expect(PageParse.weekStartAnchor(now: ymd(2026, 8, 30)) == ymd(2026, 8, 30))
    }

    private func response(items: [PageParseResponse.Item] = [], notes: [PageParseResponse.Note] = [],
                          unclear: [String] = [], window: [String]? = nil, storagePath: String? = "u/pages/p.jpg") -> PageParseResponse {
        PageParseResponse(ok: true, error: nil, items: items, notes: notes, unclear: unclear, window: window, storagePath: storagePath)
    }

    @Test func validateMapsPlacementsAndClampsToWindow() {
        let member = UUID()
        let window = ["2026-09-02", "2026-09-03"]
        let r = response(items: [
            .init(title: " Buy cleats ", day: "2026-09-03", assignee_id: member.uuidString, note: " size 4 "),
            .init(title: "Call school", day: "week", assignee_id: nil, note: nil),
            .init(title: "Someday idea", day: "inbox", assignee_id: "not-a-uuid", note: ""),
            .init(title: "Past day", day: "2026-08-01", assignee_id: nil, note: nil),
            .init(title: "", day: "inbox", assignee_id: nil, note: nil),
        ], window: window)
        let out = PageParse.validate(r, fallbackWindow: ["x"], memberIds: [member])
        #expect(out.windowDates == window)
        #expect(out.items.map(\.title) == ["Buy cleats", "Call school", "Someday idea", "Past day"])
        #expect(out.items[0].placement == .date("2026-09-03"))
        #expect(out.items[0].assigneeId == member)
        #expect(out.items[0].note == "size 4")
        #expect(out.items[1].placement == .week)
        #expect(out.items[2].placement == .inbox)
        #expect(out.items[2].assigneeId == nil)
        #expect(out.items[2].note == nil)
        #expect(out.items[3].placement == .week)      // outside the window → week
        #expect(out.storagePath == "u/pages/p.jpg")
    }

    @Test func validateUsesFallbackWindowAndUnknownMemberBecomesNil() {
        let r = response(items: [.init(title: "A", day: "2026-09-02", assignee_id: UUID().uuidString, note: nil)], window: nil)
        let out = PageParse.validate(r, fallbackWindow: ["2026-09-02"], memberIds: [])
        #expect(out.windowDates == ["2026-09-02"])
        #expect(out.items[0].placement == .date("2026-09-02"))
        #expect(out.items[0].assigneeId == nil)
    }

    @Test func validateCapsNotesAndUnclearAndDerivesNoteTitles() {
        let notes = (0..<25).map { PageParseResponse.Note(title: $0 == 0 ? nil : "T\($0)", content: "line one \($0)\nline two") }
        let r = response(notes: notes, unclear: Array(repeating: " ?? ", count: 25))
        let out = PageParse.validate(r, fallbackWindow: [], memberIds: [])
        #expect(out.notes.count == 20)
        #expect(out.notes[0].title == "line one 0")     // missing title → first line
        #expect(out.notes[1].title == "T1")
        #expect(out.unclear.count == 20)
        #expect(out.unclear[0] == "??")
    }

    @Test func taskFieldsForEachPlacement() {
        let me = UUID(), other = UUID()
        let weekStart = ymd(2026, 8, 30)
        let dated = PageItem(id: UUID(), title: "Buy cleats", placement: .date("2026-09-03"), assigneeId: other, note: "size 4")
        let f1 = PageParse.taskFields(for: dated, currentWeekStart: weekStart, defaultAssignee: me)
        #expect(f1.scheduledFor == ymd(2026, 9, 3))
        #expect(f1.isAllDay == true)
        #expect(f1.bucket == "timed")
        #expect(f1.weekStart == nil)
        #expect(f1.assignedTo == other)
        #expect(f1.notes == "size 4")

        let week = PageItem(id: UUID(), title: "Call school", placement: .week, assigneeId: nil, note: nil)
        let f2 = PageParse.taskFields(for: week, currentWeekStart: weekStart, defaultAssignee: me)
        #expect(f2.scheduledFor == nil)
        #expect(f2.bucket == "week")
        #expect(f2.weekStart == weekStart)
        #expect(f2.assignedTo == me)          // unassigned → the planner

        let inbox = PageItem(id: UUID(), title: "Idea", placement: .inbox, assigneeId: nil, note: nil)
        let f3 = PageParse.taskFields(for: inbox, currentWeekStart: weekStart, defaultAssignee: nil)
        #expect(f3.bucket == "inbox")
        #expect(f3.scheduledFor == nil)
        #expect(f3.weekStart == nil)
        #expect(f3.assignedTo == nil)
    }
}
```

- [ ] **Step 2: Run to verify failure**

`-only-testing:SymphonyOSTests/PageParseTests`. Expected: compile errors, `PageParse` undefined.

- [ ] **Step 3: Write `PageParse.swift`**

Create `SymphonyOS/Services/PageParse.swift`:

```swift
import Foundation

// Page-from-paper, the pure half. Mirrors the web:
//   src/lib/planParse.ts  — PLAN_WINDOW_DAYS, PlanPlacement, planItemToAddTaskArgs
//   src/lib/pageParse.ts  — validatePageResult caps
//   src/lib/cadence/config.ts — DEFAULT_CADENCE.weekStartsOn (Sunday), weekStartAnchor
// If any of those change, change this file too — they are two copies of one contract.

enum PagePlacement: Equatable {
    case date(String)   // local YYYY-MM-DD inside the echoed window
    case week
    case inbox
}

struct PageItem: Identifiable, Equatable {
    let id: UUID
    var title: String
    var placement: PagePlacement
    var assigneeId: UUID?
    var note: String?
}

struct PageNote: Identifiable, Equatable {
    let id: UUID
    var title: String
    var content: String
}

struct PageResult: Equatable {
    var items: [PageItem]
    var notes: [PageNote]
    var unclear: [String]
    /// The dates the parser was ALLOWED to place on — echoed by the response.
    var windowDates: [String]
    var storagePath: String?

    static let empty = PageResult(items: [], notes: [], unclear: [], windowDates: [], storagePath: nil)
}

/// Wire shape of the `parse-page` edge function response.
struct PageParseResponse: Decodable {
    struct Item: Decodable {
        var title: String?
        var day: String?
        var assignee_id: String?
        var note: String?
    }
    struct Note: Decodable {
        var title: String?
        var content: String?
    }
    var ok: Bool?
    var error: String?
    var items: [Item]?
    var notes: [Note]?
    var unclear: [String]?
    var window: [String]?
    var storagePath: String?
}

/// What a placed page item becomes on the `tasks` row.
struct PageTaskFields: Equatable {
    var title: String
    var scheduledFor: Date?
    var isAllDay: Bool
    var bucket: String
    var weekStart: Date?
    var assignedTo: UUID?
    var notes: String?
}

enum PageParse {
    /// Twin of `PLAN_WINDOW_DAYS` in src/lib/planParse.ts.
    static let windowDays = 14
    /// Twin of `DEFAULT_CADENCE.weekStartsOn = 0` (Sunday) — as a Foundation
    /// `Calendar` weekday, Sunday is 1. The web stores this per browser in
    /// localStorage, so the phone cannot read it and uses the default.
    static let defaultWeekStartsOn = 1

    static let maxNotes = 20
    static let maxUnclear = 20
    static let titleMax = 80
    static let contentMax = 5000
    static let unclearMax = 200

    // MARK: Dates

    private static func ymdFormatter(_ calendar: Calendar) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = calendar
        f.timeZone = calendar.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    static func localYmd(_ d: Date, calendar: Calendar = .current) -> String {
        ymdFormatter(calendar).string(from: d)
    }

    static func parseLocalYmd(_ s: String, calendar: Calendar = .current) -> Date? {
        guard s.count == 10 else { return nil }
        return ymdFormatter(calendar).date(from: s)
    }

    /// The window's dates as local YYYY-MM-DD, today first.
    static func windowDates(from today: Date, calendar: Calendar = .current) -> [String] {
        let start = calendar.startOfDay(for: today)
        return (0..<windowDays).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: start).map { localYmd($0, calendar: calendar) }
        }
    }

    /// Midnight of the most recent `weekStartsOn` weekday on or before `now`.
    static func weekStartAnchor(now: Date, weekStartsOn: Int = defaultWeekStartsOn, calendar: Calendar = .current) -> Date {
        let day = calendar.startOfDay(for: now)
        let weekday = calendar.component(.weekday, from: day)
        let delta = (weekday - weekStartsOn + 7) % 7
        return calendar.date(byAdding: .day, value: -delta, to: day) ?? day
    }

    // MARK: Validation (cheap repeat of the server's checks)

    static func validate(_ r: PageParseResponse, fallbackWindow: [String], memberIds: Set<UUID>) -> PageResult {
        let window = (r.window?.isEmpty == false) ? r.window! : fallbackWindow
        let windowSet = Set(window)

        let items: [PageItem] = (r.items ?? []).compactMap { e in
            let title = (e.title ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !title.isEmpty else { return nil }
            let day = e.day ?? "inbox"
            let placement: PagePlacement
            if day == "week" { placement = .week }
            else if day == "inbox" { placement = .inbox }
            else if windowSet.contains(day) { placement = .date(day) }
            else { placement = .week }
            let assignee = e.assignee_id.flatMap(UUID.init(uuidString:)).flatMap { memberIds.contains($0) ? $0 : nil }
            let note = e.note?.trimmingCharacters(in: .whitespacesAndNewlines)
            return PageItem(id: UUID(), title: String(title.prefix(titleMax)), placement: placement,
                            assigneeId: assignee, note: (note?.isEmpty == false) ? note : nil)
        }

        let notes: [PageNote] = (r.notes ?? []).prefix(maxNotes).compactMap { n in
            let content = (n.content ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !content.isEmpty else { return nil }
            let clipped = String(content.prefix(contentMax))
            let explicit = n.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let title = explicit.isEmpty
                ? String(clipped.split(separator: "\n").first.map(String.init) ?? clipped).prefix(titleMax)
                : explicit.prefix(titleMax)
            return PageNote(id: UUID(), title: String(title), content: clipped)
        }

        let unclear = (r.unclear ?? [])
            .map { String($0.trimmingCharacters(in: .whitespacesAndNewlines).prefix(unclearMax)) }
            .filter { !$0.isEmpty }
            .prefix(maxUnclear)

        return PageResult(items: items, notes: notes, unclear: Array(unclear), windowDates: window, storagePath: r.storagePath)
    }

    // MARK: Placement → task fields (twin of planItemToAddTaskArgs)

    static func taskFields(for item: PageItem, currentWeekStart: Date, defaultAssignee: UUID?) -> PageTaskFields {
        // Unassigned lines default to the planner; only a named member overrides.
        let assignee = item.assigneeId ?? defaultAssignee
        switch item.placement {
        case .date(let ymd):
            return PageTaskFields(title: item.title, scheduledFor: parseLocalYmd(ymd), isAllDay: true,
                                  bucket: "timed", weekStart: nil, assignedTo: assignee, notes: item.note)
        case .week:
            // bucket='week' rows must say WHICH week (placement cascade).
            return PageTaskFields(title: item.title, scheduledFor: nil, isAllDay: false,
                                  bucket: "week", weekStart: currentWeekStart, assignedTo: assignee, notes: item.note)
        case .inbox:
            return PageTaskFields(title: item.title, scheduledFor: nil, isAllDay: false,
                                  bucket: "inbox", weekStart: nil, assignedTo: assignee, notes: item.note)
        }
    }
}
```

Note the test constructs `PageParseResponse` and its nested types with memberwise inits — they are structs with `var` fields, so the synthesized memberwise initializers are available inside the module and, via `@testable`, to the tests.

- [ ] **Step 4: Run the tests**

`-only-testing:SymphonyOSTests/PageParseTests`. Expected: all pass. If `taskFieldsForEachPlacement` fails on the `f1.scheduledFor` comparison, both sides are built with `Calendar.current` at local midnight, so check `parseLocalYmd` uses `calendar.timeZone`.

- [ ] **Step 5: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add apple/SymphonyOS/SymphonyOS/Services/PageParse.swift apple/SymphonyOS/SymphonyOSTests/PageParseTests.swift
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): PageParse — window, validation and placement mirrored from the web

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

---

### Task 9: `PageIngest` — upload, parse, commit

**Files:**
- Create: `SymphonyOS/Services/PageIngest.swift`
- Modify: `SymphonyOS/Models/FamilyMember.swift` (add `current(in:authUserId:)`)
- Modify: `SymphonyOS/ViewModels/TaskViewModel.swift` (add `createTask(fields:userId:)`)
- Modify: `SymphonyOS/Services/DocumentIngest.swift` (`attach` gains `entityType`)
- Test: `SymphonyOSTests/PageIngestTests.swift` (new) — pure parts only (storage path, current member, `createTask(fields:)` writes)

**Interfaces:**
- Produces:
  ```swift
  enum PageIngest {
      static func storagePath(userId: UUID, fileId: UUID) -> String              // "{uid lowercased}/pages/{id lowercased}.jpg"
      static func upload(jpeg: Data, userId: UUID) async throws -> String
      static func parse(storagePath: String, members: [FamilyMember], today: Date = Date()) async throws -> PageResult
      struct CommitOutcome: Equatable { var tasksCreated: Int; var notesCreated: Int; var failures: Int }
      @MainActor static func commit(items: [PageItem], notes: [PageNote], storagePath: String?, userId: UUID,
                                    members: [FamilyMember], modelContext: ModelContext) async -> CommitOutcome
  }
  extension FamilyMember { static func current(in members: [FamilyMember], authUserId: UUID?) -> FamilyMember? }
  extension TaskViewModel { func createTask(fields: PageTaskFields, userId: UUID) -> SymphonyTask }
  ```

- [ ] **Step 1: Write the failing tests**

Create `SymphonyOSTests/PageIngestTests.swift`:

```swift
import Testing
import Foundation
import SwiftData
@testable import Symphony

@MainActor
struct PageIngestTests {
    private func makeContext() throws -> ModelContext {
        let config = ModelConfiguration(isStoredInMemoryOnly: true)
        let container = try ModelContainer(
            for: SymphonyTask.self, Project.self, Routine.self, Contact.self,
            FamilyMember.self, ActionableInstance.self, EventNote.self, PlaybookBlock.self,
            PlaybookInstance.self, WeeklyTemplate.self, FamilyRule.self,
            Responsibility.self, Household.self, UserProfile.self, PendingChange.self,
            configurations: config
        )
        return ModelContext(container)
    }

    @Test func storagePathIsLowercasedUnderPages() {
        let uid = UUID(uuidString: "BACE953E-87EA-4A59-B7D7-F476FA0E8C94")!
        let fid = UUID(uuidString: "0F0F0F0F-0000-0000-0000-000000000001")!
        #expect(PageIngest.storagePath(userId: uid, fileId: fid)
                == "bace953e-87ea-4a59-b7d7-f476fa0e8c94/pages/0f0f0f0f-0000-0000-0000-000000000001.jpg")
    }

    @Test func currentMemberPrefersAuthLinkThenOwnerThenFullUser() {
        let me = UUID(), owner = UUID()
        let linked = FamilyMember(userId: owner, name: "Iris", initials: "I", color: "teal"); linked.authUserId = me
        let creator = FamilyMember(userId: owner, name: "Scott", initials: "S", color: "blue")
        let full = FamilyMember(userId: UUID(), name: "Legacy", initials: "L", color: "red"); full.isFullUser = true
        #expect(FamilyMember.current(in: [creator, linked, full], authUserId: me)?.name == "Iris")
        #expect(FamilyMember.current(in: [creator, full], authUserId: owner)?.name == "Scott")
        #expect(FamilyMember.current(in: [creator, full], authUserId: UUID())?.name == "Legacy")
        #expect(FamilyMember.current(in: [], authUserId: me) == nil)
    }

    @Test func createTaskFromFieldsWritesEveryFieldAndQueuesAnInsert() throws {
        let context = try makeContext()
        let userId = UUID(), assignee = UUID()
        let weekStart = Calendar.current.startOfDay(for: Date())
        let fields = PageTaskFields(title: "Call school", scheduledFor: nil, isAllDay: false, bucket: "week",
                                    weekStart: weekStart, assignedTo: assignee, notes: "ask about pickup")
        let task = TaskViewModel(modelContext: context).createTask(fields: fields, userId: userId)
        #expect(task.title == "Call school")
        #expect(task.bucket == "week")
        #expect(task.weekStart == weekStart)
        #expect(task.assignedTo == assignee)
        #expect(task.notes == "ask about pickup")
        #expect(task.context == nil)          // a capture never stamps the lens
        let queued = try context.fetch(FetchDescriptor<PendingChange>())
        #expect(queued.contains { $0.tableName == "tasks" && $0.recordId == task.id && $0.changeType == "insert" })
    }
}
```

- [ ] **Step 2: Run to verify failure**

`-only-testing:SymphonyOSTests/PageIngestTests`. Expected: compile errors.

- [ ] **Step 3: `FamilyMember.current`**

Append to `SymphonyOS/Models/FamilyMember.swift`:

```swift
extension FamilyMember {
    /// The signed-in person's own member row. Mirrors `getCurrentUserMember` in
    /// src/hooks/useFamilyMembers.ts: auth link first (joined members like
    /// Iris), then the household creator, then any full user (legacy data).
    static func current(in members: [FamilyMember], authUserId: UUID?) -> FamilyMember? {
        if let authUserId {
            if let linked = members.first(where: { $0.authUserId == authUserId }) { return linked }
            if let owner = members.first(where: { $0.userId == authUserId }) { return owner }
        }
        return members.first(where: { $0.isFullUser })
    }
}
```

- [ ] **Step 4: `TaskViewModel.createTask(fields:userId:)`**

In `SymphonyOS/ViewModels/TaskViewModel.swift`, after `createTask(title:...)`:

```swift
    /// Create a task from a placed page item. Everything rides the INSERT —
    /// the row exists locally with all fields before the push, so no follow-up
    /// update can race the temp→real swap (the addTask-then-setBucket lesson).
    func createTask(fields: PageTaskFields, userId: UUID) -> SymphonyTask {
        let task = SymphonyTask(userId: userId, title: fields.title, scheduledFor: fields.scheduledFor,
                                context: nil, notes: fields.notes)
        task.isAllDay = fields.isAllDay
        task.bucket = fields.bucket
        task.weekStart = fields.weekStart
        task.assignedTo = fields.assignedTo
        modelContext.insert(task)
        queueChange(tableName: "tasks", recordId: task.id, type: "insert")
        try? modelContext.save()
        return task
    }
```

- [ ] **Step 5: `DocumentIngest.attach(entityType:)`**

Change the signature to `static func attach(entityType: String = "task", entityId: UUID, userId: UUID, storagePath: String, fileName: String, fileType: String, fileSize: Int) async throws` and use `entity_type: entityType, entity_id: entityId.uuidString`. Update the one existing caller (`saveScan` in `MainView.swift`: `taskId:` → `entityId:`); that caller is deleted in Task 10 anyway.

- [ ] **Step 6: Write `PageIngest.swift`**

Create `SymphonyOS/Services/PageIngest.swift`:

```swift
import Foundation
import SwiftData
import Supabase

/// "Snap the paper plan — it lands placed." Upload a photographed page, ask the
/// web's `parse-page` function to sort it into placed items / notes / unclear
/// lines, and commit the reviewed result through the SwiftData sync queue.
///
/// Mirrors src/hooks/usePageFromPaper.ts (parse) and src/hooks/useCommitPage.ts
/// (commit). The CALLER owns the placement window and sends it — the function
/// never re-derives it.
enum PageIngest {
    struct CommitOutcome: Equatable {
        var tasksCreated = 0
        var notesCreated = 0
        /// Non-zero means: do not delete the page.
        var failures = 0
    }

    // MARK: Pure

    /// Lowercased: the storage upload policy compares the first folder to
    /// auth.uid()::text, which is lowercase.
    static func storagePath(userId: UUID, fileId: UUID) -> String {
        "\(userId.uuidString.lowercased())/pages/\(fileId.uuidString.lowercased()).jpg"
    }

    // MARK: Network

    static func upload(jpeg: Data, userId: UUID) async throws -> String {
        let path = storagePath(userId: userId, fileId: UUID())
        try await supabase.storage
            .from("attachments")
            .upload(path, data: jpeg, options: FileOptions(contentType: "image/jpeg", upsert: false))
        return path
    }

    struct ParseError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    /// Invoke `parse-page` with the already-uploaded path. Retry re-calls this
    /// with the same path — no re-upload.
    static func parse(storagePath: String, members: [FamilyMember], today: Date = Date()) async throws -> PageResult {
        struct Member: Encodable { let id: String; let name: String }
        struct Body: Encodable {
            let storagePath: String
            let placeStart: String
            let placeEnd: String
            let today: String
            let members: [Member]
        }
        let dates = PageParse.windowDates(from: today)
        let body = Body(
            storagePath: storagePath,
            placeStart: dates[0],
            placeEnd: dates[dates.count - 1],
            today: PageParse.localYmd(today),
            members: members.map { Member(id: $0.id.uuidString, name: $0.name) }
        )
        let response: PageParseResponse = try await supabase.functions.invoke(
            "parse-page",
            options: FunctionInvokeOptions(body: body)
        )
        if let error = response.error, !error.isEmpty { throw ParseError(message: error) }
        return PageParse.validate(response, fallbackWindow: dates, memberIds: Set(members.map(\.id)))
    }

    // MARK: Commit

    @MainActor
    static func commit(items: [PageItem], notes: [PageNote], storagePath: String?, userId: UUID,
                       members: [FamilyMember], modelContext: ModelContext) async -> CommitOutcome {
        var outcome = CommitOutcome()
        let vm = TaskViewModel(modelContext: modelContext)
        let weekStart = PageParse.weekStartAnchor(now: Date())
        let me = FamilyMember.current(in: members, authUserId: userId)?.id

        var firstTaskId: UUID?
        for item in items {
            let fields = PageParse.taskFields(for: item, currentWeekStart: weekStart, defaultAssignee: me)
            let task = vm.createTask(fields: fields, userId: userId)
            outcome.tasksCreated += 1
            firstTaskId = firstTaskId ?? task.id
        }

        // Notes go straight to the `notes` table (no SwiftData model for it).
        // type 'general' + source 'import', never 'quick_capture' — the web
        // dual-writes quick captures to the vault and a page already captured
        // must not land there a second time. scope 'individual': a capture
        // never stamps the lens, so it stays private (scopeForDomain(null)).
        struct NewNote: Encodable {
            let user_id: String; let title: String; let content: String
            let type: String; let source: String; let context: String?; let scope: String
        }
        struct CreatedNote: Decodable { let id: UUID }
        var firstNoteId: UUID?
        for note in notes {
            do {
                let created: CreatedNote = try await supabase.from("notes")
                    .insert(NewNote(user_id: userId.uuidString, title: note.title, content: note.content,
                                    type: "general", source: "import", context: nil, scope: "individual"))
                    .select("id").single().execute().value
                outcome.notesCreated += 1
                firstNoteId = firstNoteId ?? created.id
            } catch {
                outcome.failures += 1
            }
        }

        // File the page against the first note, else the first task. Not a
        // commit failure if this part fails — the items are in.
        if let storagePath, let entityId = firstNoteId ?? firstTaskId {
            try? await DocumentIngest.attach(
                entityType: firstNoteId != nil ? "note" : "task",
                entityId: entityId, userId: userId, storagePath: storagePath,
                fileName: storagePath.split(separator: "/").last.map(String.init) ?? "page.jpg",
                fileType: "image/jpeg", fileSize: 0
            )
        }
        return outcome
    }
}
```

- [ ] **Step 7: Run the tests and build**

`-only-testing:SymphonyOSTests/PageIngestTests`, then a full build. Expected: 3 passed, `BUILD SUCCEEDED`. If `supabase.functions.invoke` needs an explicit generic, write `let response = try await supabase.functions.invoke("parse-page", options: ...) as PageParseResponse`.

- [ ] **Step 8: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add apple/SymphonyOS/SymphonyOS/Services/PageIngest.swift apple/SymphonyOS/SymphonyOS/Services/DocumentIngest.swift apple/SymphonyOS/SymphonyOS/Models/FamilyMember.swift apple/SymphonyOS/SymphonyOS/ViewModels/TaskViewModel.swift apple/SymphonyOS/SymphonyOS/App/MainView.swift apple/SymphonyOS/SymphonyOSTests/PageIngestTests.swift
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): PageIngest — upload, parse-page, commit through the sync queue

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

---

### Task 10: `PageReviewSheet` and the dock wiring

**Files:**
- Create: `SymphonyOS/Views/Capture/PageReviewSheet.swift`
- Modify: `SymphonyOS/App/MainView.swift` (`CaptureSheet`, lines ~112-230)
- Delete: `SymphonyOS/Views/Capture/ScanReviewSheet.swift`
- Modify: `SymphonyOS/Services/DocumentIngest.swift` (delete `ScanExtraction` and `extract`)

**Interfaces:**
- Consumes: `PageIngest.upload/parse/commit`, `PageResult`, `PageItem`, `PagePlacement`, `FamilyMember`, `DocumentScanner`, `CameraPicker`.
- Produces: `PageReviewSheet(result: PageResult, members: [FamilyMember], onCommit: ([PageItem], [PageNote]) -> Void, onCancel: () -> Void)`.

- [ ] **Step 1: Write `PageReviewSheet.swift`**

```swift
#if os(iOS)
import SwiftUI

/// Review a parsed page before it lands: items with a placement chip and an
/// assignee chip, the notes it found, and the lines it couldn't read.
struct PageReviewSheet: View {
    let result: PageResult
    let members: [FamilyMember]
    let onCommit: ([PageItem], [PageNote]) -> Void
    let onCancel: () -> Void

    @State private var items: [PageItem]
    @State private var notes: [PageNote]

    init(result: PageResult, members: [FamilyMember],
         onCommit: @escaping ([PageItem], [PageNote]) -> Void, onCancel: @escaping () -> Void) {
        self.result = result
        self.members = members
        self.onCommit = onCommit
        self.onCancel = onCancel
        _items = State(initialValue: result.items)
        _notes = State(initialValue: result.notes)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    if items.isEmpty && notes.isEmpty && result.unclear.isEmpty {
                        Text("Nothing to place on this page.")
                            .font(.bodyMedium)
                            .foregroundStyle(Color.textSecondary)
                            .padding(.top, 40)
                            .frame(maxWidth: .infinity)
                    }

                    if !items.isEmpty {
                        Text("Items").eyebrowStyle()
                        ForEach($items) { $item in
                            itemRow($item)
                        }
                    }

                    if !notes.isEmpty {
                        Text("Notes").eyebrowStyle()
                        ForEach(notes) { note in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(note.title).font(.displaySmall).foregroundStyle(Color.textPrimary)
                                Text(note.content).font(.bodySmall).foregroundStyle(Color.textSecondary).lineLimit(4)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .cardStyle(padding: 14)
                            .overlay(alignment: .topTrailing) {
                                Button { notes.removeAll { $0.id == note.id } } label: {
                                    Image(systemName: "xmark").font(.captionBold).foregroundStyle(Color.textTertiary).padding(10)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }

                    if !result.unclear.isEmpty {
                        Text("Couldn't read").eyebrowStyle()
                        ForEach(result.unclear, id: \.self) { line in
                            Text(line).font(.displayItalic).foregroundStyle(Color.textTertiary)
                        }
                    }
                }
                .padding(20)
                .padding(.bottom, 40)
            }
            .background(Color.bgBase)
            .navigationTitle("Review page")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onCancel) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add all") { onCommit(items, notes) }
                        .disabled(items.isEmpty && notes.isEmpty)
                }
            }
        }
    }

    private func itemRow(_ item: Binding<PageItem>) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                TextField("Title", text: item.title)
                    .font(.bodyMedium)
                    .foregroundStyle(Color.textPrimary)
                Button { items.removeAll { $0.id == item.wrappedValue.id } } label: {
                    Image(systemName: "xmark").font(.captionBold).foregroundStyle(Color.textTertiary)
                }
                .buttonStyle(.plain)
            }
            HStack(spacing: 8) {
                placementMenu(item.placement)
                assigneeMenu(item.assigneeId)
            }
            if let note = item.wrappedValue.note {
                Text(note).font(.displayItalic).foregroundStyle(Color.textSecondary).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle(padding: 14)
    }

    private func placementMenu(_ placement: Binding<PagePlacement>) -> some View {
        Menu {
            ForEach(result.windowDates, id: \.self) { ymd in
                Button(Self.dayLabel(ymd)) { placement.wrappedValue = .date(ymd) }
            }
            Divider()
            Button("This week") { placement.wrappedValue = .week }
            Button("Inbox") { placement.wrappedValue = .inbox }
        } label: {
            chip(Self.label(for: placement.wrappedValue), systemImage: "calendar")
        }
    }

    private func assigneeMenu(_ assignee: Binding<UUID?>) -> some View {
        Menu {
            Button("Me") { assignee.wrappedValue = nil }
            ForEach(members.sorted { $0.displayOrder < $1.displayOrder }, id: \.id) { m in
                Button(m.name) { assignee.wrappedValue = m.id }
            }
        } label: {
            let name = members.first { $0.id == assignee.wrappedValue }?.name ?? "Me"
            chip(name, systemImage: "person")
        }
    }

    private func chip(_ text: String, systemImage: String) -> some View {
        Label(text, systemImage: systemImage)
            .font(.captionBold)
            .foregroundStyle(Color.textSecondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.bgSurface, in: Capsule())
    }

    static func label(for placement: PagePlacement) -> String {
        switch placement {
        case .date(let ymd): return dayLabel(ymd)
        case .week: return "This week"
        case .inbox: return "Inbox"
        }
    }

    static func dayLabel(_ ymd: String) -> String {
        guard let d = PageParse.parseLocalYmd(ymd) else { return ymd }
        if Calendar.current.isDateInToday(d) { return "Today" }
        if Calendar.current.isDateInTomorrow(d) { return "Tomorrow" }
        return d.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }
}
#endif
```

- [ ] **Step 2: Rewire `CaptureSheet` in `MainView.swift`**

Replace the whole `CaptureSheet` struct (from `// MARK: - Capture Sheet` to the end of `saveScan`) with:

```swift
// MARK: - Capture Sheet (dock "+": typed capture, or snap a page → parse-page)

private struct CaptureSheet: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @Query private var familyMembers: [FamilyMember]

    private enum Phase: Equatable {
        case idle
        case uploading
        case parsing(storagePath: String)
        case failed(storagePath: String, message: String)
        case committing
    }

    @State private var phase: Phase = .idle
    @State private var showScanner = false
    @State private var showPhotoPicker = false
    @State private var photoItem: PhotosPickerItem?
    @State private var review: PageResult?

    var body: some View {
        NavigationStack {
            VStack(spacing: 18) {
                QuickCaptureBar(userId: userId)

                HStack(spacing: 12) {
                    captureOption(title: "Snap a page", systemImage: "doc.viewfinder") { showScanner = true }
                    captureOption(title: "Choose photo", systemImage: "photo.on.rectangle") { showPhotoPicker = true }
                }
                .padding(.horizontal, 16)

                Text("Photograph a handwritten plan. Every line lands on its day, this week, or the inbox — you review before anything is added.")
                    .font(.bodySmall)
                    .foregroundStyle(Color.textTertiary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)

                Spacer(minLength: 0)
            }
            .padding(.top, 12)
            .background(Color.bgBase)
            .navigationTitle("Add")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
            }
            .overlay { progressOverlay }
            .fullScreenCover(isPresented: $showScanner) {
                DocumentScanner { data in
                    showScanner = false
                    if let data { Task { await snap(imageData: data) } }
                }
                .ignoresSafeArea()
            }
            .photosPicker(isPresented: $showPhotoPicker, selection: $photoItem, matching: .images)
            .onChange(of: photoItem) { _, item in
                guard let item else { return }
                Task {
                    if let data = try? await item.loadTransferable(type: Data.self) { await snap(imageData: data) }
                    photoItem = nil
                }
            }
            .sheet(item: $review) { result in
                PageReviewSheet(result: result, members: familyMembers,
                                onCommit: { items, notes in
                                    review = nil
                                    Task { await commit(items: items, notes: notes, storagePath: result.storagePath) }
                                },
                                onCancel: { review = nil; phase = .idle })
            }
            .alert("Couldn't read the page", isPresented: isFailed) {
                if case .failed(let path, _) = phase {
                    Button("Retry") { Task { await parse(storagePath: path) } }
                }
                Button("Cancel", role: .cancel) { phase = .idle }
            } message: {
                if case .failed(_, let message) = phase { Text(message) }
            }
        }
    }

    private var isFailed: Binding<Bool> {
        Binding(get: { if case .failed = phase { return true } else { return false } },
                set: { if !$0, case .failed = phase { phase = .idle } })
    }

    @ViewBuilder
    private var progressOverlay: some View {
        switch phase {
        case .uploading, .parsing, .committing:
            VStack(spacing: 10) {
                ProgressView().controlSize(.large)
                Text(phase == .uploading ? "Uploading…" : phase == .committing ? "Adding…" : "Reading the page…")
                    .font(.bodySmall).foregroundStyle(Color.textSecondary)
            }
            .padding(24)
            .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.cardBorder, lineWidth: 1))
        default:
            EmptyView()
        }
    }

    private func captureOption(title: String, systemImage: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 8) {
                Image(systemName: systemImage).font(.system(size: 24))
                Text(title).font(.captionBold)
            }
            .foregroundStyle(Color.textPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 20)
            .cardStyle(padding: 0)
        }
        .buttonStyle(.plain)
    }

    // MARK: Flow: upload → parse → review → commit

    private func snap(imageData: Data) async {
        guard let ui = UIImage(data: imageData) else { return }
        let jpeg = ui.jpegData(compressionQuality: 0.8) ?? imageData
        phase = .uploading
        do {
            let path = try await PageIngest.upload(jpeg: jpeg, userId: userId)
            await parse(storagePath: path)
        } catch {
            phase = .failed(storagePath: "", message: "Upload failed: \(error.localizedDescription)")
        }
    }

    private func parse(storagePath: String) async {
        guard !storagePath.isEmpty else { phase = .idle; return }
        phase = .parsing(storagePath: storagePath)
        do {
            let result = try await PageIngest.parse(storagePath: storagePath, members: familyMembers)
            phase = .idle
            review = result
        } catch {
            // The image stays uploaded — Retry re-parses without re-uploading.
            phase = .failed(storagePath: storagePath, message: error.localizedDescription)
        }
    }

    private func commit(items: [PageItem], notes: [PageNote], storagePath: String?) async {
        phase = .committing
        let outcome = await PageIngest.commit(items: items, notes: notes, storagePath: storagePath,
                                              userId: userId, members: familyMembers, modelContext: modelContext)
        phase = .idle
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(outcome.failures == 0 ? .success : .warning)
        #endif
        dismiss()
    }
}
```

`PageResult` needs `Identifiable` for `.sheet(item:)`. Add to `PageParse.swift`:

```swift
extension PageResult: Identifiable {
    var id: String { storagePath ?? "page" }
}
```

- [ ] **Step 3: Delete the scan-to-task path**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders rm apple/SymphonyOS/SymphonyOS/Views/Capture/ScanReviewSheet.swift
```
In `DocumentIngest.swift` delete `struct ScanExtraction` and `static func extract(...)`; keep `storagePath`, `fallbackTitle`, `upload`, `attach`. Then:
```bash
grep -rn "ScanExtraction\|ScanReviewSheet\|DocumentIngest.extract\|scan-to-task" SymphonyOS SymphonyOSTests
```
Expected: no matches (if `SymphonyOSTests/SymphonyOSTests.swift` tests `fallbackTitle`/`storagePath`, those stay valid).

- [ ] **Step 4: Regenerate, build, run all unit tests**

```bash
xcodegen generate && xcodebuild ... build && xcodebuild ... -only-testing:SymphonyOSTests test
```
Expected: `BUILD SUCCEEDED`, all tests pass.

- [ ] **Step 5: Exercise the flow in the simulator**

Put a photo of a handwritten list into the simulator's photo library: write three lines on paper ("Wed — buy cleats", "call school", "someday: fix fence"), photograph it with a phone, AirDrop or `xcrun simctl addmedia BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E <path.jpg>`. In the app, tap the dock "+", "Choose photo", pick it. Expected: "Uploading…" then "Reading the page…" then the review sheet with three items: one on the coming Wednesday, one "This week", one "Inbox". Screenshot the sheet to `.../scratchpad/page-review.png` and Read it. Tap "Add all". Expected: the dated item appears on that day in Today; the week item appears nowhere on the phone (it has no week view) but the row exists on the web's This Week shelf with `week_start` set; the inbox item is in Inbox. Verify the web side by opening app.symphony-os.com as the scratch account, or by querying `tasks` for the scratch user via the Management API (`select title, bucket, week_start, scheduled_for from tasks where user_id = '915785ac-33d8-4f6a-9808-ea9bbf84b4d1' order by created_at desc limit 3`).

If `parse-page` returns 401, the function requires a user JWT — confirm the simulator session is signed in and that `supabase.functions.invoke` is sending it (it does by default with supabase-swift 2.x).

- [ ] **Step 6: Commit**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add -A apple/SymphonyOS
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "feat(ios): Snap a page — parse-page review sheet replaces single-task scan

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
```

---

### Task 11: Screenshot harness, full verification, ship

**Files:**
- Create: `SymphonyOSUITests/LandingParityUITests.swift`
- Modify: `docs/superpowers/specs/2026-09-02-ios-landing-parity-design.md` (record the two spec corrections)

- [ ] **Step 1: Write the screenshot test**

```swift
import XCTest

/// Signs in as the scratch account and photographs Today, Inbox and the Add
/// sheet so the landing-kit restyle can be judged as pictures. Needs network +
/// the test account; not part of the shipping suite's guarantees.
final class LandingParityUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    @MainActor
    func testScreens() throws {
        let app = XCUIApplication()
        app.launch()

        addUIInterruptionMonitor(withDescription: "System alerts") { alert in
            for label in ["Don't Allow", "Not Now", "Allow"] where alert.buttons[label].exists {
                alert.buttons[label].tap(); return true
            }
            return false
        }
        app.tap()

        let email = app.textFields["Email"]
        if email.waitForExistence(timeout: 10) {
            email.tap(); email.typeText("symphonytest4444@gmail.com")
            let password = app.secureTextFields["Password"]
            password.tap(); password.typeText("SymphonyTest!2026")
            app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Sign In'")).firstMatch.tap()
        }

        XCTAssertTrue(app.staticTexts["Today"].waitForExistence(timeout: 30), "never reached Today")
        Thread.sleep(forTimeInterval: 8)
        attach(app, "01-today")

        app.buttons["Inbox"].firstMatch.tap()
        Thread.sleep(forTimeInterval: 2)
        attach(app, "02-inbox")

        app.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'plus' OR label == 'Add'")).firstMatch.tap()
        Thread.sleep(forTimeInterval: 2)
        attach(app, "03-add-sheet")
    }

    private func attach(_ app: XCUIApplication, _ name: String) {
        let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
    }
}
```
Give the dock "+" an accessibility label so the third tap is reliable: in `SymphonyDock.addSlot` add `.accessibilityLabel("Add")` on the `Button`.

- [ ] **Step 2: Run it and export the PNGs**

```bash
rm -rf /private/tmp/claude-501/-Users-scottkaufman-Developer-Developer-symphonyOS/26289c14-f58c-4f75-a4a7-497e2e285c3b/scratchpad/parity.xcresult
xcodebuild -scheme SymphonyOS -destination 'platform=iOS Simulator,id=BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E' -only-testing:SymphonyOSUITests/LandingParityUITests test -resultBundlePath /private/tmp/claude-501/-Users-scottkaufman-Developer-Developer-symphonyOS/26289c14-f58c-4f75-a4a7-497e2e285c3b/scratchpad/parity.xcresult 2>&1 | grep -E "Test Case|error:|passed|failed" | tail -10
xcrun xcresulttool export attachments --path /private/tmp/claude-501/-Users-scottkaufman-Developer-Developer-symphonyOS/26289c14-f58c-4f75-a4a7-497e2e285c3b/scratchpad/parity.xcresult --output-path /private/tmp/claude-501/-Users-scottkaufman-Developer-Developer-symphonyOS/26289c14-f58c-4f75-a4a7-497e2e285c3b/scratchpad/parity-shots
ls /private/tmp/claude-501/-Users-scottkaufman-Developer-Developer-symphonyOS/26289c14-f58c-4f75-a4a7-497e2e285c3b/scratchpad/parity-shots
```
Read all three PNGs. Expected, against the landing hero: serif masthead, eyebrow sections, plain rows on `bgSurface` with a check circle, blocks as white cards with an amber rail and a pill, ink dock, floating capture card; Inbox rows as white cards; Add sheet with two card buttons "Snap a page" / "Choose photo".

- [ ] **Step 3: Full unit suite + build, then record spec corrections**

Run the full `SymphonyOSTests` suite and a Release-config build:
```bash
xcodebuild -scheme SymphonyOS -configuration Release -destination 'platform=iOS Simulator,id=BBDB8716-7D89-4C62-AE76-9FB67DB2CA5E' build 2>&1 | grep -E "error:|BUILD" | tail -5
```
Append to the spec's "Risks" section:

```markdown
## Corrections made during implementation

- Fonts are registered in the manual `SymphonyOS/App/Info.plist` (`UIAppFonts`), not `project.yml` — the app uses `INFOPLIST_FILE` with `GENERATE_INFOPLIST_FILE: NO`.
- Week start defaults to **Sunday**, mirroring the web's `DEFAULT_CADENCE.weekStartsOn = 0` (per-browser localStorage the phone cannot read), not Monday.
```

- [ ] **Step 4: Commit and push**

```bash
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders add apple/SymphonyOS/SymphonyOSUITests/LandingParityUITests.swift apple/SymphonyOS/SymphonyOS/App/MainView.swift docs/superpowers/specs/2026-09-02-ios-landing-parity-design.md
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders commit -m "test(ios): landing-parity screenshot harness; spec corrections

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XLdS8AjY8qsULhRAyrc26R"
git -C /Users/scottkaufman/Developer/Developer/symphonyOS/.worktrees/ios-sliders push origin ios-sliders
```
Xcode Cloud builds `ios-sliders` and ships to TestFlight as v1.0.1 build N+1. Ask Scott to confirm on-device: swipe still works on every row type (iOS 27 gesture arbitration has bitten before), fonts render, and a snapped page lands where expected.

---

## Self-review

**Spec coverage.** §1 fonts + tokens + CardStyle → Tasks 1–2. §2 masthead, eyebrows, dock, Inbox/Projects/More/Settings cards, detail sheets, swipe tints, capture bar → Tasks 3–4. §3 plain row / block, source pill, note line, children, context row, `scope`/`capture_id`/`week_start`, child grouping, event-note merge → Tasks 5–7. §4 upload path, `parse-page` body, validation caps, review sheet, commit through sync queue, notes to `notes`, attachment row, retry without re-upload → Tasks 8–10. Testing: font resolution (T1), hex (T2), grouping + source (T6), page validation + placement (T8), pure ingest parts (T9), screenshots (T11). Sequencing: checkpoints after T4, T7, T11.

**Placeholder scan.** No TBD/TODO. Every code step has the code. Task 4 Step 2 says "grep to find them" but names the exact modifier chain to replace and the replacement.

**Type consistency.** `PageTaskFields` is the struct name in T8 and T9; `TaskViewModel.createTask(fields:userId:)` in T9 is what `PageIngest.commit` calls; `TimelineItem.Source`/`ChildItem` in T6 are what T7 renders; `Color.ink/cardBorder/cardShadow/accentBg/infoBlue/infoBlueBg/successGreen/textLight/bgWarm/feedbackRed` defined in T2 and used in T3–T10; `View.eyebrowStyle()` defined in T1, used in T3, T4, T10; `DocumentIngest.attach(entityType:entityId:...)` renamed in T9 and used in T9's `PageIngest.commit`; `PageResult: Identifiable` added in T10 for `.sheet(item:)`; `URL: Identifiable` added in T7.
