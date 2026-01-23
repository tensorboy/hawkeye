/**
 * OCR 模块
 * 支持多种 OCR 后端:
 * 1. PaddleOCR (本地轻量级 ONNX 模型)
 * 2. 大模型视觉 API (Gemini/Claude/GPT-4V)
 * 3. 系统原生 OCR (macOS Vision, Windows OCR)
 */

import { EventEmitter } from 'events';

// ============ 类型定义 ============

export interface OCRConfig {
  /** OCR 后端类型 */
  backend: OCRBackend;
  /** 识别语言 */
  languages: string[];
  /** 置信度阈值 (0-1) */
  confidenceThreshold: number;
  /** 是否启用 GPU 加速 */
  useGPU: boolean;
}

export type OCRBackend =
  | 'paddle'      // PaddleOCR (推荐，轻量级本地)
  | 'vision-api'  // 大模型视觉 API
  | 'system'      // 系统原生 OCR
  | 'auto';       // 自动选择最佳后端

export interface OCRResult {
  /** 识别的全部文本 */
  text: string;
  /** 置信度 (0-100) */
  confidence: number;
  /** 文本区域 */
  regions: OCRRegion[];
  /** 处理耗时 (ms) */
  duration: number;
  /** 使用的后端 */
  backend: OCRBackend;
}

export interface OCRRegion {
  /** 文本内容 */
  text: string;
  /** 置信度 */
  confidence: number;
  /** 边界框 [x, y, width, height] */
  bbox: [number, number, number, number];
  /** 多边形顶点（如果可用）*/
  polygon?: [number, number][];
}

// ============ OCR 后端接口 ============

export interface IOCRBackend {
  readonly name: string;
  readonly isAvailable: boolean;

  initialize(): Promise<void>;
  recognize(imageData: string | Buffer): Promise<OCRResult>;
  terminate(): Promise<void>;
}

// ============ PaddleOCR 后端 ============

/**
 * PaddleOCR 后端
 *
 * 支持多种安装方式:
 * 1. @paddlejs-models/ocr (官方 Paddle.js，浏览器/Node.js)
 * 2. paddleocr (Python 版，通过 child_process 调用)
 * 3. PaddleOCR MCP Server (可集成到 Claude Desktop)
 *
 * 轻量级，支持 100+ 语言，完全本地运行
 * 官方文档: https://github.com/PaddlePaddle/PaddleOCR
 */
export class PaddleOCRBackend implements IOCRBackend {
  readonly name = 'paddle';
  private ocr: any = null;
  private config: OCRConfig;
  private mode: 'paddlejs' | 'python' | 'none' = 'none';

  constructor(config: OCRConfig) {
    this.config = config;
  }

  get isAvailable(): boolean {
    return this.mode !== 'none';
  }

  async initialize(): Promise<void> {
    // 方式 1: 尝试使用官方 @paddlejs-models/ocr
    try {
      const PaddleJS = await import('@paddlejs-models/ocr').catch(() => null);
      if (PaddleJS) {
        this.ocr = PaddleJS;
        await this.ocr.init();
        this.mode = 'paddlejs';
        console.log('✓ 使用 Paddle.js OCR (官方 JavaScript 版本)');
        return;
      }
    } catch {
      // 继续尝试其他方式
    }

    // 方式 2: 尝试通过 Python 调用 paddleocr
    try {
      const { execSync } = await import('child_process');
      // 检查 paddleocr 是否安装
      execSync('python -c "import paddleocr"', { stdio: 'ignore' });
      this.mode = 'python';
      console.log('✓ 使用 PaddleOCR Python 版本');
      return;
    } catch {
      // Python 版本不可用
    }

    throw new Error(
      'PaddleOCR 未安装。请选择以下方式之一:\n' +
      '1. npm install @paddlejs-models/ocr (推荐，JavaScript 版本)\n' +
      '2. pip install paddleocr (Python 版本)'
    );
  }

  async recognize(imageData: string | Buffer): Promise<OCRResult> {
    const startTime = Date.now();

    if (this.mode === 'paddlejs') {
      return this.recognizeWithPaddleJS(imageData, startTime);
    } else if (this.mode === 'python') {
      return this.recognizeWithPython(imageData, startTime);
    }

    throw new Error('PaddleOCR 未初始化');
  }

