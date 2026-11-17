# Symphony light edition: App Store listing draft

2026-11-14. A draft for the owner to edit. Nothing here has been submitted. Sources: the light-version spec (`docs/superpowers/specs/2026-11-13-iphone-light-version-design.md`), the foundations plan (`docs/superpowers/plans/2026-11-13-iphone-light-foundations.md`), `apple/SymphonyOS/project.yml`, `apple/SymphonyOS/SymphonyOS/App/Info.plist`, and the Swift sources under `apple/SymphonyOS/SymphonyOS/`. Character counts are shown next to each limited field.

---

## 1. Name, subtitle, promotional text, keywords

**App name:** Symphony  (8 of 30). Availability of the bare name in the App Store is NOT VERIFIED (see section 10). The project's product name in `project.yml` is `Symphony`.

**Subtitle (chosen):** `Plan the year down to today`  (27 of 30)

**Alternative subtitles**
1. `Your goals, down to today`  (25 of 30)
2. `Year, season, month, today`  (26 of 30)
3. `A planner for your own goals`  (28 of 30)

**Promotional text**
`Free on iPhone. Name what matters this year, then walk it down through the season, month and week to a calm Today. Built to use both screens of the iPhone Duo.`  (159 of 170)

**Keywords**
`planner,goals,year planner,weekly planner,to-do,tasks,daily planner,journal,foldable,dual screen`  (96 of 100)

---

## 2. Description  (aim 1,200 to 1,800 characters)

```
Symphony helps you name what matters in the year ahead, then walks it down, step by step, to what you will do today.

You start with a short guided walk. It begins with the year: which parts of life matter most, and what would make the year a good one. Then the season, the month, the week, and finally the first thing you will do today. You can say your answers out loud or type them. Symphony keeps your own words; it does not write goals for you. Choose a quick start of about three minutes, or plan your whole year at your own pace. The walk saves as you go.

Then Today and Week stay easy. Add something with a single line at the bottom of the page, or tap the light to speak it. Each task shows the goal it is for. Past days fold away so the week stays calm.

Year, Season and Month are a picture of your own goals: a mountain with a flag for each goal, grouped by the part of life it belongs to. Tap a flag to walk it down to the next level, move it, or pull it up.

On an iPhone Duo, the outside screen shows a calm glance at your day. Opened flat, the week sits beside today like the two pages of a notebook. Set it down half open and it shows the time, what is next on your calendar and today's to-dos, readable from across a desk.

Symphony works on a regular iPhone too, and it is free. Speech is turned into words on your phone. Symphony reads your Apple Calendar so events appear beside your to-dos; it never changes them.

Symphony Plus is coming, with an assistant, family sharing and a web version. What you have in the free app stays free.
```

Count: 1,557 characters.

Claims check: the walk, quick start and full-year depths, resume, the add bar, "for <goal>" lineage, past days fold, Year/Season/Month mountain with flags and "Walk it down / Move to / Pull it up" are from the spec's "Mockup round 1" (decided and approved for building 2026-11-14). Whether each is built in the app was NOT VERIFIED beyond the spec; see section 10. "Reads your Apple Calendar, read-only" is from `Info.plist` (`NSCalendarsFullAccessUsageDescription`) and `Services/AppleCalendar.swift`. "Never changes them": the usage string says "Symphony only reads it"; I did not audit every EventKit call. "What you have in the free app stays free" is the spec's decision ("Never take away anything free users already have; Plus only adds").

---

## 3. Custom product page text for iPhone Duo shoppers

Spec wording for the angle: "the planner that opens like a notebook".

```
The planner that opens like a notebook.

Symphony is built for the iPhone Duo's two screens. Closed, the outside screen is a calm glance at your day. Opened flat, the rest of the week sits on the left page and today on the right, under one band of scenery. Set it down half open and it becomes a small desk display: the time, what is next on your calendar, and today's to-dos.

It starts with a short guided walk from the year ahead down to today, in your own words. It works on a regular iPhone too, and it is free. Symphony Plus is coming.
```

