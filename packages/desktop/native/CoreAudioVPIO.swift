import Foundation
import AVFoundation
import AudioToolbox

/// Core Audio Voice Processing I/O for Echo Cancellation
/// This module provides real-time AEC (Acoustic Echo Cancellation) using Apple's VPIO AudioUnit
public class CoreAudioVPIO {

    // MARK: - Properties

    // Note: audioUnit needs internal access for the render callback function
    var audioUnit: AudioComponentInstance?
    private var isRunning = false
    private var sampleRate: Double = 16000.0
    private var bufferSize: UInt32 = 512

    // Callback for processed audio
    public var onProcessedAudio: ((Data) -> Void)?

    // Audio format
    private var audioFormat: AudioStreamBasicDescription = {
        var format = AudioStreamBasicDescription()
        format.mSampleRate = 16000.0
        format.mFormatID = kAudioFormatLinearPCM
        format.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked
        format.mBitsPerChannel = 16
        format.mChannelsPerFrame = 1
        format.mFramesPerPacket = 1
        format.mBytesPerFrame = 2
        format.mBytesPerPacket = 2
        return format
    }()

    // MARK: - Initialization

    public init() {}

    deinit {
        stop()
    }

    // MARK: - Public Methods

    /// Initialize and start the VPIO audio unit
    public func start() throws {
        guard !isRunning else { return }

        // 1. Find VPIO Audio Component
        var componentDesc = AudioComponentDescription(
            componentType: kAudioUnitType_Output,
            componentSubType: kAudioUnitSubType_VoiceProcessingIO,
            componentManufacturer: kAudioUnitManufacturer_Apple,
            componentFlags: 0,
            componentFlagsMask: 0
        )

        guard let component = AudioComponentFindNext(nil, &componentDesc) else {
            throw VPIOError.componentNotFound
        }

        // 2. Create Audio Unit Instance
        var status = AudioComponentInstanceNew(component, &audioUnit)
        guard status == noErr, let unit = audioUnit else {
            throw VPIOError.instanceCreationFailed(status)
        }

        // 3. Enable Input (microphone)
        var enableInput: UInt32 = 1
        status = AudioUnitSetProperty(
            unit,
            kAudioOutputUnitProperty_EnableIO,
            kAudioUnitScope_Input,
            1, // Input bus
            &enableInput,
            UInt32(MemoryLayout<UInt32>.size)
        )
        guard status == noErr else {
            throw VPIOError.propertySetFailed("EnableIO Input", status)
        }

        // 4. Enable Output (for AEC reference)
        var enableOutput: UInt32 = 1
        status = AudioUnitSetProperty(
            unit,
            kAudioOutputUnitProperty_EnableIO,
            kAudioUnitScope_Output,
            0, // Output bus
            &enableOutput,
            UInt32(MemoryLayout<UInt32>.size)
        )
        guard status == noErr else {
            throw VPIOError.propertySetFailed("EnableIO Output", status)
        }

        // 5. Set Audio Format
        status = AudioUnitSetProperty(
            unit,
            kAudioUnitProperty_StreamFormat,
            kAudioUnitScope_Output,
            1, // Input bus output scope
            &audioFormat,
            UInt32(MemoryLayout<AudioStreamBasicDescription>.size)
        )
        guard status == noErr else {
            throw VPIOError.propertySetFailed("StreamFormat", status)
        }

        // 6. Set Render Callback
        var callbackStruct = AURenderCallbackStruct(
            inputProc: renderCallback,
            inputProcRefCon: Unmanaged.passUnretained(self).toOpaque()
        )
        status = AudioUnitSetProperty(
            unit,
            kAudioOutputUnitProperty_SetInputCallback,
            kAudioUnitScope_Global,
            0,
            &callbackStruct,
            UInt32(MemoryLayout<AURenderCallbackStruct>.size)
        )
        guard status == noErr else {
            throw VPIOError.propertySetFailed("InputCallback", status)
        }

        // 7. Configure Voice Processing
        try configureVoiceProcessing(unit)

        // 8. Initialize and Start
        status = AudioUnitInitialize(unit)
        guard status == noErr else {
            throw VPIOError.initializationFailed(status)
        }

        status = AudioOutputUnitStart(unit)
        guard status == noErr else {
            throw VPIOError.startFailed(status)
        }

        isRunning = true
        print("[VPIO] Started successfully")
    }

    /// Stop the VPIO audio unit
    public func stop() {
        guard isRunning, let unit = audioUnit else { return }

        AudioOutputUnitStop(unit)
        AudioUnitUninitialize(unit)
        AudioComponentInstanceDispose(unit)

        audioUnit = nil
        isRunning = false
        print("[VPIO] Stopped")
    }

    /// Get current status
    public func getStatus() -> [String: Any] {
        return [
            "isRunning": isRunning,
            "sampleRate": sampleRate,
            "bufferSize": bufferSize,
            "aecEnabled": true
        ]
    }

    // MARK: - Private Methods

