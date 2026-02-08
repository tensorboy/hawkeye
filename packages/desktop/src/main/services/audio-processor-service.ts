import { BrowserWindow, app } from 'electron';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface AudioProcessorStatus {
  isRunning: boolean;
  aecEnabled: boolean;
  sampleRate: number;
  bufferSize: number;
  processedFrames: number;
}

export interface ProcessedAudioChunk {
  data: Buffer;
  timestamp: number;
  energy: number;
}

/**
 * AudioProcessorService - Handles real-time audio processing with AEC
 *
 * Uses Core Audio VPIO (Voice Processing I/O) on macOS for:
 * - Acoustic Echo Cancellation (AEC)
 * - Automatic Gain Control (AGC)
 * - Noise Suppression (NS)
 *
 * The processed audio is then passed to WhisperService for transcription.
 */
export class AudioProcessorService extends EventEmitter {
  private vpioProcess: ChildProcess | null = null;
  private isRunning = false;
  private processedFrames = 0;
  private audioBuffer: Buffer[] = [];
  private bufferFlushInterval: NodeJS.Timeout | null = null;

  // Audio settings
  private readonly sampleRate = 16000;
  private readonly bufferDurationMs = 100; // Flush every 100ms
  private readonly silenceThreshold = 0.01;
  private readonly maxBufferChunks = 100; // Cap audio buffer to prevent unbounded growth
  private readonly vpioTimeoutMs = 30000; // VPIO startup timeout

  constructor(
    private mainWindowGetter: () => BrowserWindow | null,
    private debugLog: (msg: string) => void
  ) {
    super();
  }

  /**
   * Get path to the VPIO executable
   */
  private getVPIOPath(): string {
    // In development: use the native folder
    // In production: use the bundled binary
    const isDev = !app.isPackaged;

    if (isDev) {
      return path.join(app.getAppPath(), 'packages/desktop/native/.build/release/CoreAudioVPIO');
    }

    // Production: binary is in resources
    return path.join(process.resourcesPath, 'bin', 'CoreAudioVPIO');
  }

  /**
   * Check if VPIO binary exists, if not, try to build it
   */
  private async ensureVPIOBinary(): Promise<boolean> {
    const vpioPath = this.getVPIOPath();

    if (fs.existsSync(vpioPath)) {
      return true;
    }

    // Try to build in development
    if (!app.isPackaged) {
      const nativeDir = path.join(app.getAppPath(), 'packages/desktop/native');

      this.debugLog('[AudioProcessor] Building VPIO binary...');

      return new Promise((resolve) => {
        const build = spawn('swift', ['build', '-c', 'release'], {
          cwd: nativeDir,
          stdio: 'pipe',
        });

        build.on('close', (code) => {
          if (code === 0) {
            this.debugLog('[AudioProcessor] VPIO binary built successfully');
            resolve(true);
          } else {
            this.debugLog('[AudioProcessor] Failed to build VPIO binary');
            resolve(false);
          }
        });

        build.on('error', (err) => {
          this.debugLog(`[AudioProcessor] Build error: ${err.message}`);
          resolve(false);
        });
      });
    }

    return false;
  }