---

## 4. What's New (first release)

```
First release of Symphony for iPhone.

- A guided walk from the year ahead down to today
- Today and Week, with one line at the bottom to add or speak
- Year, Season and Month as a picture of your own goals
- iPhone Duo: outside screen, opened flat, and half open
- Symphony Plus is coming
```

---

## 5. Screenshot plan

Captions are 6 words or fewer. Both sets use the overlook scenery (the launch art per the spec).

**Regular iPhone (upright), 7 shots**
1. Walk Welcome (whole vista, "Quick start" and "Plan my whole year"). Caption: "Start with the year ahead"
2. A year question with the person's goals as flags on the area posts. Caption: "Your goals, planted as flags"
3. The walk's "Look back up: that's your plan" view, every area column, top to bottom. Caption: "Your plan, top to bottom"
4. Today with the wooden signpost and the add bar. Caption: "Today, with one sign to follow"
5. Week, past days folded, task moved with "Move to" chips. Caption: "A week you can move around"
6. Month page as a mountain with flags. Caption: "Your month, as a mountain"
7. Today with a task showing "for <year goal>". Caption: "Every task knows its goal"

**iPhone Duo, 7 shots**
1. Walk Welcome on the inside screen. Caption: "Start with the year ahead"
2. Year question with goals as flags. Caption: "Your goals, planted as flags"
3. "Your plan, top to bottom" view. Caption: "Your plan, top to bottom"
4. Duo opened flat: week on the left page, Today on the right. Caption: "Week and today, side by side"
5. Duo half open (tent view): time, next event, to-dos over scenery. Caption: "Half open, a desk display"
6. Month page as a mountain with flags. Caption: "Your month, as a mountain"
7. Outside screen glance. Caption: "A calm glance when closed"

Status: the spec lists the Today, Week, horizon and Duo screens as approved mockups on 2026-11-14, and the foundations plan says "iPhone Duo sizes were not screenshotted". Capture real screenshots only from the built app; mockups must not be submitted as screenshots.

---

## 6. App privacy answers ("nutrition label")

Basis: the iOS app signs in with an email and password and syncs the person's data to the project's own Supabase backend (`Services/SupabaseClient.swift`, `Services/AuthService.swift`). The app links one third-party package, `supabase-swift` (`project.yml`, `packages:`), plus its dependencies in `SymphonyOS.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved` (swift-asn1, swift-clocks, swift-concurrency-extras, swift-crypto, swift-http-types, swift-issue-reporting, xctest-dynamic-overlay). I found no analytics, advertising, attribution or crash-reporting SDK in `project.yml`, `Package.resolved` or the source files searched. There is no `PrivacyInfo.xcprivacy` in the repository (searched for it; none found). "Tracking" is answered No throughout because I found no advertising SDK, no data sharing with data brokers, and no cross-app identifiers; the repo cannot prove what the owner does outside it.

