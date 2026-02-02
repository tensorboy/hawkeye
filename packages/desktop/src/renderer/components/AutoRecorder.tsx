/**
 * AutoRecorder - Automatically records and transcribes speech
 * Uses Voice Activity Detection (VAD) to only transcribe when speech is detected
 */

import { useEffect, useRef, useCallback, useState } from 'react';

interface AutoRecorderProps {
  enabled?: boolean;
  sampleRate?: number;
  /** VAD threshold (0-1). Higher = less sensitive */
  vadThreshold?: number;
  /** Minimum speech duration in ms before transcribing */
  minSpeechDuration?: number;
  /** Silence duration in ms to end speech segment */
  silenceTimeout?: number;
  /** Callback when transcription is received */
  onTranscription?: (text: string) => void;
}

// Calculate RMS (Root Mean Square) for audio energy
function calculateRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

export function AutoRecorder({
  enabled = true,
  sampleRate = 16000,
  vadThreshold = 0.01, // RMS threshold for voice detection
  minSpeechDuration = 500, // Minimum 500ms of speech
  silenceTimeout = 1000, // 1 second of silence to end segment
  onTranscription,
}: AutoRecorderProps) {
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);
  const isRecordingRef = useRef(false);
  const isProcessingRef = useRef(false);

  // VAD state
  const isSpeakingRef = useRef(false);
  const speechStartTimeRef = useRef<number | null>(null);
  const lastVoiceTimeRef = useRef<number>(0);

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const sendToWhisper = useCallback(async (float32Array: Float32Array) => {
    if (isProcessingRef.current) {
      console.debug('[AutoRecorder] Skipping - still processing previous chunk');
      return;
    }

    isProcessingRef.current = true;

    try {
      // Convert Float32 to Int16 PCM (Whisper format)
      const int16Array = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        const s = Math.max(-1, Math.min(1, float32Array[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Use Uint8Array instead of Buffer (renderer doesn't have Node.js Buffer)
      const buffer = new Uint8Array(int16Array.buffer);
      const result = await (window as any).hawkeye.whisperTranscribe(buffer);

      if (result && result.trim()) {
        console.log('[AutoRecorder] 🎤 Transcribed:', result);
        onTranscription?.(result);
      }
    } catch (error) {
      console.debug('[AutoRecorder] Transcription error:', error);
    } finally {
      isProcessingRef.current = false;
    }
  }, [onTranscription]);

  const startRecording = useCallback(async () => {
    if (isRecordingRef.current) return;

    try {
      // Check microphone permission first
      const micStatus = await (window as any).hawkeye.whisperCheckMic();
      if (micStatus !== 'granted') {
        const granted = await (window as any).hawkeye.whisperRequestMic();
        if (!granted) {
          console.log('[AutoRecorder] Microphone permission denied');
          return;
        }
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isProcessingRef.current) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const rms = calculateRMS(inputData);
        const now = Date.now();

        // Voice Activity Detection
        const hasVoice = rms > vadThreshold;

        if (hasVoice) {
          lastVoiceTimeRef.current = now;

          if (!isSpeakingRef.current) {
            // Start of speech
            isSpeakingRef.current = true;
            speechStartTimeRef.current = now;
            bufferRef.current = [];
            setIsSpeaking(true);
            console.log('[AutoRecorder] 🔊 Speech started (RMS:', rms.toFixed(4), ')');
          }

          // Accumulate audio
          bufferRef.current.push(new Float32Array(inputData));
        } else if (isSpeakingRef.current) {
          // Still in speech segment, accumulate during brief silence
          bufferRef.current.push(new Float32Array(inputData));

          // Check if silence timeout exceeded
          const silenceDuration = now - lastVoiceTimeRef.current;

          if (silenceDuration > silenceTimeout) {
            // End of speech segment
            const speechDuration = now - (speechStartTimeRef.current || now);

            if (speechDuration >= minSpeechDuration && bufferRef.current.length > 0) {
              // Combine and send to Whisper
              const totalSamples = bufferRef.current.reduce((sum, b) => sum + b.length, 0);
              const combined = new Float32Array(totalSamples);
              let offset = 0;
              for (const buf of bufferRef.current) {
                combined.set(buf, offset);
                offset += buf.length;
              }

              console.log('[AutoRecorder] 🔇 Speech ended, duration:', speechDuration, 'ms, samples:', totalSamples);
              sendToWhisper(combined);
            } else {
              console.debug('[AutoRecorder] Speech too short, ignoring');
            }

            // Reset state
            isSpeakingRef.current = false;
            speechStartTimeRef.current = null;
            bufferRef.current = [];
            setIsSpeaking(false);
          }
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      isRecordingRef.current = true;
      setIsListening(true);
      console.log('[AutoRecorder] ✅ Started listening with VAD (threshold:', vadThreshold, ')');
    } catch (error) {
      console.error('[AutoRecorder] Failed to start recording:', error);
    }
  }, [sampleRate, vadThreshold, minSpeechDuration, silenceTimeout, sendToWhisper]);

  const stopRecording = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    bufferRef.current = [];
    isRecordingRef.current = false;
    isProcessingRef.current = false;
    isSpeakingRef.current = false;
    speechStartTimeRef.current = null;
    setIsListening(false);
    setIsSpeaking(false);
    console.log('[AutoRecorder] Stopped recording');
  }, []);

  useEffect(() => {
    if (enabled) {
      // Delay start slightly to ensure app is fully loaded
      const timer = setTimeout(() => {
        startRecording();
      }, 2000);

      return () => {
        clearTimeout(timer);
        stopRecording();
      };
    } else {
      stopRecording();
    }
  }, [enabled, startRecording, stopRecording]);

  // This component doesn't render anything visible
  // Status can be used by parent via the state
  return null;
}

export default AutoRecorder;
