#!/bin/bash

# Build script for CoreAudioVPIO native module
# This compiles the Swift code into a standalone executable

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🔨 Building CoreAudioVPIO..."

# Clean previous builds
rm -rf .build

# Build release version
swift build -c release

# Check if build succeeded
if [ -f ".build/release/CoreAudioVPIO" ]; then
    echo "✅ Build successful!"
    echo "   Binary: .build/release/CoreAudioVPIO"

    # Show binary size
    SIZE=$(ls -lh .build/release/CoreAudioVPIO | awk '{print $5}')
    echo "   Size: $SIZE"

    # Test the binary
    echo ""
    echo "📋 Testing binary..."
    .build/release/CoreAudioVPIO status 2>/dev/null || echo "   (No audio session active)"
else
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "🎯 To use in Hawkeye:"
echo "   1. The binary will be automatically built during development"
echo "   2. For production, copy .build/release/CoreAudioVPIO to resources/bin/"