  private async recognizeWithPaddleJS(
    imageData: string | Buffer,
    startTime: number
  ): Promise<OCRResult> {
    // Paddle.js 需要 Canvas/Image，在 Node.js 环境需要 node-canvas
    const base64 = typeof imageData === 'string'
      ? imageData
      : imageData.toString('base64');

    // 创建 Image 对象（需要 node-canvas 或在浏览器环境）
    const result = await this.ocr.recognize(base64);

    const regions: OCRRegion[] = (result || []).map((item: any) => ({
      text: item.text || '',
      confidence: (item.confidence || 0) * 100,
      bbox: item.box ? [
        Math.min(...item.box.map((p: number[]) => p[0])),
        Math.min(...item.box.map((p: number[]) => p[1])),
        Math.max(...item.box.map((p: number[]) => p[0])) - Math.min(...item.box.map((p: number[]) => p[0])),
        Math.max(...item.box.map((p: number[]) => p[1])) - Math.min(...item.box.map((p: number[]) => p[1])),
      ] as [number, number, number, number] : [0, 0, 0, 0],
      polygon: item.box,
    }));

    const fullText = regions.map(r => r.text).join('\n');
    const avgConfidence = regions.length > 0
      ? regions.reduce((sum, r) => sum + r.confidence, 0) / regions.length
      : 0;

    return {
      text: fullText,
      confidence: avgConfidence,
      regions,
      duration: Date.now() - startTime,
      backend: 'paddle',
    };
  }

  private async recognizeWithPython(
    imageData: string | Buffer,
    startTime: number
  ): Promise<OCRResult> {
    const { execSync } = await import('child_process');
    const { writeFileSync, unlinkSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const buffer = typeof imageData === 'string'
      ? Buffer.from(imageData, 'base64')
      : imageData;

    const inputPath = join(tmpdir(), `hawkeye_ocr_in_${Date.now()}.png`);
    const outputPath = join(tmpdir(), `hawkeye_ocr_out_${Date.now()}.json`);

    writeFileSync(inputPath, buffer);

    try {
      // 调用 PaddleOCR Python API
      const pythonScript = `
import json
from paddleocr import PaddleOCR

ocr = PaddleOCR(use_angle_cls=True, lang='ch', show_log=False)
result = ocr.ocr('${inputPath}', cls=True)

output = []
if result and result[0]:
    for line in result[0]:
        box, (text, confidence) = line
        output.append({
            'box': box,
            'text': text,
            'confidence': confidence
        })

with open('${outputPath}', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False)
`;

      execSync(`python -c "${pythonScript.replace(/"/g, '\\"').replace(/\n/g, ';')}"`, {
        timeout: 30000,
        encoding: 'utf-8',
      });

      const resultJson = JSON.parse(readFileSync(outputPath, 'utf-8'));

      const regions: OCRRegion[] = resultJson.map((item: any) => ({
        text: item.text,
        confidence: item.confidence * 100,
        bbox: [
          Math.min(...item.box.map((p: number[]) => p[0])),
          Math.min(...item.box.map((p: number[]) => p[1])),
          Math.max(...item.box.map((p: number[]) => p[0])) - Math.min(...item.box.map((p: number[]) => p[0])),
          Math.max(...item.box.map((p: number[]) => p[1])) - Math.min(...item.box.map((p: number[]) => p[1])),
        ] as [number, number, number, number],
        polygon: item.box,
      }));

      const fullText = regions.map(r => r.text).join('\n');
      const avgConfidence = regions.length > 0
        ? regions.reduce((sum, r) => sum + r.confidence, 0) / regions.length
        : 0;

      return {
        text: fullText,
        confidence: avgConfidence,
        regions,
        duration: Date.now() - startTime,
        backend: 'paddle',
      };
    } finally {
      try { unlinkSync(inputPath); } catch {}
      try { unlinkSync(outputPath); } catch {}
    }
  }

  async terminate(): Promise<void> {
    this.ocr = null;
    this.mode = 'none';
  }
}

// ============ 系统原生 OCR 后端 ============

/**
 * 系统原生 OCR (macOS Vision / Windows OCR)
 * 零依赖，使用系统内置的 OCR 能力
 */
export class SystemOCRBackend implements IOCRBackend {
  readonly name = 'system';
  private platform: NodeJS.Platform;
  private initialized: boolean = false;

  constructor() {
    this.platform = process.platform;
  }

  get isAvailable(): boolean {
    return this.platform === 'darwin' || this.platform === 'win32';
  }

  async initialize(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error(`系统 OCR 不支持 ${this.platform} 平台`);
    }

    // 在 macOS 上验证 swift 是否可用
    if (this.platform === 'darwin') {
      try {
        const { execSync } = await import('child_process');
        execSync('which swift', { stdio: 'ignore' });
        console.log('[OCR] ✓ macOS Vision OCR 可用 (swift found)');
      } catch {
        throw new Error('macOS 系统 OCR 需要 Swift 命令行工具');
      }
    }

