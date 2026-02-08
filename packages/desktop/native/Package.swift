// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "CoreAudioVPIO",
    platforms: [
        .macOS(.v12)
    ],
    products: [
        .executable(name: "CoreAudioVPIO", targets: ["CoreAudioVPIO"])
    ],
    targets: [
        .executableTarget(
            name: "CoreAudioVPIO",
            path: ".",
            sources: ["CoreAudioVPIO.swift"],
            linkerSettings: [
                .linkedFramework("AudioToolbox"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("CoreAudio")
            ]
        )
    ]
)
