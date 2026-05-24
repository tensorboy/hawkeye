// hawkeye-ane: Gaze MLP training via Accelerate framework
//
// CLI interface:
//   hawkeye-ane train <samples_json> <weights_path> [--epochs N] [--lr F] [--resume]
//   hawkeye-ane infer <weights_path> <features_json>
//   hawkeye-ane status
//
// Model: 3-layer MLP (40 → 128 ReLU → 64 ReLU → 2)
// Training uses Accelerate/vDSP for fast CPU-based backpropagation.

import Foundation
import Accelerate

// MARK: - Data Structures

struct GazeSample: Codable {
    let features: [Float]
    let targetX: Float
    let targetY: Float
    let timestamp: UInt64
}

struct GazeWeights: Codable {
    var w1: [[Float]]  // [128][40]
    var b1: [Float]    // [128]
    var w2: [[Float]]  // [64][128]
    var b2: [Float]    // [64]
    var w3: [[Float]]  // [2][64]
    var b3: [Float]    // [2]
    var trainedAt: UInt64
    var trainLoss: Float
}

struct TrainingResult: Codable {
    let finalLoss: Float
    let epochs: UInt32
    let durationMs: UInt64
    let weightsPath: String
}

struct InferenceResult: Codable {
    let x: Float
    let y: Float
    let confidence: Float
    let latencyUs: UInt64
}

// MARK: - Weight Initialization

func xavierInit(rows: Int, cols: Int) -> [[Float]] {
    let scale = sqrtf(2.0 / Float(rows + cols))
    return (0..<rows).map { _ in
        (0..<cols).map { _ in Float.random(in: -scale...scale) }
    }
}

func initWeights() -> GazeWeights {
    GazeWeights(
        w1: xavierInit(rows: 128, cols: 40),
        b1: [Float](repeating: 0, count: 128),
        w2: xavierInit(rows: 64, cols: 128),
        b2: [Float](repeating: 0, count: 64),
        w3: xavierInit(rows: 2, cols: 64),
        b3: [Float](repeating: 0, count: 2),
        trainedAt: 0,
        trainLoss: 1.0
    )
}

// MARK: - Forward Pass

func relu(_ x: [Float]) -> [Float] {
    x.map { max(0, $0) }
}

func reluGrad(_ x: [Float]) -> [Float] {
    x.map { $0 > 0 ? Float(1.0) : Float(0.0) }
}

func matmul(_ w: [[Float]], _ x: [Float]) -> [Float] {
    let rows = w.count
    let cols = x.count
    var result = [Float](repeating: 0, count: rows)
    for i in 0..<rows {
        var sum: Float = 0
        vDSP_dotpr(w[i], 1, x, 1, &sum, vDSP_Length(cols))
        result[i] = sum
    }
    return result
}

func addBias(_ x: [Float], _ b: [Float]) -> [Float] {
    var result = x
    vDSP_vadd(x, 1, b, 1, &result, 1, vDSP_Length(x.count))
    return result
}

struct ForwardResult {
    let z1: [Float]  // pre-activation layer 1
    let a1: [Float]  // post-relu layer 1
    let z2: [Float]  // pre-activation layer 2
    let a2: [Float]  // post-relu layer 2
    let out: [Float] // final output (2 values)
}

func forward(_ w: GazeWeights, _ input: [Float]) -> ForwardResult {
    let z1 = addBias(matmul(w.w1, input), w.b1)
    let a1 = relu(z1)
    let z2 = addBias(matmul(w.w2, a1), w.b2)
    let a2 = relu(z2)
    let out = addBias(matmul(w.w3, a2), w.b3)
    return ForwardResult(z1: z1, a1: a1, z2: z2, a2: a2, out: out)
}

// MARK: - Backward Pass

