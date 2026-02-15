import Foundation
import Speech
import AVFoundation

/// Hawkeye Speech CLI — uses macOS SFSpeechRecognizer for on-device speech recognition
/// Usage: hawkeye-speech <command> [args]
/// Commands:
///   listen <duration_secs>  — Record from microphone and transcribe (returns JSON)
///   file <audio_path>       — Transcribe an audio file (returns JSON)
///   status                  — Check speech recognition availability

struct SpeechResult: Codable {
    let text: String
    let isFinal: Bool
    let confidence: Float
    let language: String
    let durationMs: Int64
}

struct SpeechStatus: Codable {
    let available: Bool
    let authorized: Bool
    let locale: String
}

// MARK: - Authorization

func requestAuthorization() -> Bool {
    let semaphore = DispatchSemaphore(value: 0)
    var authorized = false

    SFSpeechRecognizer.requestAuthorization { status in
        authorized = (status == .authorized)
        semaphore.signal()
    }
    semaphore.wait()
    return authorized
}

// MARK: - Status

func checkStatus() {
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    let authorized = requestAuthorization()

    let status = SpeechStatus(
        available: recognizer?.isAvailable ?? false,
        authorized: authorized,
        locale: Locale.current.identifier
    )

    let encoder = JSONEncoder()
    encoder.outputFormatting = .sortedKeys
    if let data = try? encoder.encode(status),
       let json = String(data: data, encoding: .utf8) {
        print(json)
    }
}

// MARK: - File Transcription

func transcribeFile(path: String) {
    guard requestAuthorization() else {
        fputs("Error: Speech recognition not authorized\n", stderr)
        exit(1)
    }

    let fileURL = URL(fileURLWithPath: path)
    guard FileManager.default.fileExists(atPath: path) else {
        fputs("Error: File not found: \(path)\n", stderr)
        exit(1)
    }

    // Try both English and Chinese recognizers
    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    guard let recognizer = recognizer, recognizer.isAvailable else {
        fputs("Error: Speech recognizer not available\n", stderr)
        exit(1)
    }

    let request = SFSpeechURLRecognitionRequest(url: fileURL)
    if #available(macOS 13.0, *) {
        request.requiresOnDeviceRecognition = true
    }

    let semaphore = DispatchSemaphore(value: 0)
    let startTime = Date()

    recognizer.recognitionTask(with: request) { result, error in
        if let error = error {
            fputs("Error: Recognition failed: \(error.localizedDescription)\n", stderr)
            semaphore.signal()
            return
        }

        guard let result = result else {
            semaphore.signal()
            return
        }

        if result.isFinal {
            let elapsed = Int64(Date().timeIntervalSince(startTime) * 1000)
            let bestTranscription = result.bestTranscription

            let confidence: Float
            if !bestTranscription.segments.isEmpty {
                confidence = bestTranscription.segments.reduce(Float(0)) { $0 + $1.confidence } / Float(bestTranscription.segments.count)
            } else {
                confidence = 0
            }

            let speechResult = SpeechResult(
                text: bestTranscription.formattedString,
                isFinal: true,
                confidence: confidence,
                language: recognizer.locale.identifier,
                durationMs: elapsed
            )

            let encoder = JSONEncoder()
            encoder.outputFormatting = .sortedKeys
            if let data = try? encoder.encode(speechResult),
               let json = String(data: data, encoding: .utf8) {
                print(json)
            }
            semaphore.signal()
        }
    }

    // Wait up to 30 seconds
    let timeout = DispatchTime.now() + .seconds(30)
    if semaphore.wait(timeout: timeout) == .timedOut {
        fputs("Error: Transcription timed out\n", stderr)
        exit(1)
    }
}

// MARK: - Live Microphone Transcription

