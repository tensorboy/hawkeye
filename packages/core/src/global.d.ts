/**
 * Global Type Declarations
 *
 * 为没有 TypeScript 类型定义的第三方模块提供声明
 */

// UUID 模块
declare module 'uuid' {
  export function v4(): string;
  export function v1(): string;
  export function v3(name: string | number[], namespace: string | number[]): string;
  export function v5(name: string | number[], namespace: string | number[]): string;
  export function parse(uuid: string): number[];
  export function stringify(arr: number[]): string;
  export function validate(uuid: string): boolean;
  export function version(uuid: string): number;
}

// Better-SQLite3 模块
declare module 'better-sqlite3' {
  interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
    iterate(...params: unknown[]): IterableIterator<unknown>;
    bind(...params: unknown[]): Statement;
  }

  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): Database;
    pragma(pragma: string, options?: { simple?: boolean }): unknown;
    close(): void;
    transaction<T>(fn: () => T): () => T;
    function(name: string, fn: (...args: unknown[]) => unknown): Database;
    aggregate(name: string, options: object): Database;
    loadExtension(path: string): Database;
    backup(destinationFile: string, options?: { progress?: (info: { totalPages: number; remainingPages: number }) => number }): Promise<void>;
    serialize(options?: { attached?: string }): Buffer;
    readonly open: boolean;
    readonly inTransaction: boolean;
    readonly name: string;
    readonly memory: boolean;
    readonly readonly: boolean;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: {
      readonly?: boolean;
      fileMustExist?: boolean;
      timeout?: number;
      verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
    }): Database;
    (filename: string, options?: {
      readonly?: boolean;
      fileMustExist?: boolean;
      timeout?: number;
      verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
    }): Database;
  }

  const Database: DatabaseConstructor;
  export = Database;
}

// Screenshot Desktop 模块
declare module 'screenshot-desktop' {
  interface ScreenshotOptions {
    screen?: number;
    format?: 'png' | 'jpg';
    quality?: number;
  }

  function screenshot(options?: ScreenshotOptions): Promise<Buffer>;
  function listDisplays(): Promise<Array<{ id: number; name: string }>>;

  export = screenshot;
  export { listDisplays };
}

// PaddleJS OCR 模块
declare module '@aspect-ratio/core' {
  const aspectRatioCore: unknown;
  export default aspectRatioCore;
}

declare module '@aspect-ratio/core/dist/ocr' {
  const ocr: unknown;
  export default ocr;
}

declare module '@aspect-ratio/core/dist/recognition' {
  const recognition: unknown;
  export default recognition;
}

declare module '@paddlejs-models/ocr' {
  interface OcrResult {
    text: string;
    confidence: number;
    box: number[][];
  }

  interface OcrInstance {
    recognize(imageData: ImageData | HTMLCanvasElement | HTMLImageElement): Promise<OcrResult[]>;
  }

  export function init(config?: object): Promise<OcrInstance>;
  export function recognize(imageData: ImageData | HTMLCanvasElement | HTMLImageElement): Promise<OcrResult[]>;
}

// Active-Win 模块 (如果使用)
declare module 'active-win' {
  interface Result {
    title: string;
    id: number;
    bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    owner: {
      name: string;
      processId: number;
      bundleId?: string;
      path?: string;
    };
    memoryUsage?: number;
    url?: string;
  }

  function activeWin(): Promise<Result | undefined>;
  function activeWinSync(): Result | undefined;

  export = activeWin;
}

// Nut.js 模块 (桌面自动化)
declare module '@nut-tree/nut-js' {
  export interface Point {
    x: number;
    y: number;
  }

  export interface Size {
    width: number;
    height: number;
  }

  export interface Region {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  export interface Image {
    width: number;
    height: number;
    data: Buffer;
    channels: number;
    id: string;
  }

  export enum Key {
    A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T, U, V, W, X, Y, Z,
    F1, F2, F3, F4, F5, F6, F7, F8, F9, F10, F11, F12,
    Num0, Num1, Num2, Num3, Num4, Num5, Num6, Num7, Num8, Num9,
    Space, Escape, Tab, LeftAlt, LeftControl, LeftShift, LeftSuper,
    RightAlt, RightControl, RightShift, RightSuper,
    Grave, Minus, Equal, Backspace, LeftBracket, RightBracket,
    Semicolon, Quote, Backslash, Comma, Period, Slash,
    Print, Pause, Insert, Delete, Home, End, PageUp, PageDown,
    Left, Up, Right, Down, Enter, CapsLock, ScrollLock, NumLock,
    NumPad0, NumPad1, NumPad2, NumPad3, NumPad4,
    NumPad5, NumPad6, NumPad7, NumPad8, NumPad9,
    NumPadDecimal, NumPadEnter, NumPadAdd, NumPadSubtract,
    NumPadMultiply, NumPadDivide
  }

