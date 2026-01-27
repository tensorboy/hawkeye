import React, { useCallback } from 'react';
import { useAudioCapture } from '../hooks/useAudioCapture';

export function MicButton() {
  const onAudioChunk = useCallback(async (float32Array: Float32Array) => {
    // Convert Float32 to Int16 PCM (Whisper format)
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const buffer = Buffer.from(int16Array.buffer);
    try {
      await (window as any).hawkeye.whisperTranscribe(buffer);
    } catch (error) {
      console.error('Transcription error:', error);
    }
  }, []);

  const { isCapturing, startCapture, stopCapture } = useAudioCapture({
    sampleRate: 16000,
    bufferSize: 16000, // 1 second of audio
    onAudioChunk,
  });

  return (
    <button
      onClick={isCapturing ? stopCapture : startCapture}
      className={`btn btn-circle btn-sm ${
        isCapturing ? 'btn-error animate-pulse' : 'btn-ghost'
      }`}
      title={isCapturing ? 'Stop recording' : 'Start recording'}
    >
      {isCapturing ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
      )}
    </button>
  );
}
