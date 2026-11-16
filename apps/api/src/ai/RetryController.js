/**
 * Retry Controller — Manages bounded retries with exponential backoff and jitter.
 *
 * Handles provider-specific retry policies, respects Retry-After headers,
 * and enforces deadlines to prevent runaway retries.
 */

import { AIError, AI_ERROR_CATEGORY } from '../services/ai/AIError.js';

export class RetryController {
  constructor(options = {}) {
    this._baseDelayMs = options.baseDelayMs ?? 250;
    this._maxDelayMs = options.maxDelayMs ?? 5000;
    this._jitterMs = options.jitterMs ?? 250;
    this._maxAttempts = options.maxAttempts ?? 2; // 1 retry = 2 attempts
    this._retryableCategories = new Set(options.retryableCategories ?? [
      AI_ERROR_CATEGORY.RATE_LIMITED,
      AI_ERROR_CATEGORY.TIMEOUT,
      AI_ERROR_CATEGORY.PROVIDER_UNAVAILABLE,
      AI_ERROR_CATEGORY.TIMEOUT,
    ]);
  }

  /**
   * Execute an operation with retry logic.
   */
  async executeWithRetry(operation, options = {}) {
    const {
      maxAttempts = this._maxAttempts,
      deadline = null, // absolute timestamp in ms
      retryableCategories = this._retryableCategories,
      onRetry = null, // callback(retryCount, error, waitMs)
      context = {},
    } = options;

    let attemptIndex = 0;
    let lastError = null;

    while (attemptIndex < maxAttempts) {
      attemptIndex += 1;
      const retryCount = attemptIndex - 1;

      // Check deadline
      if (deadline && Date.now() >= deadline) {
        throw new Error(`Retry deadline exceeded after ${retryCount} retries`);
      }

      try {
        const result = await operation(context);
        return result;
      } catch (error) {
        lastError = error;
        const aiError = AIError.from(error);

        // Check if we should retry
        const isRetryable = retryableCategories.has(aiError.category);
        const canRetry = isRetryable && attemptIndex < maxAttempts;

        if (!canRetry) {
          throw error;
        }

        // Calculate wait time
        let waitMs = this._calculateWait(aiError, retryCount);

        // Respect deadline
        if (deadline && Date.now() + waitMs >= deadline) {
          throw new Error(`Retry would exceed deadline`);
        }

        // Call retry callback
        if (onRetry) {
          await onRetry(retryCount, aiError, waitMs);
        }

        // Wait before retry
        await this._sleep(waitMs);
      }
    }

    throw lastError;
  }

  _calculateWait(error, retryCount) {
    // Respect Retry-After header if present
    if (error.retryAfterMs !== null && error.retryAfterMs !== undefined) {
      return Math.max(0, Math.min(error.retryAfterMs, this._maxDelayMs));
    }

    // Rate limited errors: longer backoff
    if (error.category === AI_ERROR_CATEGORY.RATE_LIMITED) {
      const base = Math.min(1000 * 2 ** retryCount, this._maxDelayMs);
      return base + Math.floor(Math.random() * this._jitterMs);
    }

    // Other retryable errors: exponential backoff with jitter
    const base = Math.min(this._baseDelayMs * 2 ** retryCount, this._maxDelayMs);
    return base + Math.floor(Math.random() * this._jitterMs);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Static helper for simple retry with default settings.
   */
  static async retry(operation, maxAttempts = 2, baseDelayMs = 250) {
    const controller = new RetryController({ maxAttempts, baseDelayMs });
    return controller.executeWithRetry(operation);
  }
}

export default RetryController;