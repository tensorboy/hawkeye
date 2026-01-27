import { useState, useRef, useCallback } from 'react';

interface AudioCaptureOptions {
  sampleRate?: number;
  bufferSize?: number;
  onAudioChunk?: (buffer: Float32Array) => void;
}

export function useAudioCapture(options: AudioCaptureOptions = {}) {
  const { sampleRate = 16000, bufferSize = 16000, onAudioChunk } = options;

  const [isCapturing, setIsCapturing] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const bufferRef = useRef<Float32Array[]>([]);

  const startCapture = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      mediaStreamRef.current = stream;
      setHasPermission(true);

      const audioContext = new AudioContext({ sampleRate });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        bufferRef.current.push(new Float32Array(inputData));

        const totalSamples = bufferRef.current.reduce((sum, b) => sum + b.length, 0);
        if (totalSamples >= bufferSize) {
          const combined = new Float32Array(totalSamples);
          let offset = 0;
          for (const buf of bufferRef.current) {
            combined.set(buf, offset);
            offset += buf.length;
          }
          bufferRef.current = [];
          onAudioChunk?.(combined);
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsCapturing(true);
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      setHasPermission(false);
    }
  }, [sampleRate, bufferSize, onAudioChunk]);

  const stopCapture = useCallback(() => {
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
    setIsCapturing(false);
  }, []);

  return {
    isCapturing,
    hasPermission,
    startCapture,
    stopCapture,
  };
}
