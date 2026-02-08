/**
 * Sherpa-ONNX Model Specifications
 *
 * Defines available models for ASR, VAD, KWS, TTS, Speaker ID, and Language ID.
 * Models are downloaded on-demand and stored in app.getPath('userData')/models/sherpa/
 */

export type SherpaModelType = 'asr-streaming' | 'asr-offline' | 'vad' | 'kws' | 'tts' | 'speaker-id' | 'language-id';

export interface SherpaModelSpec {
  id: string;
  name: string;
  type: SherpaModelType;
  description: string;
  /** Download URL (HuggingFace or GitHub releases) */
  url: string;
  /** Expected size in bytes */
  size: number;
  /** Supported languages */
  languages: string[];
  /** Files inside the archive/download */
  files: SherpaModelFile[];
  /** Whether this is the default model for its type */
  isDefault?: boolean;
}

export interface SherpaModelFile {
  name: string;
  /** Relative path within model directory */
  path: string;
  /** Role: encoder, decoder, joiner, tokens, model, voices, data-dir, etc. */
  role: string;
}

export interface SherpaASRConfig {
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
  numThreads?: number;
  provider?: string;
  sampleRate?: number;
  enableEndpoint?: boolean;
}

export interface SherpaTTSConfig {
  model: string;
  tokens: string;
  voices?: string;
  dataDir?: string;
  numThreads?: number;
  maxNumSentences?: number;
}

export interface SherpaVADConfig {
  model: string;
  threshold?: number;
  minSpeechDuration?: number;
  minSilenceDuration?: number;
  windowSize?: number;
}

export interface SherpaKWSConfig {
  encoder: string;
  decoder: string;
  joiner: string;
  tokens: string;
  keywordsFile: string;
  numThreads?: number;
}

export interface SherpaSpeakerIDConfig {
  model: string;
  numThreads?: number;
}

export interface SherpaDownloadProgress {
  modelId: string;
  status: 'downloading' | 'extracting' | 'completed' | 'error';
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error?: string;
}

// ============================================================================
// Model Catalog
// ============================================================================

const HUGGINGFACE_BASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

/**
 * Streaming ASR Models (OnlineRecognizer)
 * For real-time, low-latency speech recognition
 */
export const ASR_STREAMING_MODELS: SherpaModelSpec[] = [
  {
    id: 'zipformer-bilingual-zh-en-2023-02-20',
    name: 'Zipformer Bilingual (zh-en)',
    type: 'asr-streaming',
    description: 'Bilingual Chinese-English streaming ASR. Best for mixed language scenarios.',
    url: `${HUGGINGFACE_BASE}/asr-models/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20.tar.bz2`,
    size: 85_000_000, // ~85MB
    languages: ['zh', 'en'],
    isDefault: true,
    files: [
      { name: 'encoder-epoch-99-avg-1.int8.onnx', path: 'encoder.onnx', role: 'encoder' },
      { name: 'decoder-epoch-99-avg-1.onnx', path: 'decoder.onnx', role: 'decoder' },
      { name: 'joiner-epoch-99-avg-1.int8.onnx', path: 'joiner.onnx', role: 'joiner' },
      { name: 'tokens.txt', path: 'tokens.txt', role: 'tokens' },
    ],
  },
  {
    id: 'zipformer-en-2023-06-26',
    name: 'Zipformer English',
    type: 'asr-streaming',
    description: 'English-only streaming ASR. Optimized for speed.',
    url: `${HUGGINGFACE_BASE}/asr-models/sherpa-onnx-streaming-zipformer-en-2023-06-26.tar.bz2`,
    size: 70_000_000, // ~70MB
    languages: ['en'],
    files: [
      { name: 'encoder-epoch-99-avg-1.int8.onnx', path: 'encoder.onnx', role: 'encoder' },
      { name: 'decoder-epoch-99-avg-1.onnx', path: 'decoder.onnx', role: 'decoder' },
      { name: 'joiner-epoch-99-avg-1.int8.onnx', path: 'joiner.onnx', role: 'joiner' },
      { name: 'tokens.txt', path: 'tokens.txt', role: 'tokens' },
    ],
  },
];

/**
 * VAD Models (Voice Activity Detection)
 */
export const VAD_MODELS: SherpaModelSpec[] = [
  {
    id: 'silero-vad-v5',
    name: 'Silero VAD v5',
    type: 'vad',
    description: 'Lightweight voice activity detection. Only 2MB.',
    url: `${HUGGINGFACE_BASE}/asr-models/silero_vad.onnx`,
    size: 2_000_000, // ~2MB
    languages: ['*'], // Language-agnostic
    isDefault: true,
    files: [
      { name: 'silero_vad.onnx', path: 'silero_vad.onnx', role: 'model' },
    ],
  },
];

/**
 * TTS Models (Text-to-Speech)
 */
