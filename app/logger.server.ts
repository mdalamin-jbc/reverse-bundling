/**
 * Error logging and monitoring utilities
 * 
 * For production, integrate with services like:
 * - Sentry: npm install @sentry/remix
 * - Bugsnag: npm install @bugsnag/js @bugsnag/plugin-react
 * - LogRocket: npm install logrocket
 */

export interface ErrorContext {
  shop?: string;
  userId?: string;
  orderId?: string;
  ruleId?: string;
  [key: string]: any;
}

/**
 * Log error to console and monitoring service
 */
export function logError(error: Error, context?: ErrorContext) {
  // Console logging
  console.error("[Error]", error.message, {
    stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
  });

  // TODO: Send to Sentry, Bugsnag, or other monitoring service
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureException(error, { contexts: { custom: context } });
  // }
}

/**
 * Log warning
 */
export function logWarning(message: string, context?: ErrorContext) {
  console.warn("[Warning]", message, {
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log info
 */
export function logInfo(message: string, context?: ErrorContext) {
  console.log("[Info]", message, {
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Async error wrapper for better error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context?: ErrorContext
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    logError(error as Error, context);
    return null;
  }
}

/**
 * Performance monitoring
 */
export class PerformanceMonitor {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = Date.now();
  }

  end(context?: ErrorContext) {
    const duration = Date.now() - this.startTime;
    
    if (duration > 1000) {
      logWarning(`Slow operation: ${this.operation} took ${duration}ms`, context);
    } else {
      logInfo(`${this.operation} completed in ${duration}ms`, context);
    }

    return duration;
  }
}
