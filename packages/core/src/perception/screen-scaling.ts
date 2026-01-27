/**
 * Screen Coordinate Scaling System
 * Based on Anthropic Computer Use Demo patterns
 *
 * Ensures AI models work with consistent coordinate spaces
 * regardless of actual display resolution.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/** Standard target resolutions for AI models */
export const TARGET_RESOLUTIONS = {
  XGA: { width: 1024, height: 768 },      // Recommended by Anthropic
  WXGA: { width: 1280, height: 800 },
  FWXGA: { width: 1366, height: 768 },
  HD: { width: 1920, height: 1080 },
} as const;

export type ResolutionPreset = keyof typeof TARGET_RESOLUTIONS;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface ScalingConfig {
  /** Target resolution for AI model */
  targetResolution: Size;
  /** Actual screen resolution */
  screenResolution: Size;
  /** Whether scaling is enabled */
  enabled: boolean;
}

export interface ScalingFactors {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Screen Coordinate Scaler
 * Handles coordinate translation between AI model space and actual screen space
 */
export class ScreenScaler {
  private config: ScalingConfig;
  private factors: ScalingFactors;
  private platform: NodeJS.Platform;

  constructor(config?: Partial<ScalingConfig>) {
    this.platform = process.platform;
    this.config = {
      targetResolution: TARGET_RESOLUTIONS.XGA,
      screenResolution: { width: 1920, height: 1080 }, // Default, will be updated
      enabled: true,
      ...config,
    };
    this.factors = this.calculateFactors();
  }

  /**
   * Initialize scaler with actual screen resolution
   */
  async initialize(): Promise<void> {
    const resolution = await this.detectScreenResolution();
    if (resolution) {
      this.config.screenResolution = resolution;
      this.factors = this.calculateFactors();
    }
  }