  export enum Button {
    LEFT = 0,
    MIDDLE = 1,
    RIGHT = 2
  }

  export const mouse: {
    setPosition(point: Point): Promise<void>;
    getPosition(): Promise<Point>;
    move(path: Point[]): Promise<void>;
    leftClick(): Promise<void>;
    rightClick(): Promise<void>;
    doubleClick(): Promise<void>;
    drag(path: Point[]): Promise<void>;
    scrollDown(amount: number): Promise<void>;
    scrollUp(amount: number): Promise<void>;
    scrollLeft(amount: number): Promise<void>;
    scrollRight(amount: number): Promise<void>;
  };

  export const keyboard: {
    type(text: string): Promise<void>;
    pressKey(...keys: Key[]): Promise<void>;
    releaseKey(...keys: Key[]): Promise<void>;
  };

  export const screen: {
    width(): Promise<number>;
    height(): Promise<number>;
    grab(region?: Region): Promise<Image>;
    grabRegion(region: Region): Promise<Image>;
    find(image: Image): Promise<Region>;
    findAll(image: Image): Promise<Region[]>;
    waitFor(image: Image, timeout?: number): Promise<Region>;
    on(image: Image): Promise<Region>;
    colorAt(point: Point): Promise<number>;
    highlight(region: Region): Promise<void>;
  };

  export const clipboard: {
    copy(text: string): Promise<void>;
    paste(): Promise<string>;
  };

  export function sleep(ms: number): Promise<void>;
  export function centerOf(region: Region): Promise<Point>;
  export function randomPointIn(region: Region): Promise<Point>;
}

// Tesseract.js 模块 (OCR)
declare module 'tesseract.js' {
  export interface Rectangle {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  export interface Word {
    text: string;
    confidence: number;
    bbox: Rectangle;
    baseline: { x0: number; y0: number; x1: number; y1: number };
  }

  export interface Line {
    text: string;
    confidence: number;
    bbox: Rectangle;
    words: Word[];
  }

  export interface Block {
    text: string;
    confidence: number;
    bbox: Rectangle;
    lines: Line[];
  }

  export interface Page {
    text: string;
    confidence: number;
    blocks: Block[];
    lines: Line[];
    words: Word[];
    hocr: string;
    tsv: string;
  }

  export interface RecognizeResult {
    data: Page;
  }

  export interface Worker {
    load(): Promise<void>;
    loadLanguage(lang: string): Promise<void>;
    initialize(lang: string): Promise<void>;
    setParameters(params: Record<string, string>): Promise<void>;
    recognize(image: string | Buffer | HTMLImageElement | HTMLCanvasElement): Promise<RecognizeResult>;
    detect(image: string | Buffer): Promise<{ data: { script: string; confidence: number } }>;
    terminate(): Promise<void>;
  }

  export interface Scheduler {
    addWorker(worker: Worker): Promise<void>;
    addJob(action: string, ...args: unknown[]): Promise<RecognizeResult>;
    terminate(): Promise<void>;
    getQueueLen(): number;
    getNumWorkers(): number;
  }

  export function createWorker(
    langsOrOptions?: string | string[] | {
      langPath?: string;
      logger?: (info: { status: string; progress: number }) => void;
      errorHandler?: (err: Error) => void;
    }
  ): Promise<Worker>;

  export function createScheduler(): Scheduler;

  export const PSM: {
    OSD_ONLY: string;
    AUTO_OSD: string;
    AUTO_ONLY: string;
    AUTO: string;
    SINGLE_COLUMN: string;
    SINGLE_BLOCK_VERT_TEXT: string;
    SINGLE_BLOCK: string;
    SINGLE_LINE: string;
    SINGLE_WORD: string;
    CIRCLE_WORD: string;
    SINGLE_CHAR: string;
    SPARSE_TEXT: string;
    SPARSE_TEXT_OSD: string;
    RAW_LINE: string;
  };

  export const OEM: {
    TESSERACT_ONLY: string;
    LSTM_ONLY: string;
    TESSERACT_LSTM_COMBINED: string;
    DEFAULT: string;
  };
}