    this.initialized = true;
  }

  async recognize(imageData: string | Buffer): Promise<OCRResult> {
    const startTime = Date.now();

    const buffer = typeof imageData === 'string'
      ? Buffer.from(imageData, 'base64')
      : imageData;

    let result: { text: string; confidence: number };

    if (this.platform === 'darwin') {
      result = await this.recognizeMacOS(buffer);
    } else if (this.platform === 'win32') {
      result = await this.recognizeWindows(buffer);
    } else {
      throw new Error(`系统 OCR 不支持 ${this.platform} 平台`);
    }

    return {
      text: result.text,
      confidence: result.confidence,
      regions: [{
        text: result.text,
        confidence: result.confidence,
        bbox: [0, 0, 0, 0],
      }],
      duration: Date.now() - startTime,
      backend: 'system',
    };
  }

  private async recognizeMacOS(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
    const { exec, execSync } = await import('child_process');
    const { writeFileSync, unlinkSync, existsSync, readFileSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const timestamp = Date.now();
    const tempImagePath = join(tmpdir(), `hawkeye_ocr_${timestamp}.png`);
    const tempOutputPath = join(tmpdir(), `hawkeye_ocr_${timestamp}.txt`);

    // 保存图片临时文件
    writeFileSync(tempImagePath, imageBuffer);

    try {
      // 方案 1: 使用 osascript 调用 Vision Framework (最可靠)
      // 通过 AppleScript 间接调用，避免 Swift 编译延迟
      const appleScript = `
use framework "Vision"
use framework "Foundation"
use framework "AppKit"
use scripting additions

set imagePath to "${tempImagePath}"
set outputPath to "${tempOutputPath}"

set imageURL to current application's NSURL's fileURLWithPath:imagePath
set imageSource to current application's CGImageSourceCreateWithURL(imageURL, missing value)
set cgImage to current application's CGImageSourceCreateImageAtIndex(imageSource, 0, missing value)

set textRequest to current application's VNRecognizeTextRequest's alloc()'s init()
textRequest's setRecognitionLevel:(current application's VNRequestTextRecognitionLevelAccurate)
textRequest's setRecognitionLanguages:{"zh-Hans", "zh-Hant", "en-US", "ja"}
textRequest's setUsesLanguageCorrection:true

set requestHandler to current application's VNImageRequestHandler's alloc()'s initWithCGImage:cgImage options:(current application's NSDictionary's alloc()'s init())
requestHandler's performRequests:{textRequest} |error|:(missing value)

set recognizedText to ""
set observations to textRequest's results()
repeat with observation in observations
  set topCandidate to (observation's topCandidates:1)'s firstObject()
  if topCandidate is not missing value then
    set recognizedText to recognizedText & (topCandidate's |string|() as text) & linefeed
  end if
end repeat

-- 写入文件
set fileRef to open for access POSIX file outputPath with write permission
write recognizedText to fileRef as «class utf8»
close access fileRef

return recognizedText
`;

      await execAsync(`osascript -l AppleScriptObjC -e '${appleScript.replace(/'/g, "'\\''")}'`, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });

      // 读取结果
      if (existsSync(tempOutputPath)) {
        const text = readFileSync(tempOutputPath, 'utf-8').trim();
        console.log(`[OCR] ✓ macOS Vision OCR 成功，识别 ${text.length} 字符`);
        return { text, confidence: 0.9 };
      }

      return { text: '', confidence: 0 };
    } catch (error: any) {
      console.warn('[OCR] AppleScript Vision OCR failed:', error.message?.slice(0, 200));

      // 方案 2: 使用 screencapture + Vision (更简单但需要显示图片)
      // 跳过，因为需要额外交互

      // 方案 3: 返回空结果，让调用方回退到 Vision API
      console.log('[OCR] macOS 系统 OCR 失败，可以配置 Vision API 作为备选');
      return { text: '', confidence: 0 };
    } finally {
      // 清理临时文件
      try { if (existsSync(tempImagePath)) unlinkSync(tempImagePath); } catch {}
      try { if (existsSync(tempOutputPath)) unlinkSync(tempOutputPath); } catch {}
    }
  }