  /**
   * Start audio processing with AEC
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.debugLog('[AudioProcessor] Already running');
      return;
    }

    // Ensure binary exists
    const hasVPIO = await this.ensureVPIOBinary();
    if (!hasVPIO) {
      // Fallback: use basic audio capture without AEC
      this.debugLog('[AudioProcessor] VPIO not available, using fallback mode');
      await this.startFallbackMode();
      return;
    }

    const vpioPath = this.getVPIOPath();
    this.debugLog(`[AudioProcessor] Starting VPIO: ${vpioPath}`);

    try {
      this.vpioProcess = spawn(vpioPath, ['start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Startup timeout: kill if no output within vpioTimeoutMs
      const startupTimeout = setTimeout(() => {
        if (this.vpioProcess && this.processedFrames === 0) {
          this.debugLog('[AudioProcessor] VPIO startup timeout, killing process');
          this.vpioProcess.kill('SIGKILL');
        }
      }, this.vpioTimeoutMs);
      this.vpioProcess.stdout?.once('data', () => { clearTimeout(startupTimeout); });
      this.vpioProcess.on('close', () => { clearTimeout(startupTimeout); });

      this.vpioProcess.stdout?.on('data', (data: Buffer) => {
        this.handleVPIOOutput(data.toString());
      });

      this.vpioProcess.stderr?.on('data', (data: Buffer) => {
        this.debugLog(`[AudioProcessor] VPIO stderr: ${data.toString()}`);
      });

      this.vpioProcess.on('close', (code) => {
        this.debugLog(`[AudioProcessor] VPIO process exited with code ${code}`);
        this.isRunning = false;
        this.vpioProcess = null;
      });

      this.vpioProcess.on('error', (err) => {
        this.debugLog(`[AudioProcessor] VPIO error: ${err.message}`);
        this.isRunning = false;
      });

      this.isRunning = true;
      this.startBufferFlush();

      this.debugLog('[AudioProcessor] Started with AEC enabled');
      this.safeSend('audio-processor-status', this.getStatus());
    } catch (error) {
      this.debugLog(`[AudioProcessor] Start error: ${error}`);
      throw error;
    }
  }

  /**
   * Fallback mode without native VPIO (basic audio passthrough)
   */
  private async startFallbackMode(): Promise<void> {
    this.isRunning = true;
    this.startBufferFlush();
    this.debugLog('[AudioProcessor] Running in fallback mode (no AEC)');
    this.safeSend('audio-processor-status', {
      ...this.getStatus(),
      aecEnabled: false,
    });
  }

  /**
   * Handle output from VPIO process
   */
  private handleVPIOOutput(output: string): void {
    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (line.startsWith('AUDIO:')) {
        // Base64 encoded audio data
        const base64 = line.substring(6);
        try {
          const audioData = Buffer.from(base64, 'base64');
          this.processAudioChunk(audioData);
        } catch (error) {
          this.debugLog(`[AudioProcessor] Failed to decode audio: ${error}`);
        }
      } else if (line.startsWith('STATUS:')) {
        const status = line.substring(7);
        this.debugLog(`[AudioProcessor] VPIO status: ${status}`);
      } else if (line.startsWith('ERROR:')) {
        const error = line.substring(6);
        this.debugLog(`[AudioProcessor] VPIO error: ${error}`);
      }
    }
  }

  /**
   * Process an audio chunk from VPIO
   */
  private processAudioChunk(data: Buffer): void {
    this.processedFrames++;

    // Cap buffer to prevent unbounded memory growth
    if (this.audioBuffer.length >= this.maxBufferChunks) {
      this.audioBuffer.shift();
    }
    this.audioBuffer.push(data);

    // Calculate energy for this chunk
    const energy = this.calculateEnergy(data);

    // Emit for real-time monitoring
    this.emit('audio-chunk', {
      data,
      timestamp: Date.now(),
      energy,
    } as ProcessedAudioChunk);
  }

  /**
   * Calculate RMS energy of audio buffer
   */
  private calculateEnergy(buffer: Buffer): number {
    if (buffer.length < 2) return 0;

    let sum = 0;
    const samples = buffer.length / 2;

    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i) / 32768.0;
      sum += sample * sample;
    }

    return Math.sqrt(sum / samples);
  }

  /**
   * Start periodic buffer flushing
   */
  private startBufferFlush(): void {
    this.bufferFlushInterval = setInterval(() => {
      this.flushBuffer();
    }, this.bufferDurationMs);
  }

  /**
   * Flush accumulated audio buffer
   */
  private flushBuffer(): void {
    if (this.audioBuffer.length === 0) return;

    // Combine all chunks
    const combined = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];

    // Calculate overall energy
    const energy = this.calculateEnergy(combined);

    // Skip if too quiet
    if (energy < this.silenceThreshold) {
      return;
    }

    // Emit the processed audio buffer
    this.emit('audio-buffer', combined);
    this.safeSend('audio-processed', {
      size: combined.length,
      energy,
      timestamp: Date.now(),
    });
  }

  /**
   * Process audio from renderer (for fallback mode or manual input)
   */
  processManualAudio(buffer: Buffer): void {
    if (!this.isRunning) return;
    this.processAudioChunk(buffer);
  }

  /**
   * Stop audio processing
   */
  stop(): void {
    if (this.bufferFlushInterval) {
      clearInterval(this.bufferFlushInterval);
      this.bufferFlushInterval = null;
    }

    if (this.vpioProcess) {
      this.vpioProcess.kill('SIGTERM');
      this.vpioProcess = null;
    }

    this.isRunning = false;
    this.audioBuffer = [];
    this.debugLog('[AudioProcessor] Stopped');
    this.safeSend('audio-processor-status', this.getStatus());
  }

  /**
   * Get current status
   */
  getStatus(): AudioProcessorStatus {
    return {
      isRunning: this.isRunning,
      aecEnabled: this.vpioProcess !== null,
      sampleRate: this.sampleRate,
      bufferSize: Math.round(this.sampleRate * (this.bufferDurationMs / 1000)),
      processedFrames: this.processedFrames,
    };
  }

  private safeSend(channel: string, data: unknown): void {
    const win = this.mainWindowGetter();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, data);
    }
  }
}