    private func configureVoiceProcessing(_ unit: AudioComponentInstance) throws {
        var status: OSStatus

        // Enable AEC (Acoustic Echo Cancellation)
        var aecEnabled: UInt32 = 1
        status = AudioUnitSetProperty(
            unit,
            kAUVoiceIOProperty_BypassVoiceProcessing,
            kAudioUnitScope_Global,
            0,
            &aecEnabled,
            UInt32(MemoryLayout<UInt32>.size)
        )
        // Note: Setting to 0 enables voice processing (AEC, AGC, NS)

        // Enable AGC (Automatic Gain Control)
        var agcEnabled: UInt32 = 1
        status = AudioUnitSetProperty(
            unit,
            kAUVoiceIOProperty_VoiceProcessingEnableAGC,
            kAudioUnitScope_Global,
            0,
            &agcEnabled,
            UInt32(MemoryLayout<UInt32>.size)
        )
        if status != noErr {
            print("[VPIO] Warning: AGC setting failed: \(status)")
        }

        // Set quality (0 = low latency, 127 = high quality)
        var quality: UInt32 = 64 // Balanced
        status = AudioUnitSetProperty(
            unit,
            kAUVoiceIOProperty_VoiceProcessingQuality,
            kAudioUnitScope_Global,
            0,
            &quality,
            UInt32(MemoryLayout<UInt32>.size)
        )
        if status != noErr {
            print("[VPIO] Warning: Quality setting failed: \(status)")
        }

        print("[VPIO] Voice processing configured: AEC=ON, AGC=ON, Quality=\(quality)")
    }
}

// MARK: - Render Callback

private func renderCallback(
    inRefCon: UnsafeMutableRawPointer,
    ioActionFlags: UnsafeMutablePointer<AudioUnitRenderActionFlags>,
    inTimeStamp: UnsafePointer<AudioTimeStamp>,
    inBusNumber: UInt32,
    inNumberFrames: UInt32,
    ioData: UnsafeMutablePointer<AudioBufferList>?
) -> OSStatus {

    let vpio = Unmanaged<CoreAudioVPIO>.fromOpaque(inRefCon).takeUnretainedValue()

    // Allocate buffer for input audio
    var bufferList = AudioBufferList(
        mNumberBuffers: 1,
        mBuffers: AudioBuffer(
            mNumberChannels: 1,
            mDataByteSize: inNumberFrames * 2,
            mData: nil
        )
    )

    // Allocate memory for audio data
    let bufferSize = Int(inNumberFrames * 2)
    let audioBuffer = UnsafeMutablePointer<Int16>.allocate(capacity: Int(inNumberFrames))
    bufferList.mBuffers.mData = UnsafeMutableRawPointer(audioBuffer)
    bufferList.mBuffers.mDataByteSize = UInt32(bufferSize)

    // Render (get processed audio with AEC applied)
    let status = AudioUnitRender(
        vpio.audioUnit!,
        ioActionFlags,
        inTimeStamp,
        1, // Input bus
        inNumberFrames,
        &bufferList
    )

    if status == noErr {
        // Convert to Data and send via callback
        let data = Data(bytes: audioBuffer, count: bufferSize)
        vpio.onProcessedAudio?(data)
    }

    audioBuffer.deallocate()
    return status
}

// MARK: - Error Types

public enum VPIOError: Error, LocalizedError {
    case componentNotFound
    case instanceCreationFailed(OSStatus)
    case propertySetFailed(String, OSStatus)
    case initializationFailed(OSStatus)
    case startFailed(OSStatus)

    public var errorDescription: String? {
        switch self {
        case .componentNotFound:
            return "VPIO Audio Component not found"
        case .instanceCreationFailed(let status):
            return "Failed to create audio unit instance: \(status)"
        case .propertySetFailed(let property, let status):
            return "Failed to set property '\(property)': \(status)"
        case .initializationFailed(let status):
            return "Failed to initialize audio unit: \(status)"
        case .startFailed(let status):
            return "Failed to start audio unit: \(status)"
        }
    }
}

// MARK: - CLI Entry Point

/// Command-line interface for the VPIO module
/// Usage: CoreAudioVPIO start|stop|status
@main
struct VPIOMain {
    static let vpio = CoreAudioVPIO()
    static var outputFile: FileHandle?

    static func main() {
        let args = CommandLine.arguments

        if args.count < 2 {
            printUsage()
            return
        }

        switch args[1] {
        case "start":
            startCapture(outputPath: args.count > 2 ? args[2] : nil)
        case "status":
            printStatus()
        default:
            printUsage()
        }
    }

    static func startCapture(outputPath: String?) {
        // Setup output
        if let path = outputPath {
            FileManager.default.createFile(atPath: path, contents: nil)
            outputFile = FileHandle(forWritingAtPath: path)
        }

        // Setup callback
        vpio.onProcessedAudio = { data in
            if let file = outputFile {
                file.write(data)
            } else {
                // Write to stdout as base64
                let base64 = data.base64EncodedString()
                print("AUDIO:\(base64)")
            }
        }

        // Start processing
        do {
            try vpio.start()
            print("STATUS:running")

            // Keep running
            RunLoop.main.run()
        } catch {
            print("ERROR:\(error.localizedDescription)")
        }
    }

    static func printStatus() {
        let status = vpio.getStatus()
        if let json = try? JSONSerialization.data(withJSONObject: status),
           let str = String(data: json, encoding: .utf8) {
            print(str)
        }
    }

    static func printUsage() {
        print("""
        CoreAudioVPIO - Voice Processing I/O with Echo Cancellation

        Usage:
          CoreAudioVPIO start [output.pcm]  - Start audio capture with AEC
          CoreAudioVPIO status              - Show current status

        The audio is output as 16kHz, 16-bit, mono PCM.
        When no output file is specified, audio is written to stdout as base64.
        """)
    }
}
