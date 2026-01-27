/**
 * 指数退避重试策略
 * 参考 steipete/wacli 的 ReconnectWithBackoff 模式
 */

export interface RetryConfig {
  /** 最小延迟 (ms) */
  minDelay: number;
  /** 最大延迟 (ms) */
  maxDelay: number;
  /** 退避乘数 */
  multiplier: number;
  /** 是否添加抖动 (防止雷群效应) */
  jitter: boolean;
  /** 最大重试次数 */
  maxRetries: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  minDelay: 100,
  maxDelay: 30000,
  multiplier: 2,
  jitter: true,
  maxRetries: 3,
};

/**
 * 计算指数退避延迟
 * @param attempt 当前尝试次数 (从 0 开始)
 * @param config 重试配置
 * @returns 延迟时间 (ms)
 */
export function calculateBackoffDelay(attempt: number, config: Partial<RetryConfig> = {}): number {
  const { minDelay, maxDelay, multiplier, jitter } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  // 计算基础延迟: minDelay * multiplier^attempt
  const baseDelay = minDelay * Math.pow(multiplier, attempt);

  // 限制最大延迟
  const cappedDelay = Math.min(baseDelay, maxDelay);

  // 添加抖动 (±25%)
  if (jitter) {
    const jitterRange = cappedDelay * 0.25;
    const randomJitter = (Math.random() - 0.5) * 2 * jitterRange;
    return Math.round(Math.max(minDelay, cappedDelay + randomJitter));
  }

  return Math.round(cappedDelay);
}

/**
 * 带指数退避的重试执行器
 * @param fn 要执行的异步函数
 * @param config 重试配置
 * @param onRetry 重试回调 (可选)
 * @returns 函数执行结果
 */
export async function executeWithBackoff<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, delay: number, error: Error) => void
): Promise<T> {
  const { maxRetries } = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = calculateBackoffDelay(attempt, config);
        onRetry?.(attempt, delay, lastError);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('所有重试都失败了');
}

/**
 * 带超时的 Promise 包装
 * @param promise 原始 Promise
 * @param timeoutMs 超时时间 (ms)
 * @param errorMessage 超时错误消息
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = '操作超时'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * 带上下文取消的重试执行器
 * @param fn 要执行的异步函数
 * @param signal AbortSignal 用于取消
 * @param config 重试配置
 */
export async function executeWithBackoffAndAbort<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, delay: number, error: Error) => void
): Promise<T> {
  const { maxRetries } = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 检查是否已取消
    if (signal.aborted) {
      throw new Error('操作已取消');
    }

    try {
      return await fn(signal);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 如果是取消错误，直接抛出
      if (signal.aborted || lastError.name === 'AbortError') {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = calculateBackoffDelay(attempt, config);
        onRetry?.(attempt, delay, lastError);
        await sleepWithAbort(delay, signal);
      }
    }
  }

  throw lastError || new Error('所有重试都失败了');
}

/**
 * 异步睡眠
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 可中断的异步睡眠
 */
function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('操作已取消'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    const abortHandler = () => {
      clearTimeout(timeoutId);
      reject(new Error('操作已取消'));
    };

    signal.addEventListener('abort', abortHandler, { once: true });
  });
}

/**
 * 重试策略类 - 提供更细粒度的控制
 */
export class RetryStrategy {
  private config: RetryConfig;
  private currentAttempt: number = 0;
  private lastError: Error | null = null;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * 是否还可以重试
   */
  canRetry(): boolean {
    return this.currentAttempt < this.config.maxRetries;
  }

  /**
   * 获取当前重试次数
   */
  getAttemptCount(): number {
    return this.currentAttempt;
  }

  /**
   * 获取下次重试的延迟
   */
  getNextDelay(): number {
    return calculateBackoffDelay(this.currentAttempt, this.config);
  }

  /**
   * 记录失败并增加计数
   */
  recordFailure(error: Error): void {
    this.lastError = error;
    this.currentAttempt++;
  }

  /**
   * 重置重试状态
   */
  reset(): void {
    this.currentAttempt = 0;
    this.lastError = null;
  }

  /**
   * 获取最后一次错误
   */
  getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * 等待下次重试
   */
  async waitForNextRetry(): Promise<void> {
    const delay = this.getNextDelay();
    await sleep(delay);
  }
}
