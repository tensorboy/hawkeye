fn main() {
    // Compile Swift helpers on macOS
    #[cfg(target_os = "macos")]
    {
        compile_swift_ocr();
        compile_swift_speech();
        compile_swift_ane();
    }

    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn compile_swift_ocr() {
    use std::path::Path;
    use std::process::Command;

    let swift_src = "swift-ocr/Sources/main.swift";
    let out_dir = std::env::var("OUT_DIR").unwrap_or_else(|_| "target".to_string());
    let output_path = Path::new(&out_dir).join("hawkeye-ocr");

    // Only rebuild if source changed
    println!("cargo:rerun-if-changed={}", swift_src);

    if !Path::new(swift_src).exists() {
        println!("cargo:warning=Swift OCR source not found at {}, skipping compilation", swift_src);
        return;
    }

    println!("cargo:warning=Compiling Swift OCR helper...");

    let status = Command::new("swiftc")
        .args([
            "-O",
            "-whole-module-optimization",
            swift_src,
            "-o",
            output_path.to_str().unwrap(),
            "-framework", "Vision",
            "-framework", "Foundation",
            "-framework", "CoreGraphics",
            "-framework", "ImageIO",
        ])
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("cargo:warning=Swift OCR helper compiled successfully at {:?}", output_path);
            // Export the path so Rust code can find it
            println!("cargo:rustc-env=HAWKEYE_OCR_PATH={}", output_path.display());
        }
        Ok(s) => {
            println!("cargo:warning=Swift OCR compilation failed with status: {}", s);
        }
        Err(e) => {
            println!("cargo:warning=Failed to run swiftc: {} (is Xcode installed?)", e);
        }
    }
}

#[cfg(target_os = "macos")]
fn compile_swift_speech() {
    use std::path::Path;
    use std::process::Command;

    let swift_src = "swift-speech/Sources/main.swift";
    let info_plist = "swift-speech/Info.plist";
    let out_dir = std::env::var("OUT_DIR").unwrap_or_else(|_| "target".to_string());
    let output_path = Path::new(&out_dir).join("hawkeye-speech");

    println!("cargo:rerun-if-changed={}", swift_src);
    println!("cargo:rerun-if-changed={}", info_plist);

    if !Path::new(swift_src).exists() {
        println!("cargo:warning=Swift Speech source not found at {}, skipping compilation", swift_src);
        return;
    }

    println!("cargo:warning=Compiling Swift Speech helper...");

    let status = Command::new("swiftc")
        .args([
            "-O",
            "-whole-module-optimization",
            swift_src,
            "-o",
            output_path.to_str().unwrap(),
            "-framework", "Speech",
            "-framework", "AVFoundation",
            "-framework", "Foundation",
            // Embed Info.plist so TCC-protected calls (speech auth, mic)
            // prompt instead of SIGABRT-ing this plain CLI binary.
            "-Xlinker", "-sectcreate",
            "-Xlinker", "__TEXT",
            "-Xlinker", "__info_plist",
            "-Xlinker", info_plist,
        ])
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("cargo:warning=Swift Speech helper compiled successfully at {:?}", output_path);
            println!("cargo:rustc-env=HAWKEYE_SPEECH_PATH={}", output_path.display());
        }
        Ok(s) => {
            println!("cargo:warning=Swift Speech compilation failed with status: {}", s);
        }
        Err(e) => {
            println!("cargo:warning=Failed to run swiftc for speech: {} (is Xcode installed?)", e);
        }
    }
}

#[cfg(target_os = "macos")]
fn compile_swift_ane() {
    use std::path::Path;
    use std::process::Command;

    let swift_src = "swift-ane/Sources/main.swift";
    let out_dir = std::env::var("OUT_DIR").unwrap_or_else(|_| "target".to_string());
    let output_path = Path::new(&out_dir).join("hawkeye-ane");

    println!("cargo:rerun-if-changed={}", swift_src);

    if !Path::new(swift_src).exists() {
        println!("cargo:warning=Swift ANE source not found at {}, skipping compilation", swift_src);
        return;
    }

    println!("cargo:warning=Compiling Swift ANE helper...");

    let status = Command::new("swiftc")
        .args([
            "-O",
            "-whole-module-optimization",
            swift_src,
            "-o",
            output_path.to_str().unwrap(),
            "-framework", "Foundation",
            "-framework", "Accelerate",
        ])
        .status();

    match status {
        Ok(s) if s.success() => {
            println!("cargo:warning=Swift ANE helper compiled successfully at {:?}", output_path);
            println!("cargo:rustc-env=HAWKEYE_ANE_PATH={}", output_path.display());
        }
        Ok(s) => {
            println!("cargo:warning=Swift ANE compilation failed with status: {}", s);
        }
        Err(e) => {
            println!("cargo:warning=Failed to run swiftc for ANE: {} (is Xcode installed?)", e);
        }
    }
}