func listenFromMicrophone(durationSecs: Int) {
    guard requestAuthorization() else {
        fputs("Error: Speech recognition not authorized\n", stderr)
        exit(1)
    }

    let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    guard let recognizer = recognizer, recognizer.isAvailable else {
        fputs("Error: Speech recognizer not available\n", stderr)
        exit(1)
    }

    let audioEngine = AVAudioEngine()
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = false

    if #available(macOS 13.0, *) {
        request.requiresOnDeviceRecognition = true
    }

    let inputNode = audioEngine.inputNode
    let recordingFormat = inputNode.outputFormat(forBus: 0)

    inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { buffer, _ in
        request.append(buffer)
    }

    let semaphore = DispatchSemaphore(value: 0)
    let startTime = Date()

    recognizer.recognitionTask(with: request) { result, error in
        if let error = error {
            // Ignore cancellation errors (expected when we stop)
            if (error as NSError).code != 216 { // 216 = kAFAssistantErrorDomain canceled
                fputs("Warning: \(error.localizedDescription)\n", stderr)
            }
            semaphore.signal()
            return
        }

        guard let result = result, result.isFinal else {
            return
        }

        let elapsed = Int64(Date().timeIntervalSince(startTime) * 1000)
        let bestTranscription = result.bestTranscription

        let confidence: Float
        if !bestTranscription.segments.isEmpty {
            confidence = bestTranscription.segments.reduce(Float(0)) { $0 + $1.confidence } / Float(bestTranscription.segments.count)
        } else {
            confidence = 0
        }

        let speechResult = SpeechResult(
            text: bestTranscription.formattedString,
            isFinal: true,
            confidence: confidence,
            language: recognizer.locale.identifier,
            durationMs: elapsed
        )

        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        if let data = try? encoder.encode(speechResult),
           let json = String(data: data, encoding: .utf8) {
            print(json)
        }
        semaphore.signal()
    }

    do {
        audioEngine.prepare()
        try audioEngine.start()
    } catch {
        fputs("Error: Could not start audio engine: \(error.localizedDescription)\n", stderr)
        exit(1)
    }

    // Record for specified duration
    DispatchQueue.global().asyncAfter(deadline: .now() + .seconds(durationSecs)) {
        audioEngine.stop()
        inputNode.removeTap(onBus: 0)
        request.endAudio()
    }

    // Wait for result (duration + 5s grace period)
    let timeout = DispatchTime.now() + .seconds(durationSecs + 5)
    if semaphore.wait(timeout: timeout) == .timedOut {
        audioEngine.stop()
        inputNode.removeTap(onBus: 0)
        request.endAudio()

        // Output empty result on timeout
        let speechResult = SpeechResult(
            text: "",
            isFinal: true,
            confidence: 0,
            language: recognizer.locale.identifier,
            durationMs: Int64(durationSecs * 1000)
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        if let data = try? encoder.encode(speechResult),
           let json = String(data: data, encoding: .utf8) {
            print(json)
        }
    }
}

// MARK: - Main

guard CommandLine.arguments.count >= 2 else {
    fputs("Usage: hawkeye-speech <command> [args]\n", stderr)
    fputs("Commands:\n", stderr)
    fputs("  listen <duration_secs>  — Record and transcribe\n", stderr)
    fputs("  file <audio_path>       — Transcribe audio file\n", stderr)
    fputs("  status                  — Check availability\n", stderr)
    exit(1)
}

let command = CommandLine.arguments[1]

switch command {
case "status":
    checkStatus()

case "file":
    guard CommandLine.arguments.count >= 3 else {
        fputs("Usage: hawkeye-speech file <audio_path>\n", stderr)
        exit(1)
    }
    transcribeFile(path: CommandLine.arguments[2])

case "listen":
    let duration = CommandLine.arguments.count >= 3 ? Int(CommandLine.arguments[2]) ?? 5 : 5
    listenFromMicrophone(durationSecs: duration)

default:
    fputs("Unknown command: \(command)\n", stderr)
    exit(1)
}