func backward(_ w: GazeWeights, _ input: [Float], _ target: [Float], _ fwd: ForwardResult)
    -> (dW1: [[Float]], db1: [Float], dW2: [[Float]], db2: [Float], dW3: [[Float]], db3: [Float], loss: Float)
{
    let batchScale: Float = 1.0

    // Loss: MSE = mean((out - target)^2)
    var diff = [Float](repeating: 0, count: 2)
    vDSP_vsub(target, 1, fwd.out, 1, &diff, 1, 2)
    var loss: Float = 0
    vDSP_dotpr(diff, 1, diff, 1, &loss, 2)
    loss /= 2.0

    // dL/dout = 2 * (out - target) / N
    var dout = diff.map { $0 * 2.0 * batchScale }

    // Layer 3 gradients: dW3, db3
    var dW3 = [[Float]](repeating: [Float](repeating: 0, count: 64), count: 2)
    for i in 0..<2 {
        for j in 0..<64 {
            dW3[i][j] = dout[i] * fwd.a2[j]
        }
    }
    let db3 = dout

    // Backprop through layer 3
    var da2 = [Float](repeating: 0, count: 64)
    for j in 0..<64 {
        var sum: Float = 0
        for i in 0..<2 {
            sum += w.w3[i][j] * dout[i]
        }
        da2[j] = sum
    }

    // Through ReLU
    let rg2 = reluGrad(fwd.z2)
    var dz2 = [Float](repeating: 0, count: 64)
    vDSP_vmul(da2, 1, rg2, 1, &dz2, 1, vDSP_Length(64))

    // Layer 2 gradients
    var dW2 = [[Float]](repeating: [Float](repeating: 0, count: 128), count: 64)
    for i in 0..<64 {
        for j in 0..<128 {
            dW2[i][j] = dz2[i] * fwd.a1[j]
        }
    }
    let db2 = dz2

    // Backprop through layer 2
    var da1 = [Float](repeating: 0, count: 128)
    for j in 0..<128 {
        var sum: Float = 0
        for i in 0..<64 {
            sum += w.w2[i][j] * dz2[i]
        }
        da1[j] = sum
    }

    // Through ReLU
    let rg1 = reluGrad(fwd.z1)
    var dz1 = [Float](repeating: 0, count: 128)
    vDSP_vmul(da1, 1, rg1, 1, &dz1, 1, vDSP_Length(128))

    // Layer 1 gradients
    var dW1 = [[Float]](repeating: [Float](repeating: 0, count: 40), count: 128)
    for i in 0..<128 {
        for j in 0..<40 {
            dW1[i][j] = dz1[i] * input[j]
        }
    }
    let db1 = dz1

    return (dW1, db1, dW2, db2, dW3, db3, loss)
}

// MARK: - Adam Optimizer

struct AdamState {
    var mW1: [[Float]], vW1: [[Float]], mb1: [Float], vb1: [Float]
    var mW2: [[Float]], vW2: [[Float]], mb2: [Float], vb2: [Float]
    var mW3: [[Float]], vW3: [[Float]], mb3: [Float], vb3: [Float]
    var t: Int

    static func zeros(like w: GazeWeights) -> AdamState {
        AdamState(
            mW1: w.w1.map { $0.map { _ in Float(0) } },
            vW1: w.w1.map { $0.map { _ in Float(0) } },
            mb1: [Float](repeating: 0, count: w.b1.count),
            vb1: [Float](repeating: 0, count: w.b1.count),
            mW2: w.w2.map { $0.map { _ in Float(0) } },
            vW2: w.w2.map { $0.map { _ in Float(0) } },
            mb2: [Float](repeating: 0, count: w.b2.count),
            vb2: [Float](repeating: 0, count: w.b2.count),
            mW3: w.w3.map { $0.map { _ in Float(0) } },
            vW3: w.w3.map { $0.map { _ in Float(0) } },
            mb3: [Float](repeating: 0, count: w.b3.count),
            vb3: [Float](repeating: 0, count: w.b3.count),
            t: 0
        )
    }
}

func adamUpdate(
    _ w: inout [[Float]], _ dw: [[Float]],
    _ m: inout [[Float]], _ v: inout [[Float]],
    lr: Float, beta1: Float, beta2: Float, eps: Float, t: Int
) {
    let bc1 = 1.0 - powf(beta1, Float(t))
    let bc2 = 1.0 - powf(beta2, Float(t))
    for i in 0..<w.count {
        for j in 0..<w[i].count {
            m[i][j] = beta1 * m[i][j] + (1.0 - beta1) * dw[i][j]
            v[i][j] = beta2 * v[i][j] + (1.0 - beta2) * dw[i][j] * dw[i][j]
            let mHat = m[i][j] / bc1
            let vHat = v[i][j] / bc2
            w[i][j] -= lr * mHat / (sqrtf(vHat) + eps)
        }
    }
}

func adamUpdateBias(
    _ b: inout [Float], _ db: [Float],
    _ m: inout [Float], _ v: inout [Float],
    lr: Float, beta1: Float, beta2: Float, eps: Float, t: Int
) {
    let bc1 = 1.0 - powf(beta1, Float(t))
    let bc2 = 1.0 - powf(beta2, Float(t))
    for i in 0..<b.count {
        m[i] = beta1 * m[i] + (1.0 - beta1) * db[i]
        v[i] = beta2 * v[i] + (1.0 - beta2) * db[i] * db[i]
        let mHat = m[i] / bc1
        let vHat = v[i] / bc2
        b[i] -= lr * mHat / (sqrtf(vHat) + eps)
    }
}

