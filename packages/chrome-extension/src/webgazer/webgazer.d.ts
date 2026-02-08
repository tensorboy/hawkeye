/**
 * Type declarations for webgazer module
 */
declare module 'webgazer' {
  interface WebGazerInstance {
    setGazeListener: (callback: (data: { x: number; y: number } | null, elapsedTime: number) => void) => WebGazerInstance;
    begin: () => Promise<WebGazerInstance>;
    end: () => void;
    pause: () => void;
    resume: () => void;
    isReady: () => boolean;
    showPredictionPoints: (show: boolean) => WebGazerInstance;
    showVideo: (show: boolean) => WebGazerInstance;
    showFaceOverlay: (show: boolean) => WebGazerInstance;
    showFaceFeedbackBox: (show: boolean) => WebGazerInstance;
    applyKalmanFilter: (apply: boolean) => WebGazerInstance;
    setRegression: (type: string) => WebGazerInstance;
    clearData: () => void;
    recordScreenPosition: (x: number, y: number, type?: string) => void;
    saveDataAcrossSessions: (save: boolean) => WebGazerInstance;
    getCurrentPrediction: () => { x: number; y: number } | null;
  }

  const webgazer: WebGazerInstance;
  export default webgazer;
}
