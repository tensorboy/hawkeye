/**
 * 屏幕截图模块
 */

import screenshot from 'screenshot-desktop';
import type { ScreenCapture as ScreenCaptureResult } from '../types';

export class ScreenCapture {
  /**
   * 捕获屏幕截图
   * @param displayIndex 显示器索引，默认为主显示器
   * @returns Base64 编码的截图数据
   */
  async capture(displayIndex?: number): Promise<ScreenCaptureResult> {
    try {
      const imgBuffer = await screenshot({ format: 'png', screen: displayIndex });

      return {
        imageData: imgBuffer.toString('base64'),
        format: 'png',
        timestamp: Date.now(),
        displayIndex,
      };
    } catch (error) {
      throw new Error(`截图失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取所有显示器列表
   */
  async listDisplays(): Promise<string[]> {
    try {
      const displays = await screenshot.listDisplays();
      return displays.map((d: { id: string; name?: string }) => d.name || d.id);
    } catch (error) {
      throw new Error(`获取显示器列表失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