  private async recognizeWindows(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
    const { execSync } = await import('child_process');
    const { writeFileSync, unlinkSync } = await import('fs');
    const { join } = await import('path');
    const { tmpdir } = await import('os');

    const tempPath = join(tmpdir(), `hawkeye_ocr_${Date.now()}.png`);
    writeFileSync(tempPath, imageBuffer);

    try {
      // 使用 Windows OCR API (通过 PowerShell)
      const script = `
        Add-Type -AssemblyName System.Runtime.WindowsRuntime
        $null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
        $null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType=WindowsRuntime]

        $file = [Windows.Storage.StorageFile]::GetFileFromPathAsync("${tempPath.replace(/\\/g, '\\\\')}").GetAwaiter().GetResult()
        $stream = $file.OpenAsync([Windows.Storage.FileAccessMode]::Read).GetAwaiter().GetResult()
        $decoder = [Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream).GetAwaiter().GetResult()
        $bitmap = $decoder.GetSoftwareBitmapAsync().GetAwaiter().GetResult()

        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
        $result = $engine.RecognizeAsync($bitmap).GetAwaiter().GetResult()

        Write-Output $result.Text
      `;

      const result = execSync(`powershell -Command "${script}"`, {
        encoding: 'utf-8',
        timeout: 30000,
      });

      return { text: result.trim(), confidence: 0.85 };
    } catch {
      return { text: '', confidence: 0 };
    } finally {
      try { unlinkSync(tempPath); } catch {}
    }
  }

  async terminate(): Promise<void> {
    // 无需清理
  }
}

// ============ 大模型视觉 API 后端 ============

/**
 * 大模型视觉 API 后端
 * 使用 Gemini/Claude/GPT-4V 等大模型的视觉能力
 * 需要在 AI Manager 中配置 API
 */
export class VisionAPIBackend implements IOCRBackend {
  readonly name = 'vision-api';
  private analyzeFunction: ((imageBase64: string) => Promise<string>) | null = null;

  get isAvailable(): boolean {
    return this.analyzeFunction !== null;
  }

  /**
   * 设置分析函数（由 AI Manager 注入）
   */
  setAnalyzeFunction(fn: (imageBase64: string) => Promise<string>): void {
    this.analyzeFunction = fn;
  }

  async initialize(): Promise<void> {
    if (!this.analyzeFunction) {
      throw new Error('Vision API 未配置。请先设置 AI Manager。');
    }
  }

  async recognize(imageData: string | Buffer): Promise<OCRResult> {
    if (!this.analyzeFunction) {
      throw new Error('Vision API 未配置');
    }

    const startTime = Date.now();

    const base64 = typeof imageData === 'string'
      ? imageData
      : imageData.toString('base64');

    const text = await this.analyzeFunction(base64);

    return {
      text,
      confidence: 0.95,  // 大模型通常很准确
      regions: [{
        text,
        confidence: 0.95,
        bbox: [0, 0, 0, 0],
      }],
      duration: Date.now() - startTime,
      backend: 'vision-api',
    };
  }

  async terminate(): Promise<void> {
    this.analyzeFunction = null;
  }
}

// ============ OCR 管理器 ============

export class OCRManager extends EventEmitter {
  private config: OCRConfig;
  private backends: Map<OCRBackend, IOCRBackend> = new Map();
  private activeBackend: IOCRBackend | null = null;

  constructor(config: Partial<OCRConfig> = {}) {
    super();
    this.config = {
      backend: 'auto',
      languages: ['zh-Hans', 'zh-Hant', 'en'],
      confidenceThreshold: 0.5,
      useGPU: false,
      ...config,
    };
  }

  /**
   * 初始化 OCR
   */
  async initialize(): Promise<void> {
    // 注册所有后端
    this.backends.set('paddle', new PaddleOCRBackend(this.config));
    this.backends.set('system', new SystemOCRBackend());
    this.backends.set('vision-api', new VisionAPIBackend());

    // 选择后端
    if (this.config.backend === 'auto') {
      await this.autoSelectBackend();
    } else {
      await this.selectBackend(this.config.backend);
    }

    this.emit('initialized', this.activeBackend?.name);
  }

  /**
   * 自动选择最佳后端
   * 优先级: Vision API > 系统 OCR > PaddleOCR
   * Vision API 使用已配置的云端 AI，最稳定可靠
   */
  private async autoSelectBackend(): Promise<void> {
    // 优先使用系统 OCR（macOS Vision / Windows OCR）- 免费、快速、离线
    // 其次使用 Vision API（消耗 API 额度）
    // 最后使用 PaddleOCR（需要额外安装）
    const priorities: OCRBackend[] = ['system', 'vision-api', 'paddle'];

    console.log('[OCR] 开始自动选择 OCR 后端...');

    for (const backend of priorities) {
      try {
        console.log(`[OCR] 尝试后端: ${backend}`);
        await this.selectBackend(backend);
        console.log(`[OCR] ✓ 成功选择后端: ${backend}`);
        return;
      } catch (err: any) {
        console.log(`[OCR] ✗ 后端 ${backend} 不可用: ${err.message}`);
        continue;
      }
    }

    console.error('[OCR] ✗ 没有可用的 OCR 后端');
    throw new Error('没有可用的 OCR 后端');
  }