export const TTS_MODELS: SherpaModelSpec[] = [
  {
    id: 'kokoro-en-v1',
    name: 'Kokoro English TTS',
    type: 'tts',
    description: 'High-quality English TTS with multiple voices and emotion control.',
    url: `${HUGGINGFACE_BASE}/tts-models/kokoro-en-v0_19.tar.bz2`,
    size: 85_000_000, // ~85MB
    languages: ['en'],
    isDefault: true,
    files: [
      { name: 'model.onnx', path: 'model.onnx', role: 'model' },
      { name: 'voices.bin', path: 'voices.bin', role: 'voices' },
      { name: 'tokens.txt', path: 'tokens.txt', role: 'tokens' },
      { name: 'espeak-ng-data', path: 'espeak-ng-data', role: 'data-dir' },
    ],
  },
  {
    id: 'piper-zh-v1',
    name: 'Piper Chinese TTS',
    type: 'tts',
    description: 'Chinese TTS via Piper/VITS models.',
    url: `${HUGGINGFACE_BASE}/tts-models/vits-piper-zh_CN-huayan-medium.tar.bz2`,
    size: 65_000_000, // ~65MB
    languages: ['zh'],
    files: [
      { name: 'zh_CN-huayan-medium.onnx', path: 'model.onnx', role: 'model' },
      { name: 'tokens.txt', path: 'tokens.txt', role: 'tokens' },
      { name: 'espeak-ng-data', path: 'espeak-ng-data', role: 'data-dir' },
    ],
  },
];

/**
 * Keyword Spotting Models
 */
export const KWS_MODELS: SherpaModelSpec[] = [
  {
    id: 'kws-zipformer-en',
    name: 'Zipformer KWS (English)',
    type: 'kws',
    description: 'Custom keyword spotting for wake words like "Hey Hawkeye".',
    url: `${HUGGINGFACE_BASE}/kws-models/sherpa-onnx-kws-zipformer-wenetspeech-3.3M-2024-01-01.tar.bz2`,
    size: 15_000_000, // ~15MB
    languages: ['en', 'zh'],
    isDefault: true,
    files: [
      { name: 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx', path: 'encoder.onnx', role: 'encoder' },
      { name: 'decoder-epoch-12-avg-2-chunk-16-left-64.onnx', path: 'decoder.onnx', role: 'decoder' },
      { name: 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx', path: 'joiner.onnx', role: 'joiner' },
      { name: 'tokens.txt', path: 'tokens.txt', role: 'tokens' },
    ],
  },
];

/**
 * Speaker ID Models
 */
export const SPEAKER_ID_MODELS: SherpaModelSpec[] = [
  {
    id: '3dspeaker-speech-eres2net',
    name: '3D-Speaker ERes2Net',
    type: 'speaker-id',
    description: 'Speaker embedding extraction for identification and verification.',
    url: `${HUGGINGFACE_BASE}/speaker-recog-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`,
    size: 25_000_000, // ~25MB
    languages: ['*'],
    isDefault: true,
    files: [
      { name: '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx', path: 'model.onnx', role: 'model' },
    ],
  },
];

/**
 * Language ID Models
 */
export const LANGUAGE_ID_MODELS: SherpaModelSpec[] = [
  {
    id: 'whisper-tiny-lang-id',
    name: 'Whisper Tiny Language ID',
    type: 'language-id',
    description: 'Detect spoken language from audio. Based on Whisper.',
    url: `${HUGGINGFACE_BASE}/asr-models/sherpa-onnx-whisper-tiny.tar.bz2`,
    size: 40_000_000, // ~40MB
    languages: ['*'],
    isDefault: true,
    files: [
      { name: 'tiny-encoder.int8.onnx', path: 'encoder.onnx', role: 'encoder' },
      { name: 'tiny-decoder.int8.onnx', path: 'decoder.onnx', role: 'decoder' },
      { name: 'tiny-tokens.txt', path: 'tokens.txt', role: 'tokens' },
    ],
  },
];

// ============================================================================
// Helpers
// ============================================================================

/** All available models combined */
export const ALL_MODELS: SherpaModelSpec[] = [
  ...ASR_STREAMING_MODELS,
  ...VAD_MODELS,
  ...TTS_MODELS,
  ...KWS_MODELS,
  ...SPEAKER_ID_MODELS,
  ...LANGUAGE_ID_MODELS,
];

/** Get default model for a given type */
export function getDefaultModel(type: SherpaModelType): SherpaModelSpec | undefined {
  return ALL_MODELS.find(m => m.type === type && m.isDefault);
}

/** Get model by ID */
export function getModelById(id: string): SherpaModelSpec | undefined {
  return ALL_MODELS.find(m => m.id === id);
}

/** Get all models of a given type */
export function getModelsByType(type: SherpaModelType): SherpaModelSpec[] {
  return ALL_MODELS.filter(m => m.type === type);
}

/** Default VAD config */
export const DEFAULT_VAD_CONFIG: SherpaVADConfig = {
  model: '', // set at runtime
  threshold: 0.5,
  minSpeechDuration: 0.25,
  minSilenceDuration: 0.5,
  windowSize: 512,
};

/** Default ASR config */
export const DEFAULT_ASR_CONFIG: Partial<SherpaASRConfig> = {
  numThreads: 2,
  provider: 'cpu',
  sampleRate: 16000,
  enableEndpoint: true,
};

/** Default TTS config */
export const DEFAULT_TTS_CONFIG: Partial<SherpaTTSConfig> = {
  numThreads: 1,
  maxNumSentences: 1,
};
