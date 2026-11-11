import SwiftUI
import SwiftData
#if os(iOS)
import Speech
import AVFoundation
#endif

/// Tell Symphony (the Duo's quick action, its Lock Screen control, and
/// `symphony://tell`): say it, see the words as you say them, send. What you
/// said is read like the capture bar reads typing — "call the dentist
/// tomorrow at 3" lands on that day; anything without a date goes to the
/// Inbox. The words are heard on the phone (on-device when it can).
struct TellSheet: View {
    let userId: UUID
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss
    @State private var listener = Dictation()
    @State private var text = ""
    @FocusState private var typing: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Tell Symphony").font(.custom("CrimsonPro-Regular", size: 26)).foregroundStyle(Color.textPrimary)
                Spacer()
                Button("Cancel") { listener.stop(); dismiss() }.font(.bodyMedium).foregroundStyle(Color.textSecondary)
            }
            TextField("Say it, or type it…", text: $text, axis: .vertical)
                .font(.custom("CrimsonPro-Regular", size: 21))
                .foregroundStyle(Color.textPrimary)
                .lineLimit(2...6)
                .focused($typing)
                .padding(14)
                .background(Color.bgElevated, in: RoundedRectangle(cornerRadius: 16))
                .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.cardBorder, lineWidth: 1))
            Text(note).font(.bodySmall).foregroundStyle(Color.textTertiary)
            HStack(spacing: 10) {
                Button { toggleListening() } label: {
                    Label(listener.isListening ? "Stop" : "Speak", systemImage: listener.isListening ? "stop.fill" : "mic.fill")
                        .font(.bodyMediumBold)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(listener.isListening ? Color.white : Color.ink)
                        .background(listener.isListening ? Color.amberStrong : Color.bgWarm, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                Button { send() } label: {
                    Label("Send", systemImage: "arrow.up")
                        .font(.bodyMediumBold)
                        .frame(maxWidth: .infinity, minHeight: 50)
                        .foregroundStyle(.white)
                        .background(Color.ink, in: RoundedRectangle(cornerRadius: 14))
                }
                .buttonStyle(.plain)
                .disabled(trimmed.isEmpty)
                .opacity(trimmed.isEmpty ? 0.5 : 1)
            }
        }
        .padding(20)
        .background(Color.bgBase.ignoresSafeArea())
        .onChange(of: listener.transcript) { _, words in if !words.isEmpty { text = words } }
        .task { await listener.start() }
        .onDisappear { listener.stop() }
    }

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var note: String {
        if let problem = listener.problem { return problem }
        if listener.isListening { return "Listening… say a day or time to put it on the calendar." }
        return "Anything without a day goes to your Inbox."
    }

    private func toggleListening() {
        if listener.isListening { listener.stop() } else { Task { await listener.start() } }
    }

    private func send() {
        listener.stop()
        let parsed = CaptureParser.parse(trimmed)
        guard !parsed.title.isEmpty else { return }
        _ = TaskViewModel(modelContext: modelContext).createTask(
            title: parsed.title, userId: userId, scheduledFor: parsed.date,
            isAllDay: parsed.date != nil ? !parsed.hasTime : false)
        #if os(iOS)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        #endif
        dismiss()
    }
}

/// Live speech to text for Tell. Main-actor state; the recognizer's callbacks
/// hop back to the main actor.
@MainActor @Observable
final class Dictation {
    var transcript = ""
    var isListening = false
    var problem: String?

    #if os(iOS)
    private let recognizer = SFSpeechRecognizer()
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    #endif

    func start() async {
        #if os(iOS)
        guard !isListening else { return }
        problem = nil
        let speech = await withCheckedContinuation { (c: CheckedContinuation<SFSpeechRecognizerAuthorizationStatus, Never>) in
            SFSpeechRecognizer.requestAuthorization { c.resume(returning: $0) }
        }
        guard speech == .authorized else { problem = "Allow Speech Recognition in Settings to speak — or type it."; return }
        guard await AVAudioApplication.requestRecordPermission() else { problem = "Allow the microphone in Settings to speak — or type it."; return }
        guard let recognizer, recognizer.isAvailable else { problem = "Speech isn't available right now — type it instead."; return }

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            if recognizer.supportsOnDeviceRecognition { request.requiresOnDeviceRecognition = true }
            self.request = request

            Self.feed(engine.inputNode, into: request)
            engine.prepare()
            try engine.start()
            isListening = true

            task = Self.listen(recognizer, to: request) { [weak self] words, done in
                Task { @MainActor in
                    guard let self else { return }
                    if let words { self.transcript = words }
                    if done { self.stop() }
                }
            }
        } catch {
            problem = "Couldn't start listening — type it instead."
            stop()
        }
        #else
        problem = "Type it here."
        #endif
    }

    #if os(iOS)
    /// The microphone's buffers, on the audio thread, into the request.
    nonisolated private static func feed(_ input: AVAudioInputNode, into request: SFSpeechAudioBufferRecognitionRequest) {
        let format = input.outputFormat(forBus: 0)
        input.removeTap(onBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
    }

    /// The recognizer's results, off the main actor; `update` hops back.
    nonisolated private static func listen(_ recognizer: SFSpeechRecognizer, to request: SFSpeechAudioBufferRecognitionRequest,
                                           update: @escaping @Sendable (String?, Bool) -> Void) -> SFSpeechRecognitionTask {
        recognizer.recognitionTask(with: request) { result, error in
            update(result?.bestTranscription.formattedString, error != nil || (result?.isFinal ?? false))
        }
    }
    #endif

    func stop() {
        #if os(iOS)
        guard isListening || task != nil else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
        task?.cancel()
        request = nil
        task = nil
        isListening = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        #endif
    }
}
