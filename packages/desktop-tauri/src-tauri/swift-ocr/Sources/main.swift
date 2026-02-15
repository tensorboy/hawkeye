import Foundation
import Vision

#if canImport(AppKit)
import AppKit
#endif

/// Hawkeye OCR CLI — uses macOS Vision API for text recognition
/// Usage: hawkeye-ocr <image-path>
/// Output: JSON array of recognized text regions

struct OcrRegion: Codable {
    let text: String
    let confidence: Float
    let bbox: BoundingBox
}

struct BoundingBox: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

func runOcr(imagePath: String) -> [OcrRegion] {
    guard let imageUrl = URL(string: "file://\(imagePath)") ?? URL(fileURLWithPath: imagePath) as URL?,
          let imageSource = CGImageSourceCreateWithURL(imageUrl as CFURL, nil),
          let cgImage = CGImageSourceCreateImageAtIndex(imageSource, 0, nil) else {
        fputs("Error: Cannot load image at \(imagePath)\n", stderr)
        return []
    }

    let semaphore = DispatchSemaphore(value: 0)
    var regions: [OcrRegion] = []

    let request = VNRecognizeTextRequest { request, error in
        defer { semaphore.signal() }

        if let error = error {
            fputs("Error: Vision request failed: \(error.localizedDescription)\n", stderr)
            return
        }

        guard let observations = request.results as? [VNRecognizedTextObservation] else {
            return
        }

        for observation in observations {
            guard let topCandidate = observation.topCandidates(1).first else {
                continue
            }

            let bbox = observation.boundingBox
            let region = OcrRegion(
                text: topCandidate.string,
                confidence: topCandidate.confidence,
                bbox: BoundingBox(
                    x: bbox.origin.x,
                    y: bbox.origin.y,
                    width: bbox.size.width,
                    height: bbox.size.height
                )
            )
            regions.append(region)
        }
    }

    // Configure for accuracy + multiple languages
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true

    // Support multiple languages
    if #available(macOS 13.0, *) {
        request.automaticallyDetectsLanguage = true
    }

    let supportedLanguages = ["en-US", "zh-Hans", "zh-Hant", "ja", "ko", "de", "fr", "es", "pt", "it"]
    let revision = VNRecognizeTextRequest.currentRevision
    if let available = try? VNRecognizeTextRequest.supportedRecognitionLanguages(for: .accurate, revision: revision) {
        let filtered = supportedLanguages.filter { lang in
            available.contains(where: { $0.hasPrefix(lang.prefix(2)) })
        }
        if !filtered.isEmpty {
            request.recognitionLanguages = filtered
        }
    }

    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

    do {
        try handler.perform([request])
    } catch {
        fputs("Error: Failed to perform OCR: \(error.localizedDescription)\n", stderr)
        semaphore.signal()
    }

    semaphore.wait()
    return regions
}

// Main
guard CommandLine.arguments.count >= 2 else {
    fputs("Usage: hawkeye-ocr <image-path>\n", stderr)
    exit(1)
}

let imagePath = CommandLine.arguments[1]

guard FileManager.default.fileExists(atPath: imagePath) else {
    fputs("Error: File not found: \(imagePath)\n", stderr)
    exit(1)
}

let regions = runOcr(imagePath: imagePath)

let encoder = JSONEncoder()
encoder.outputFormatting = .sortedKeys

if let jsonData = try? encoder.encode(regions),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
} else {
    print("[]")
}