  /**
   * Detect current screen resolution
   */
  async detectScreenResolution(): Promise<Size | null> {
    try {
      switch (this.platform) {
        case 'darwin': {
          const { stdout } = await execAsync(`system_profiler SPDisplaysDataType | grep Resolution`);
          const match = stdout.match(/(\d+)\s*x\s*(\d+)/);
          if (match) {
            return { width: parseInt(match[1]), height: parseInt(match[2]) };
          }
          break;
        }
        case 'linux': {
          const { stdout } = await execAsync(`xrandr | grep '*' | head -1`);
          const match = stdout.match(/(\d+)x(\d+)/);
          if (match) {
            return { width: parseInt(match[1]), height: parseInt(match[2]) };
          }
          break;
        }
        case 'win32': {
          const { stdout } = await execAsync(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds | Format-List Width,Height"`);
          const widthMatch = stdout.match(/Width\s*:\s*(\d+)/);
          const heightMatch = stdout.match(/Height\s*:\s*(\d+)/);
          if (widthMatch && heightMatch) {
            return { width: parseInt(widthMatch[1]), height: parseInt(heightMatch[1]) };
          }
          break;
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Calculate scaling factors based on current config
   */
  private calculateFactors(): ScalingFactors {
    const { targetResolution, screenResolution, enabled } = this.config;

    if (!enabled) {
      return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
    }

    // Calculate aspect ratios
    const targetAspect = targetResolution.width / targetResolution.height;
    const screenAspect = screenResolution.width / screenResolution.height;

    let scaleX: number;
    let scaleY: number;
    let offsetX = 0;
    let offsetY = 0;

    // Determine scaling strategy based on aspect ratio difference
    if (Math.abs(targetAspect - screenAspect) < 0.1) {
      // Similar aspect ratios - simple scaling
      scaleX = screenResolution.width / targetResolution.width;
      scaleY = screenResolution.height / targetResolution.height;
    } else if (screenAspect > targetAspect) {
      // Screen is wider - letterbox horizontally
      scaleY = screenResolution.height / targetResolution.height;
      scaleX = scaleY; // Maintain aspect ratio
      offsetX = (screenResolution.width - targetResolution.width * scaleX) / 2;
    } else {
      // Screen is taller - letterbox vertically
      scaleX = screenResolution.width / targetResolution.width;
      scaleY = scaleX; // Maintain aspect ratio
      offsetY = (screenResolution.height - targetResolution.height * scaleY) / 2;
    }

    return { scaleX, scaleY, offsetX, offsetY };
  }

  /**
   * Convert API coordinates (target resolution) to screen coordinates
   */
  apiToScreen(point: Point): Point {
    if (!this.config.enabled) return point;

    const { scaleX, scaleY, offsetX, offsetY } = this.factors;
    return {
      x: Math.round(point.x * scaleX + offsetX),
      y: Math.round(point.y * scaleY + offsetY),
    };
  }

  /**
   * Convert screen coordinates to API coordinates (target resolution)
   */
  screenToApi(point: Point): Point {
    if (!this.config.enabled) return point;

    const { scaleX, scaleY, offsetX, offsetY } = this.factors;
    return {
      x: Math.round((point.x - offsetX) / scaleX),
      y: Math.round((point.y - offsetY) / scaleY),
    };
  }

  /**
   * Scale an image buffer to target resolution
   * Note: This requires an image processing library like sharp
   */
  async scaleImageToTarget(imageBuffer: Buffer): Promise<{
    buffer: Buffer;
    originalSize: Size;
    scaledSize: Size;
  }> {
    // For now, return the original buffer
    // In production, use sharp or similar library
    return {
      buffer: imageBuffer,
      originalSize: this.config.screenResolution,
      scaledSize: this.config.targetResolution,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): ScalingConfig {
    return { ...this.config };
  }

  /**
   * Get current scaling factors
   */
  getFactors(): ScalingFactors {
    return { ...this.factors };
  }

  /**
   * Update target resolution
   */
  setTargetResolution(resolution: Size | ResolutionPreset): void {
    if (typeof resolution === 'string') {
      this.config.targetResolution = TARGET_RESOLUTIONS[resolution];
    } else {
      this.config.targetResolution = resolution;
    }
    this.factors = this.calculateFactors();
  }

  /**
   * Enable or disable scaling
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.factors = this.calculateFactors();
  }

  /**
   * Check if coordinates are within the valid screen area
   */
  isValidScreenPoint(point: Point): boolean {
    const { screenResolution } = this.config;
    return (
      point.x >= 0 &&
      point.x <= screenResolution.width &&
      point.y >= 0 &&
      point.y <= screenResolution.height
    );
  }

  /**
   * Check if coordinates are within the valid API area
   */
  isValidApiPoint(point: Point): boolean {
    const { targetResolution } = this.config;
    return (
      point.x >= 0 &&
      point.x <= targetResolution.width &&
      point.y >= 0 &&
      point.y <= targetResolution.height
    );
  }

  /**
   * Clamp coordinates to valid screen area
   */
  clampToScreen(point: Point): Point {
    const { screenResolution } = this.config;
    return {
      x: Math.max(0, Math.min(point.x, screenResolution.width)),
      y: Math.max(0, Math.min(point.y, screenResolution.height)),
    };
  }

  /**
   * Clamp coordinates to valid API area
   */
  clampToApi(point: Point): Point {
    const { targetResolution } = this.config;
    return {
      x: Math.max(0, Math.min(point.x, targetResolution.width)),
      y: Math.max(0, Math.min(point.y, targetResolution.height)),
    };
  }

  /**
   * Get recommended target resolution based on screen resolution
   */
  static getRecommendedTarget(screenResolution: Size): ResolutionPreset {
    const screenAspect = screenResolution.width / screenResolution.height;

    // Find best matching aspect ratio
    let bestMatch: ResolutionPreset = 'XGA';
    let bestDiff = Infinity;

    for (const [preset, resolution] of Object.entries(TARGET_RESOLUTIONS)) {
      const targetAspect = resolution.width / resolution.height;
      const diff = Math.abs(screenAspect - targetAspect);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestMatch = preset as ResolutionPreset;
      }
    }

    return bestMatch;
  }
}

/**
 * Create a pre-configured screen scaler
 */
export function createScreenScaler(preset: ResolutionPreset = 'XGA'): ScreenScaler {
  return new ScreenScaler({
    targetResolution: TARGET_RESOLUTIONS[preset],
  });
}

export default ScreenScaler;
