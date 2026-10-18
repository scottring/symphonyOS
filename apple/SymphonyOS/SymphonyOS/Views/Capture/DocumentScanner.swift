#if os(iOS)
import SwiftUI
import VisionKit

/// Presents the system document scanner; returns the first scanned page as JPEG data
/// (nil on cancel/failure).
struct DocumentScanner: UIViewControllerRepresentable {
    var onComplete: (Data?) -> Void

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let vc = VNDocumentCameraViewController()
        vc.delegate = context.coordinator
        return vc
    }

    func updateUIViewController(_ vc: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onComplete: onComplete) }

    final class Coordinator: NSObject, VNDocumentCameraViewControllerDelegate {
        let onComplete: (Data?) -> Void
        init(onComplete: @escaping (Data?) -> Void) { self.onComplete = onComplete }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                          didFinishWith scan: VNDocumentCameraScan) {
            let data = scan.pageCount > 0 ? scan.imageOfPage(at: 0).jpegData(compressionQuality: 0.8) : nil
            controller.dismiss(animated: true) { self.onComplete(data) }
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            controller.dismiss(animated: true) { self.onComplete(nil) }
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController,
                                          didFailWithError error: Error) {
            controller.dismiss(animated: true) { self.onComplete(nil) }
        }
    }
}
#endif
