import Testing
import CoreGraphics
@testable import Symphony

/// The iPhone Duo's notebook cover: which screen gets it, and how the band
/// stretches and snaps.
struct NotebookCoverRulesTests {

    @Test func outsideScreenGetsTheCoverEitherWayUp() {
        #expect(NotebookCoverRules.isOutsideScreen(CGSize(width: 466, height: 678), hasFold: false))
        #expect(NotebookCoverRules.isOutsideScreen(CGSize(width: 678, height: 466), hasFold: false))
    }

    @Test func insideScreenAndRegularPhonesDoNot() {
        // Inside screen, upright and sideways — and it has a fold anyway.
        #expect(!NotebookCoverRules.isOutsideScreen(CGSize(width: 626, height: 890), hasFold: false))
        #expect(!NotebookCoverRules.isOutsideScreen(CGSize(width: 890, height: 626), hasFold: true))
        // A window the outside screen's size but with a fold is the inside one.
        #expect(!NotebookCoverRules.isOutsideScreen(CGSize(width: 466, height: 678), hasFold: true))
        // Regular iPhones, upright and on their side.
        #expect(!NotebookCoverRules.isOutsideScreen(CGSize(width: 402, height: 874), hasFold: false))
        #expect(!NotebookCoverRules.isOutsideScreen(CGSize(width: 440, height: 956), hasFold: false))
        #expect(!NotebookCoverRules.isOutsideScreen(CGSize(width: 874, height: 402), hasFold: false))
        #expect(!NotebookCoverRules.isOutsideScreen(.zero, hasFold: false))
    }

    @Test func bandStretchesOneToOneAtFirstThenStiffens() {
        let small = NotebookCoverRules.stretch(forDrag: 10)
        #expect(small > 9 && small <= 10)
        #expect(NotebookCoverRules.stretch(forDrag: -10) == -small)
        let far = NotebookCoverRules.stretch(forDrag: 2000)
        #expect(far < NotebookCoverRules.maxStretch)
        #expect(far > NotebookCoverRules.maxStretch * 0.99)
    }

    @Test func aGentlePullSlidesBackAndAFirmOneSnaps() {
        #expect(!NotebookCoverRules.snaps(atStretch: NotebookCoverRules.stretch(forDrag: 40)))
        #expect(NotebookCoverRules.snaps(atStretch: NotebookCoverRules.stretch(forDrag: 120)))
        #expect(NotebookCoverRules.snaps(atStretch: NotebookCoverRules.stretch(forDrag: -120)))
        // Even the longest pull reaches the snap point.
        #expect(NotebookCoverRules.maxStretch > NotebookCoverRules.snapDistance)
    }

    @Test func bandThinsAsItStretches() {
        #expect(NotebookCoverRules.bandWidth(rest: 10, stretch: 0) == 10)
        #expect(NotebookCoverRules.bandWidth(rest: 10, stretch: NotebookCoverRules.maxStretch) == 6)
        #expect(NotebookCoverRules.bandWidth(rest: 10, stretch: 999) == 6)
    }
}
