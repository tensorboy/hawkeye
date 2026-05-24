/**
 * GazeTrainingPanel — ANE gaze model training status and controls
 */

import React, { useEffect, useState, useCallback } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useHawkeyeStore } from '../store';
import {
  getGazeTrainingStatus,
  triggerGazeTraining,
  clearGazeModel,
  loadGazeWeights,
} from '../hooks/useTauri';

export const GazeTrainingPanel: React.FC = () => {
  const {
    gazeModelReady,
    gazeModelMode,
    gazeSampleCount,
    gazeTrainLoss,
    gazeIsTraining,
    setGazeModelReady,
    setGazeModelMode,
    setGazeSampleCount,
    setGazeTrainLoss,
    setGazeIsTraining,
  } = useHawkeyeStore();

  const [aneAvailable, setAneAvailable] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // Fetch initial status
  useEffect(() => {
    getGazeTrainingStatus()
      .then((s) => {
        setGazeSampleCount(s.sampleCount);
        setGazeIsTraining(s.isTraining);
        setGazeTrainLoss(s.trainLoss ?? null);
        setGazeModelReady(s.modelReady);
        setAneAvailable(s.aneAvailable);
      })
      .catch(() => {});

    // Try loading persisted weights
    loadGazeWeights()
      .then((loaded) => {
        if (loaded) {
          setGazeModelReady(true);
          setStatusMsg('Loaded saved model');
        }
      })
      .catch(() => {});
  }, [setGazeSampleCount, setGazeIsTraining, setGazeTrainLoss, setGazeModelReady]);

  // Listen for gaze events
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    listen<number>('gaze:sample-added', (e) => {
      setGazeSampleCount(e.payload);
    }).then((fn) => unlisteners.push(fn));

    listen('gaze:training-started', () => {
      setGazeIsTraining(true);
      setStatusMsg('Training...');
    }).then((fn) => unlisteners.push(fn));

    listen<{ finalLoss: number; epochs: number; durationMs: number }>('gaze:training-complete', (e) => {
      setGazeIsTraining(false);
      setGazeModelReady(true);
      setGazeTrainLoss(e.payload.finalLoss);
      setStatusMsg(`Trained in ${(e.payload.durationMs / 1000).toFixed(1)}s (${e.payload.epochs} epochs)`);
    }).then((fn) => unlisteners.push(fn));

    listen<string>('gaze:training-error', (e) => {
      setGazeIsTraining(false);
      setStatusMsg(`Error: ${e.payload}`);
    }).then((fn) => unlisteners.push(fn));

    listen('gaze:model-ready', () => {
      setGazeModelReady(true);
    }).then((fn) => unlisteners.push(fn));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [setGazeSampleCount, setGazeIsTraining, setGazeModelReady, setGazeTrainLoss]);

  const handleTrainNow = useCallback(async () => {
    try {
      await triggerGazeTraining();
      setStatusMsg('Training started...');
    } catch (e: unknown) {
      setStatusMsg(`Failed: ${e}`);
    }
  }, []);

  const handleResetModel = useCallback(async () => {
    try {
      await clearGazeModel();
      setGazeModelReady(false);
      setGazeTrainLoss(null);
      setGazeSampleCount(0);
      setGazeModelMode('webgazer');
      setStatusMsg('Model cleared');
    } catch (e: unknown) {
      setStatusMsg(`Failed: ${e}`);
    }
  }, [setGazeModelReady, setGazeTrainLoss, setGazeSampleCount, setGazeModelMode]);

  const handleToggleMode = useCallback(() => {
    if (gazeModelMode === 'webgazer' && gazeModelReady) {
      setGazeModelMode('ane');
    } else {
      setGazeModelMode('webgazer');
    }
  }, [gazeModelMode, gazeModelReady, setGazeModelMode]);

  const trainThreshold = 50;
  const progress = Math.min(gazeSampleCount / trainThreshold, 1);

  return (
    <div className="card">
      <div className="card-title flex items-center gap-2">
        ANE Gaze Model
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{
            backgroundColor: gazeModelReady ? '#22c55e' : gazeIsTraining ? '#f59e0b' : '#6b7280',
          }}
        />
        <span className="text-xs text-hawkeye-text-muted font-normal">
          {gazeIsTraining ? 'Training' : gazeModelReady ? 'Ready' : 'Not trained'}
        </span>
      </div>

      <div className="card-content space-y-3">
        {/* Sample counter */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-hawkeye-text-muted">Calibration samples</span>
            <span className="font-mono">{gazeSampleCount}/{trainThreshold}</span>
          </div>
          <div className="w-full h-2 bg-hawkeye-surface rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress * 100}%`,
                backgroundColor: progress >= 1 ? '#22c55e' : '#3b82f6',
              }}
            />
          </div>
        </div>

        {/* Training loss */}
        {gazeTrainLoss !== null && (
          <div className="flex justify-between text-xs">
            <span className="text-hawkeye-text-muted">Train loss</span>
            <span className="font-mono text-green-400">{gazeTrainLoss.toFixed(6)}</span>
          </div>
        )}

        {/* ANE availability */}
        <div className="flex justify-between text-xs">
          <span className="text-hawkeye-text-muted">ANE backend</span>
          <span className={aneAvailable ? 'text-green-400' : 'text-hawkeye-text-muted'}>
            {aneAvailable ? 'Available' : 'Not found'}
          </span>
        </div>

        {/* Mode toggle */}
        <div className="flex justify-between text-xs items-center">
          <span className="text-hawkeye-text-muted">Prediction mode</span>
          <button
            className="px-2 py-1 rounded text-xs font-medium transition-colors"
            style={{
              backgroundColor: gazeModelMode === 'ane' ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)',
              color: gazeModelMode === 'ane' ? '#22c55e' : '#3b82f6',
              border: `1px solid ${gazeModelMode === 'ane' ? 'rgba(34,197,94,0.4)' : 'rgba(59,130,246,0.4)'}`,
            }}
            onClick={handleToggleMode}
            disabled={!gazeModelReady && gazeModelMode === 'webgazer'}
          >
            {gazeModelMode === 'ane' ? 'ANE' : 'WebGazer'}
          </button>
        </div>

        {/* Status message */}
        {statusMsg && (
          <div className="text-xs text-hawkeye-text-muted italic">{statusMsg}</div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-hawkeye-border">
          <button
            className="btn btn-primary flex-1 text-xs"
            onClick={handleTrainNow}
            disabled={gazeIsTraining || gazeSampleCount < 10}
          >
            {gazeIsTraining ? 'Training...' : 'Train Now'}
          </button>
          <button
            className="btn flex-1 text-xs"
            onClick={handleResetModel}
            disabled={gazeIsTraining}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
};

export default GazeTrainingPanel;
