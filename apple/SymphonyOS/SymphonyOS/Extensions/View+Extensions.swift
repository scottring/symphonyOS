import SwiftUI

extension View {
    /// Conditionally apply a modifier
    @ViewBuilder
    func `if`<Content: View>(_ condition: Bool, transform: (Self) -> Content) -> some View {
        if condition {
            transform(self)
        } else {
            self
        }
    }

    /// Apply modifier only on iOS
    @ViewBuilder
    func iOS<Content: View>(_ transform: (Self) -> Content) -> some View {
        #if os(iOS)
        transform(self)
        #else
        self
        #endif
    }

    /// Apply modifier only on macOS
    @ViewBuilder
    func macOS<Content: View>(_ transform: (Self) -> Content) -> some View {
        #if os(macOS)
        transform(self)
        #else
        self
        #endif
    }
}