// MARK: - Training

func train(samplesPath: String, weightsPath: String, epochs: Int, lr: Float, resume: Bool) -> TrainingResult {
    let start = DispatchTime.now()

    // Load samples
    guard let data = FileManager.default.contents(atPath: samplesPath),
          let samples = try? JSONDecoder().decode([GazeSample].self, from: data),
          !samples.isEmpty else {
        fputs("Error: Failed to load samples from \(samplesPath)\n", stderr)
        exit(1)
    }

    // Initialize or load weights
    var weights: GazeWeights
    if resume, let wData = FileManager.default.contents(atPath: weightsPath),
       let loaded = try? JSONDecoder().decode(GazeWeights.self, from: wData) {
        weights = loaded
        fputs("Resumed from existing weights (loss=\(loaded.trainLoss))\n", stderr)
    } else {
        weights = initWeights()
        fputs("Initialized new weights (Xavier)\n", stderr)
    }

    var adam = AdamState.zeros(like: weights)
    let beta1: Float = 0.9
    let beta2: Float = 0.999
    let eps: Float = 1e-8

    var bestLoss: Float = Float.infinity
    var epochLoss: Float = 0

    fputs("Training: \(samples.count) samples, \(epochs) epochs, lr=\(lr)\n", stderr)

    for epoch in 0..<epochs {
        epochLoss = 0
        var indices = Array(0..<samples.count)
        indices.shuffle()

        // Accumulate gradients over mini-batch
        var accDW1 = weights.w1.map { $0.map { _ in Float(0) } }
        var accDb1 = [Float](repeating: 0, count: 128)
        var accDW2 = weights.w2.map { $0.map { _ in Float(0) } }
        var accDb2 = [Float](repeating: 0, count: 64)
        var accDW3 = weights.w3.map { $0.map { _ in Float(0) } }
        var accDb3 = [Float](repeating: 0, count: 2)

        let batchSize = min(32, samples.count)

        for batchStart in stride(from: 0, to: samples.count, by: batchSize) {
            let batchEnd = min(batchStart + batchSize, samples.count)
            let batch = batchStart..<batchEnd
            let scale = 1.0 / Float(batch.count)

            // Zero accumulators
            for i in 0..<accDW1.count { for j in 0..<accDW1[i].count { accDW1[i][j] = 0 } }
            for i in 0..<accDb1.count { accDb1[i] = 0 }
            for i in 0..<accDW2.count { for j in 0..<accDW2[i].count { accDW2[i][j] = 0 } }
            for i in 0..<accDb2.count { accDb2[i] = 0 }
            for i in 0..<accDW3.count { for j in 0..<accDW3[i].count { accDW3[i][j] = 0 } }
            for i in 0..<accDb3.count { accDb3[i] = 0 }

            for idx in batch {
                let s = samples[indices[idx]]
                guard s.features.count == 40 else { continue }

                let target: [Float] = [s.targetX, s.targetY]
                let fwd = forward(weights, s.features)
                let (dW1, db1, dW2, db2, dW3, db3, loss) = backward(weights, s.features, target, fwd)

                epochLoss += loss

                // Accumulate
                for i in 0..<dW1.count { for j in 0..<dW1[i].count { accDW1[i][j] += dW1[i][j] * scale } }
                for i in 0..<db1.count { accDb1[i] += db1[i] * scale }
                for i in 0..<dW2.count { for j in 0..<dW2[i].count { accDW2[i][j] += dW2[i][j] * scale } }
                for i in 0..<db2.count { accDb2[i] += db2[i] * scale }
                for i in 0..<dW3.count { for j in 0..<dW3[i].count { accDW3[i][j] += dW3[i][j] * scale } }
                for i in 0..<db3.count { accDb3[i] += db3[i] * scale }
            }

            // Adam update
            adam.t += 1
            adamUpdate(&weights.w1, accDW1, &adam.mW1, &adam.vW1, lr: lr, beta1: beta1, beta2: beta2, eps: eps, t: adam.t)
            adamUpdateBias(&weights.b1, accDb1, &adam.mb1, &adam.vb1, lr: lr, beta1: beta1, beta2: beta2, eps: eps, t: adam.t)
            adamUpdate(&weights.w2, accDW2, &adam.mW2, &adam.vW2, lr: lr, beta1: beta1, beta2: beta2, eps: eps, t: adam.t)
            adamUpdateBias(&weights.b2, accDb2, &adam.mb2, &adam.vb2, lr: lr, beta1: beta1, beta2: beta2, eps: eps, t: adam.t)
            adamUpdate(&weights.w3, accDW3, &adam.mW3, &adam.vW3, lr: lr, beta1: beta1, beta2: beta2, eps: eps, t: adam.t)
            adamUpdateBias(&weights.b3, accDb3, &adam.mb3, &adam.vb3, lr: lr, beta1: beta1, beta2: beta2, eps: eps, t: adam.t)
        }

        epochLoss /= Float(samples.count)

        if epochLoss < bestLoss {
            bestLoss = epochLoss
        }

        // Log progress every 50 epochs
        if epoch % 50 == 0 || epoch == epochs - 1 {
            fputs("  epoch \(epoch)/\(epochs): loss=\(String(format: "%.6f", epochLoss)) best=\(String(format: "%.6f", bestLoss))\n", stderr)
        }

        // Early stopping
        if epochLoss < 1e-6 {
            fputs("  Early stop at epoch \(epoch) (loss < 1e-6)\n", stderr)
            break
        }
    }

    // Save weights
    weights.trainedAt = UInt64(Date().timeIntervalSince1970 * 1000)
    weights.trainLoss = bestLoss

    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    if let jsonData = try? encoder.encode(weights) {
        let url = URL(fileURLWithPath: weightsPath)
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? jsonData.write(to: url)
    }

    let elapsed = DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds
    let durationMs = elapsed / 1_000_000

    return TrainingResult(
        finalLoss: bestLoss,
        epochs: UInt32(epochs),
        durationMs: UInt64(durationMs),
        weightsPath: weightsPath
    )
}

