/**
 * Whisper integration test script
 * Run with: node --experimental-specifier-resolution=node test-whisper.mjs
 *
 * Tests:
 * 1. Load smart-whisper with the ggml-base.bin model
 * 2. Generate silent PCM audio and transcribe (should return empty/silence)
 * 3. Generate a tone PCM audio and transcribe (should return something or silence)
 * 4. If a .wav file is provided as argument, transcribe it
 */

import { Whisper } from 'smart-whisper';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const MODEL_PATH = path.join(
  os.homedir(),
  'Library/Application Support/Hawkeye/models/ggml-base.bin'
);

// smart-whisper expects Float32Array (mono 16kHz, range -1..1)
function generateSilentPCM(durationSec = 2, sampleRate = 16000) {
  const numSamples = durationSec * sampleRate;
  return new Float32Array(numSamples); // all zeros = silence
}

function generateTonePCM(durationSec = 3, sampleRate = 16000, freq = 440) {
  const numSamples = durationSec * sampleRate;
  const buf = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    buf[i] = Math.sin(2 * Math.PI * freq * t) * 0.5;
  }
  return buf;
}

function readWavAsFloat32(filePath) {
  const data = fs.readFileSync(filePath);
  // Find 'data' chunk in WAV file
  let dataOffset = 12;
  while (dataOffset < data.length - 8) {
    const chunkId = data.toString('ascii', dataOffset, dataOffset + 4);
    const chunkSize = data.readUInt32LE(dataOffset + 4);
    if (chunkId === 'data') {
      console.log(`  WAV data chunk at byte ${dataOffset + 8}, size ${chunkSize}`);
      const numSamples = chunkSize / 2;
      const float32 = new Float32Array(numSamples);
      const start = dataOffset + 8;
      for (let i = 0; i < numSamples; i++) {
        const int16 = data.readInt16LE(start + i * 2);
        float32[i] = int16 / 32768.0;
      }
      return float32;
    }
    dataOffset += 8 + chunkSize;
  }
  throw new Error('No data chunk found in WAV file');
}

async function main() {
  console.log('=== Whisper Integration Test ===\n');

  // Check model
  if (!fs.existsSync(MODEL_PATH)) {
    console.error(`Model not found at: ${MODEL_PATH}`);
    process.exit(1);
  }
  console.log(`Model: ${MODEL_PATH}`);
  const stat = fs.statSync(MODEL_PATH);
  console.log(`Model size: ${(stat.size / 1024 / 1024).toFixed(1)} MB\n`);

  // Init whisper
  console.log('Initializing Whisper...');
  const startInit = Date.now();
  const whisper = new Whisper(MODEL_PATH, { gpu: true });
  console.log(`Whisper initialized in ${Date.now() - startInit}ms\n`);

  // Test 1: Silent audio
  console.log('--- Test 1: Silent audio (2s) ---');
  const silentPCM = generateSilentPCM(2);
  console.log(`Float32Array: ${silentPCM.length} samples (${(silentPCM.length / 16000).toFixed(1)}s)`);

  try {
    const startT1 = Date.now();
    const task1 = await whisper.transcribe(silentPCM, { language: 'auto' });

    task1.on('transcribed', (result) => {
      console.log(`  [segment] ${JSON.stringify(result)}`);
    });

    const result1 = await task1.result;
    console.log(`  Result: ${JSON.stringify(result1)}`);
    console.log(`  Time: ${Date.now() - startT1}ms\n`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}\n`);
  }

  // Test 2: Tone audio (440Hz, 3s)
  console.log('--- Test 2: 440Hz tone (3s) ---');
  const tonePCM = generateTonePCM(3);
  console.log(`Float32Array: ${tonePCM.length} samples (${(tonePCM.length / 16000).toFixed(1)}s)`);

  try {
    const startT2 = Date.now();
    const task2 = await whisper.transcribe(tonePCM, { language: 'auto' });

    task2.on('transcribed', (result) => {
      console.log(`  [segment] ${JSON.stringify(result)}`);
    });

    const result2 = await task2.result;
    console.log(`  Result: ${JSON.stringify(result2)}`);
    console.log(`  Time: ${Date.now() - startT2}ms\n`);
  } catch (err) {
    console.error(`  ERROR: ${err.message}\n`);
  }

  // Test 3: WAV file if provided
  const wavArg = process.argv[2];
  if (wavArg && fs.existsSync(wavArg)) {
    console.log(`--- Test 3: WAV file: ${wavArg} ---`);
    try {
      const wavFloat32 = readWavAsFloat32(wavArg);
      console.log(`Float32Array: ${wavFloat32.length} samples (${(wavFloat32.length / 16000).toFixed(1)}s)`);

      const startT3 = Date.now();
      const task3 = await whisper.transcribe(wavFloat32, { language: 'en' });

      task3.on('transcribed', (result) => {
        console.log(`  [segment] ${JSON.stringify(result)}`);
      });

      const result3 = await task3.result;
      console.log(`  Result: ${JSON.stringify(result3)}`);
      console.log(`  Time: ${Date.now() - startT3}ms\n`);
    } catch (err) {
      console.error(`  ERROR: ${err.message}\n`);
    }
  } else if (wavArg) {
    console.log(`WAV file not found: ${wavArg}\n`);
  }

  // Test 4: Chinese WAV if exists
  const chineseWav = '/tmp/test_chinese.wav';
  if (fs.existsSync(chineseWav)) {
    console.log(`--- Test 4: Chinese WAV ---`);
    try {
      const zhFloat32 = readWavAsFloat32(chineseWav);
      console.log(`Float32Array: ${zhFloat32.length} samples (${(zhFloat32.length / 16000).toFixed(1)}s)`);

      const startT4 = Date.now();
      const task4 = await whisper.transcribe(zhFloat32, { language: 'zh' });

      task4.on('transcribed', (result) => {
        console.log(`  [segment] ${JSON.stringify(result)}`);
      });

      const result4 = await task4.result;
      console.log(`  Result: ${JSON.stringify(result4)}`);
      console.log(`  Time: ${Date.now() - startT4}ms\n`);
    } catch (err) {
      console.error(`  ERROR: ${err.message}\n`);
    }
  }

  // Cleanup
  console.log('Cleaning up...');
  await whisper.free();
  console.log('Done!');
}

main().catch(console.error);