/**
 * Alternative: Python-based AEC using speexdsp
 * Use this if Swift VPIO is not available
 */
export class SpeexDSPProcessor extends EventEmitter {
  private pythonProcess: ChildProcess | null = null;
  private isRunning = false;

  constructor(
    private mainWindowGetter: () => BrowserWindow | null,
    private debugLog: (msg: string) => void
  ) {
    super();
  }

  /**
   * Start Python-based AEC processor
   */
  async start(): Promise<void> {
    const pythonScript = `
import sys
import json
from speexdsp import EchoCanceller

# Create echo canceller
# frame_size: 160 samples (10ms at 16kHz)
# filter_length: 1024 samples (~64ms tail length)
ec = EchoCanceller.create(frame_size=160, filter_length=1024)

print(json.dumps({"status": "ready"}), flush=True)

# Read frames from stdin, process, write to stdout
while True:
    try:
        line = sys.stdin.readline()
        if not line:
            break

        data = json.loads(line)
        mic_frame = bytes.fromhex(data.get("mic", ""))
        speaker_frame = bytes.fromhex(data.get("speaker", ""))

        if len(mic_frame) == 320 and len(speaker_frame) == 320:
            clean_frame = ec.process(mic_frame, speaker_frame)
            print(json.dumps({
                "audio": clean_frame.hex(),
                "timestamp": data.get("timestamp", 0)
            }), flush=True)
    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)
`;

    this.debugLog('[SpeexDSP] Starting Python AEC processor');

    this.pythonProcess = spawn('python3', ['-c', pythonScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.pythonProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          if (msg.audio) {
            const audioBuffer = Buffer.from(msg.audio, 'hex');
            this.emit('audio-buffer', audioBuffer);
          } else if (msg.error) {
            this.debugLog(`[SpeexDSP] Error: ${msg.error}`);
          } else if (msg.status === 'ready') {
            this.isRunning = true;
            this.debugLog('[SpeexDSP] Ready');
          }
        } catch {
          // Ignore parse errors
        }
      }
    });

    this.pythonProcess.on('close', () => {
      this.isRunning = false;
      this.pythonProcess = null;
    });
  }

  /**
   * Process audio frame with echo cancellation
   */
  process(micFrame: Buffer, speakerFrame: Buffer, timestamp: number): void {
    if (!this.pythonProcess || !this.isRunning) return;

    const msg = JSON.stringify({
      mic: micFrame.toString('hex'),
      speaker: speakerFrame.toString('hex'),
      timestamp,
    });

    this.pythonProcess.stdin?.write(msg + '\n');
  }

  /**
   * Stop the processor
   */
  stop(): void {
    if (this.pythonProcess) {
      this.pythonProcess.kill('SIGTERM');
      this.pythonProcess = null;
    }
    this.isRunning = false;
  }
}
