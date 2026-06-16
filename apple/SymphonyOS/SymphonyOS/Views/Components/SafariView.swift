#if os(iOS)
import SwiftUI
import SafariServices

/// Thin SwiftUI wrapper around SFSafariViewController. Shares the device's Safari
/// session (cookies), so a user already signed into the web app connects Google
/// Calendar without logging in again. Used for the calendar connect flow.
struct SafariView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }

    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
#endif