| Data type (Apple's label) | Collected? | Linked to the person? | Used for tracking? | Purpose | Where found |
|---|---|---|---|---|---|
| Contact info: Email address | Yes | Yes | No | App functionality (account) | `Services/AuthService.swift` (`signUp`, `signIn` with email and password); `Views/Settings/SettingsView.swift` shows the email |
| Identifiers: User ID | Yes | Yes | No | App functionality | Supabase auth user id used as the owner of every row (`App/SymphonyApp.swift`, `PushTokens.store`, reads `supabase.auth.session.user.id`) |
| User content: Other user content (tasks, goals, notes, the walk's answers, family names where entered) | Yes | Yes | No | App functionality | Syncs to Supabase (`Services/SupabaseClient.swift`, sync engine in `App/ContentView.swift`); privacy page lists "Task Data" and "Family Information" (`public/privacy.html`) |
| User content: Photos or videos | NOT VERIFIED | Would be Yes | No | App functionality | `Views/Task/TaskAttachmentsSection.swift` uploads photos to the `attachments` bucket (`Services/DocumentIngest.swift`). Photo and paper capture are hidden in light by `Models/Edition.swift`, but I found no edition check in `TaskAttachmentsSection.swift`, so the owner must confirm whether a light user can reach it. If yes, answer Yes. |
| User content: Audio data | No (as far as found) | n/a | n/a | n/a | `Views/Capture/TellSheet.swift` sets `requiresOnDeviceRecognition = true` when the device supports it and sends no audio to the backend in the code I read. NOT VERIFIED: where on-device recognition is unsupported, `onDeviceOnly` defaults to false (`TellSheet.swift:105`), so Apple's own speech service may process audio. Only the walk sets `onDeviceOnly = true` (`Walk/WalkModel.swift:114`). The owner should decide whether to answer for that case. |
| Other data: calendar events | No (as far as found) | n/a | n/a | n/a | Apple Calendar is read on the device with EventKit (`Services/AppleCalendar.swift`); I found no code that uploads those events. NOT VERIFIED: confirm no event is stored server-side. Google Calendar is full-edition only (`Models/Edition.swift`). |
| Identifiers: Device ID (push token) | NOT VERIFIED | Yes if collected | No | App functionality | `App/SymphonyApp.swift` stores an APNs token in `device_tokens` if registration succeeds, but `App/ContentView.swift:89` says "no-op until the Push capability is added" and the iOS entitlements file contains only macOS sandbox keys. Confirm whether the shipped build has the Push capability; if yes, answer Yes. |
| Usage data, diagnostics (crash data, performance) | NOT VERIFIED | n/a | No | n/a | No SDK found. Apple's own crash reports reach the developer only if the person opts in. `public/privacy.html` says the web app collects "usage data" and "error logs"; the owner must confirm whether the backend or hosting keeps anything for the iPhone app. |
| Location, contacts (address book), health, financial, browsing history, search history, purchases, sensitive info | No | n/a | n/a | n/a | No permission string for any of these in `App/Info.plist`; `Features.placeSearch` (address search through the backend) is full edition only (`Models/Edition.swift`). Plus early access (spec) would record interest; the Swift sources contain no such code yet, so NOT VERIFIED how it will store data. |

Account deletion exists in the app: Settings, "Delete account" (`Views/Settings/SettingsView.swift`, `Views/Settings/DeleteAccountView.swift`, `Services/AccountDeletion.swift`, server function `supabase/functions/delete-account`). Per the plan's release checklist, the server side is not yet applied or deployed.

---

## 7. Permission prompts

Exact strings in `apple/SymphonyOS/SymphonyOS/App/Info.plist`:

| Key | Current string | Reads truthfully for light? | Suggested rewording |
|---|---|---|---|
| `NSMicrophoneUsageDescription` | "Tell Symphony what changed by speaking instead of typing." | Mostly. "Tell Symphony what changed" is jargon for a new user, and the walk and add bar are about adding goals and tasks. | "Symphony listens while you hold or tap the light, so you can say a goal or task instead of typing it." |
| `NSSpeechRecognitionUsageDescription` | "Turn what you say to Tell Symphony into text." | Truthful; same jargon. It does not say speech is processed on the phone. | "Symphony turns what you say into text, on your iPhone where it can, so you can add goals and tasks by voice." (Edit only if the on-device question in section 10 is settled.) |
| `NSCalendarsFullAccessUsageDescription` | "Show your calendar on Today, beside your to-dos. Symphony only reads it." | Yes. The spec says Apple Calendar is read-only in light. | Keep. |
| `NSCameraUsageDescription` | "Scan documents to create tasks with the photo attached." | Not for light. Paper and photo capture are hidden in light (`Models/Edition.swift`, spec non-goals), and the AI photo call is not in light. If the attachments camera is reachable, the string misdescribes it. | If the camera stays reachable in light: "Take a photo to attach to a task." If it is hidden: consider removing the key and its code path, since an unused permission string invites a review question. |
| `NSPhotoLibraryUsageDescription` | "Attach a photo or screenshot to a new task." | Truthful if the attachments picker is reachable in light (see section 6). | Keep if reachable. |
| Notifications (not a plist key) | The app calls `UNUserNotificationCenter.requestAuthorization(options: [.alert, .sound, .badge])` at launch with no explanation (`App/ContentView.swift:49-51`, `Views/Timeline/TodayView.swift:692`). | Local reminders for timed tasks only (`NotificationManager.reconcile`). A prompt on first launch, before the person has any timed task, is likely to be declined. | Ask after the person first sets a time, with a line such as "Remind you when a timed task is due." Owner decision. |

Also present: `NSSupportsLiveActivities` is true (Lock Screen "next up", `LiveActivity/NextUpActivity.swift`). No location, Face ID, contacts, Bluetooth, Health or tracking (`NSUserTrackingUsageDescription`) keys exist. There is no `PrivacyInfo.xcprivacy` file; see section 10.

---

## 8. App Review notes

```
Symphony needs an account. Use the demo account below, or create one on the sign-in screen with an email and password.

Demo account
Email: [OWNER: demo email]
Password: [OWNER: demo password]

How to try it
- The first walk starts automatically for a new account with no goals. Hold the light, speak, and let go to add a goal; or tap More at the top (or the light) to open its choices and type instead. Back and Leave for now are at the top, the gold Next button at the foot. The walk can be replayed from Settings.
- After the walk, Today and Week have an add bar at the foot of the page. Type in it, or tap the light to speak.

Account deletion
Open More, then Settings, then Delete account. It asks for confirmation and deletes the account and the person's data on the server.

Speech
Speech recognition is used only to turn the person's spoken goals and tasks into text. It is requested on-device where the iPhone supports it. Microphone and speech permissions are asked the first time the person speaks. [OWNER: confirm the on-device wording, see section 10.]

Calendar
Apple Calendar access is optional and read-only; it is requested at the walk's Today step.

This is the free "light" edition. Features such as the assistant, family sharing and the web app are not part of it. Symphony Plus is announced as coming; there is no purchase in this version.

iPhone Duo
The app has layouts for the Duo's outside screen, inside screen, and half-open posture. [OWNER: tell the reviewer how to see them, or whether to review on a regular iPhone.]
```

The "Settings" path matches `Views/Settings/SettingsView.swift` (Account section, "Delete account"); More is the third dock tab (`Models/Edition.swift`, `AppTab.visible`).

---

## 9. Age rating, categories, URLs

**Age rating (Apple questionnaire), suggested answers:** no violence, sexual content, profanity, horror, medical content, gambling, contests, or alcohol/tobacco/drug references; no unrestricted web access; no user-generated content shared with other users in light (family sharing is hidden); no in-app purchases in this release. Likely rating 4+. The existing privacy page says the product "is not intended for children under 13" (`public/privacy.html`); the owner should decide whether that conflicts with a 4+ rating, since a 4+ app is not age-restricted. NOT VERIFIED against the live questionnaire.

**Categories:** primary Productivity; secondary Lifestyle. (Judgment, not from the repo.)

**URLs the app and web already use**
- Privacy policy: `https://www.symphony-os.com/privacy`. The sign-up form links this (`src/components/AuthForm.tsx:248`) and the landing footer links `/privacy` (`landing/index.html:410`). Source files: `landing/privacy.html` and `public/privacy.html` ("Last updated: September 26, 2026"). I did not diff the two. NOT VERIFIED that the live URL serves the current text.
- Support URL: NOT VERIFIED. No support page was found. The privacy page lists `support@symphony-os.com` and the app's delete-account failure message says `hello@symphony-os.com` (`Views/Settings/DeleteAccountView.swift`). App Store Connect needs a URL, not an email; the landing page (`https://www.symphony-os.com`) is the only candidate.
- Marketing URL: `https://www.symphony-os.com` (landing, per `landing/index.html`).
- Terms: `https://app.symphony-os.com/terms.html` (linked from `landing/index.html:410`; `public/terms.html` exists).

---

## 10. Open questions for the owner

1. The privacy policy is out of date for the iPhone light app: it describes the web app and Google Calendar only, says deletion is by emailing support, and does not mention Apple Calendar, speech, the camera, or the iPhone app (`public/privacy.html`). Update it before submitting, and say whether to keep "under 13" language.
2. Support email differs: the privacy page says `support@symphony-os.com`, the app says `hello@symphony-os.com`. Which is the support address, and what is the Support URL?
3. Speech: `TellSheet.swift` requires on-device recognition only when the device supports it, and only the walk forces it (`onDeviceOnly = true`). The description says speech is turned into words on the phone. Do you want the add bar to force on-device too, or soften the wording to "where your iPhone supports it"?
4. Is the camera and photo attachments section reachable in a light account? The spec hides photographing a paper page, but `Views/Task/TaskAttachmentsSection.swift` has no edition check. This decides the camera and photo permission strings and the Photos line in the privacy label.
5. Is the Push capability in the shipped build? `ContentView.swift:89` says it is a no-op without it; this decides the Device ID privacy answer.
6. No `PrivacyInfo.xcprivacy` exists in the repo. Apple asks for one when the app or its packages use required-reason APIs; does the build include one from the package or Xcode, and does the app itself use `UserDefaults` (it does: `EditionMemory` in `Models/Edition.swift`)?
7. The spec says the invite gate opens to everyone only at the end (`20261113170000_open_signup.sql`); the app still shows an invite-only message and "Request an invite" link (`Views/Shared/AuthView.swift`, `Services/AuthService.swift`). That text must change before review, or reviewers cannot create an account.
8. Which of the spec's approved screens are built? The listing describes the walk, the add bar, the signpost, Week, and the Month, Season and Year mountain pages. The spec says they were approved for building on 2026-11-14, and the foundations plan says Duo sizes were not screenshotted. I did not verify each in the app. Check the description against the build.
9. The spec's "Plus early access" button (More, and once after the first walk) does not appear in the Swift sources I searched. If it is not built, the Review notes and description are fine as written (they only say Plus is coming), but the privacy label would change once it records interest.
10. Is the name "Symphony" free in the App Store, or do you need "Symphony OS" or a suffix? The app's bundle display name is "Symphony" (`project.yml`).
11. "iPhone Duo" appears in the keywords as "foldable" and "dual screen" and in the text as "iPhone Duo". Confirm you are comfortable using the product name and the Apple trademark rules for it.
12. Age rating: suggested 4+, but the privacy page says the product is not intended for children under 13. Pick one position.
13. The Info.plist forces `UIUserInterfaceStyle` Light. Screenshots should be light mode. Confirm that is intended for the listing.
14. The spec says the free version must have no AI calls; the code still contains `analyze-capture`, `PageIngest` and Google Calendar calls, which are gated by edition on the client and the plan says on the server. I did not verify the server gating. The label "no AI in light" is therefore unverified.
15. The plan's release checklist is not complete: the edition, membership and deletion migrations and the `delete-account` function are not yet applied or deployed. In-app deletion will not work against the live backend until they are.
16. Demo account: needs a light household, an account name, and a password you create (placeholders in section 8).

## Changed since this draft (2026-11-17)

The light edition now has ONE AI feature, by Scott's decision of 2026-11-17: in the walk, when the person asks for examples under a goal, the app sends that goal, the goals above it, the area's name and the period to Symphony's server (`walk-suggest`), which asks Anthropic's Claude for three next steps. Nothing is sent unless the person asks. Capped per household on the server.

What this changes here:
- Item 14 above ("the free version must have no AI calls") no longer holds as written.
- The privacy answers' categories do not change (user content, collected for app functionality, not used for tracking), but the privacy policy should name the AI provider as a processor for this feature, and no listing text may say that a free account's plan never leaves the phone or that the free version has no AI.
- The walk still listens on the phone only; what is sent is the text of the goal.
