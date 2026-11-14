import AVFoundation
import Combine
import Foundation
import Speech

/// User-initiated on-device speech capture. Audio is never sent to our server.
@MainActor
final class JobVoiceRecorder: ObservableObject {
    @Published private(set) var transcript = ""
    @Published private(set) var isRecording = false
    @Published private(set) var errorMessage: String?

    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?

    func start(language: String) async {
        stop()
        errorMessage = nil

        let speechAuthorized = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
        guard speechAuthorized else {
            errorMessage = String(localized: "estimate.speech_denied")
            return
        }
        let microphoneAuthorized = await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { granted in
                continuation.resume(returning: granted)
            }
        }
        guard microphoneAuthorized else {
            errorMessage = String(localized: "estimate.mic_denied")
            return
        }

        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: language == "es" ? "es-MX" : "en-US")),
              recognizer.isAvailable else {
            errorMessage = String(localized: "estimate.speech_unavailable")
            return
        }
        guard recognizer.supportsOnDeviceRecognition else {
            errorMessage = String(localized: "estimate.speech_offline_unsupported")
            return
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let nextRequest = SFSpeechAudioBufferRecognitionRequest()
            nextRequest.shouldReportPartialResults = true
            nextRequest.requiresOnDeviceRecognition = true
            let input = engine.inputNode
            let format = input.outputFormat(forBus: 0)
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                nextRequest.append(buffer)
            }
            request = nextRequest
            engine.prepare()
            try engine.start()
            isRecording = true
            task = recognizer.recognitionTask(with: nextRequest) { [weak self] result, error in
                let words = result?.bestTranscription.formattedString
                let finished = result?.isFinal ?? false
                let failed = error != nil
                Task { @MainActor in
                    if let words { self?.transcript = words }
                    if finished || failed { self?.stop() }
                }
            }
        } catch {
            errorMessage = String(localized: "estimate.microphone_error")
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
}