// MARK: - Inference

func infer(weightsPath: String, featuresJson: String) -> InferenceResult {
    guard let wData = FileManager.default.contents(atPath: weightsPath),
          let weights = try? JSONDecoder().decode(GazeWeights.self, from: wData) else {
        fputs("Error: Failed to load weights from \(weightsPath)\n", stderr)
        exit(1)
    }

    guard let fData = featuresJson.data(using: .utf8),
          let features = try? JSONDecoder().decode([Float].self, from: fData),
          features.count == 40 else {
        fputs("Error: Invalid features (expected 40 floats)\n", stderr)
        exit(1)
    }

    let start = DispatchTime.now()
    let fwd = forward(weights, features)
    let elapsed = DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds

    let x = min(max(fwd.out[0], 0), 1)
    let y = min(max(fwd.out[1], 0), 1)

    let confidence: Float = weights.trainLoss < 0.01 ? 0.95 : (weights.trainLoss < 0.05 ? 0.8 : 0.6)

    return InferenceResult(
        x: x,
        y: y,
        confidence: confidence,
        latencyUs: UInt64(elapsed / 1000)
    )
}

// MARK: - Main

let args = CommandLine.arguments

guard args.count >= 2 else {
    fputs("Usage: hawkeye-ane <train|infer|status> [...]\n", stderr)
    exit(1)
}

let command = args[1]

switch command {
case "train":
    guard args.count >= 4 else {
        fputs("Usage: hawkeye-ane train <samples_json> <weights_path> [--epochs N] [--lr F] [--resume]\n", stderr)
        exit(1)
    }
    let samplesPath = args[2]
    let weightsPath = args[3]

    var epochs = 500
    var lr: Float = 0.001
    var resume = false

    var i = 4
    while i < args.count {
        switch args[i] {
        case "--epochs":
            i += 1; epochs = Int(args[i]) ?? 500
        case "--lr":
            i += 1; lr = Float(args[i]) ?? 0.001
        case "--resume":
            resume = true
        default:
            break
        }
        i += 1
    }

    let result = train(samplesPath: samplesPath, weightsPath: weightsPath, epochs: epochs, lr: lr, resume: resume)
    let encoder = JSONEncoder()
    if let json = try? encoder.encode(result), let str = String(data: json, encoding: .utf8) {
        print(str)
    }

case "infer":
    guard args.count >= 4 else {
        fputs("Usage: hawkeye-ane infer <weights_path> <features_json>\n", stderr)
        exit(1)
    }
    let result = infer(weightsPath: args[2], featuresJson: args[3])
    let encoder = JSONEncoder()
    if let json = try? encoder.encode(result), let str = String(data: json, encoding: .utf8) {
        print(str)
    }

case "status":
    let status: [String: Any] = [
        "available": true,
        "platform": "macOS",
        "backend": "Accelerate"
    ]
    if let data = try? JSONSerialization.data(withJSONObject: status),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }

default:
    fputs("Unknown command: \(command)\n", stderr)
    exit(1)
}
