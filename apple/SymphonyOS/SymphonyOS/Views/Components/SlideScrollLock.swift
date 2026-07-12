import SwiftUI

/// Shared, per-screen coordinator that lets a `SlideRow` freeze its enclosing
/// `ScrollView` the moment a horizontal swipe is recognized.
///
/// Why this exists: a `SlideRow` reveals its actions with a `DragGesture`
/// attached via `.simultaneousGesture` inside a `ScrollView`. On iOS 27 the
/// ScrollView's pan recognizer became more eager and wins arbitration once a
/// touch drifts a little, cancelling the simultaneous drag — so no swipe (left
/// to complete, right to reveal actions) ever fired. Toggling `.scrollDisabled`
/// on the ScrollView the instant we detect a horizontal drag stops it from
/// competing, so the drag runs to completion. Vertical pans never lock, so
/// scrolling is untouched.
///
/// The owning screen creates one of these as `@State`, applies
/// `.scrollDisabled(lock.locked)` to its `ScrollView`, and injects it into the
/// environment so descendant `SlideRow`s can set it. Rows read it as an
/// *optional* environment value, so a `SlideRow` used without a coordinator
/// (previews, macOS split view) simply skips the coordination instead of
/// crashing.
@Observable
final class SlideScrollLock {
    var locked = false
}