  /**
   * 选择特定后端
   */
  async selectBackend(backend: OCRBackend): Promise<void> {
    if (backend === 'auto') {
      await this.autoSelectBackend();
      return;
    }

    const instance = this.backends.get(backend);
    if (!instance) {
      throw new Error(`未知的 OCR 后端: ${backend}`);
    }

    await instance.initialize();
    this.activeBackend = instance;
    this.emit('backend-changed', backend);
  }

  /**
   * 执行 OCR 识别
   */
  async recognize(imageData: string | Buffer): Promise<OCRResult> {
    if (!this.activeBackend) {
      throw new Error('OCR 未初始化');
    }

    // 日志：输入信息
    const inputSize = typeof imageData === 'string'
      ? imageData.length
      : imageData.length;
    const inputType = typeof imageData === 'string' ? 'base64' : 'buffer';
    const startTime = Date.now();

    console.log(`\n[OCR] ════════════════════════════════════════════════════════`);
    console.log(`[OCR] 🔍 开始 OCR 识别`);
    console.log(`[OCR] ────────────────────────────────────────────────────────`);
    console.log(`[OCR] 时间: ${new Date().toISOString()}`);
    console.log(`[OCR] 输入类型: ${inputType}`);
    console.log(`[OCR] 输入大小: ${(inputSize / 1024).toFixed(2)} KB`);
    console.log(`[OCR] 使用后端: ${this.activeBackend.name}`);
    console.log(`[OCR] 置信度阈值: ${(this.config.confidenceThreshold * 100).toFixed(0)}%`);
    console.log(`[OCR] ────────────────────────────────────────────────────────`);
    console.log(`[OCR] 📤 发送图片数据到 ${this.activeBackend.name}...`);

    const result = await this.activeBackend.recognize(imageData);

    // 过滤低置信度结果
    const originalRegionCount = result.regions.length;
    result.regions = result.regions.filter(
      r => r.confidence >= this.config.confidenceThreshold * 100
    );
    const filteredCount = originalRegionCount - result.regions.length;

    // 日志：输出信息
    console.log(`[OCR] 📥 收到识别结果`);
    console.log(`[OCR] ────────────────────────────────────────────────────────`);
    console.log(`[OCR] ✅ 识别完成`);
    console.log(`[OCR] 总耗时: ${result.duration} ms`);
    console.log(`[OCR] 平均置信度: ${result.confidence.toFixed(2)}%`);
    console.log(`[OCR] 检测区域: ${originalRegionCount} 个 (过滤后: ${result.regions.length} 个)`);
    if (filteredCount > 0) {
      console.log(`[OCR] 低置信度过滤: ${filteredCount} 个区域被过滤`);
    }
    console.log(`[OCR] 文本总长度: ${result.text.length} 字符`);
    console.log(`[OCR] ────────────────────────────────────────────────────────`);
    console.log(`[OCR] 📝 识别文本内容:`);
    console.log(`[OCR] ${result.text.slice(0, 800)}${result.text.length > 800 ? '\n[OCR] ... (更多内容已省略)' : ''}`);
    console.log(`[OCR] ════════════════════════════════════════════════════════\n`);

    this.emit('recognized', result);
    return result;
  }

  /**
   * 设置 Vision API 分析函数
   */
  setVisionAnalyzer(fn: (imageBase64: string) => Promise<string>): void {
    const visionBackend = this.backends.get('vision-api') as VisionAPIBackend;
    if (visionBackend) {
      visionBackend.setAnalyzeFunction(fn);
    }
  }

  /**
   * 获取当前后端
   */
  getCurrentBackend(): string | null {
    return this.activeBackend?.name ?? null;
  }

  /**
   * 获取可用后端列表
   */
  getAvailableBackends(): string[] {
    return [...this.backends.entries()]
      .filter(([_, backend]) => backend.isAvailable)
      .map(([name, _]) => name);
  }

  /**
   * 清理资源
   */
  async terminate(): Promise<void> {
    for (const backend of this.backends.values()) {
      await backend.terminate();
    }
    this.backends.clear();
    this.activeBackend = null;
    this.emit('terminated');
  }
}

// 导出默认实例
export const ocrManager = new OCRManager();
