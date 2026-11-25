import AVFoundation
import Foundation
import Observation
import Speech

/// User-initiated, on-device speech capture (ported from the team's JobVoiceRecorder, adapted to @Observable).
/// Audio never leaves the phone; only the resulting text is used.
@Observable
final class VoiceRecorder {
    enum Failure: Equatable { case speechDenied, micDenied, unavailable, offlineUnsupported, microphone }

    private(set) var transcript = ""
    private(set) var isRecording = false
    private(set) var failure: Failure?

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    func start(language: AppLanguage) async {
        stop()
        transcript = ""
        failure = nil
        guard await Self.speechAuthorized() else { failure = .speechDenied; return }
        guard await AVAudioApplication.requestRecordPermission() else { failure = .micDenied; return }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language == .es ? "es-MX" : "en-US")),
              recognizer.isAvailable else { failure = .unavailable; return }
        guard recognizer.supportsOnDeviceRecognition else { failure = .offlineUnsupported; return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            let next = SFSpeechAudioBufferRecognitionRequest()
            next.shouldReportPartialResults = true
            next.requiresOnDeviceRecognition = true
            let input = engine.inputNode
            input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in
                next.append(buffer)
            }
            request = next
            engine.prepare()
            try engine.start()
            isRecording = true
            task = recognizer.recognitionTask(with: next) { [weak self] result, error in
                let words = result?.bestTranscription.formattedString
                let done = (result?.isFinal ?? false) || error != nil
                Task { @MainActor in
                    // A stopped recording must not overwrite notes typed or recorded since.
                    guard let self, self.isRecording else { return }
                    if let words { self.transcript = words }
                    if done { self.stop() }
                }
            }
        } catch {
            failure = .microphone
            stop()
        }
    }

    func stop() {
        if engine.isRunning {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        request?.endAudio()
        task?.cancel()
        task = nil
        request = nil
        isRecording = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private nonisolated static func speechAuthorized() async -> Bool {
        await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0 == .authorized) }
        }
    }
}

/// Appends a dictation segment or quick-pick phrase to notes without overwriting them
/// (from the team's SpeechNoteComposer).
nonisolated enum NoteComposer {
    static func append(_ segment: String, to existing: String) -> String {
        let piece = segment.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !piece.isEmpty else { return existing }
        let base = existing.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !base.isEmpty else { return piece }
        let separator = base.hasSuffix(",") || base.hasSuffix(".") ? " " : ", "
        return base + separator + piece
    }
}
