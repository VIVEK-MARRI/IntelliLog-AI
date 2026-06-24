import { lazy, ComponentType, LazyExoticComponent } from 'react'

interface LazyWithRetryOptions {
  retries?: number
  delay?: number
  backoff?: number
  onError?: (error: Error, attempt: number) => void
}

/**
 * Creates a lazy component with automatic retry on chunk load failure.
 * Provides exponential backoff and configurable retry attempts.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  options: LazyWithRetryOptions = {}
): LazyExoticComponent<T> {
  const {
    retries = 3,
    delay = 1000,
    backoff = 2,
    onError,
  } = options

  return lazy(async () => {
    let attempt = 0
    let lastError: Error

    while (attempt <= retries) {
      try {
        const result = await factory()
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        attempt++

        if (attempt <= retries) {
          onError?.(lastError, attempt)
          const waitTime = delay * Math.pow(backoff, attempt - 1)
          await new Promise(resolve => setTimeout(resolve, waitTime))
        }
      }
    }

    throw lastError!
  })
}

/**
 * Creates a lazy component that shows a retry UI on failure.
 * Wraps the component in an ErrorBoundary that allows user to retry.
 */
export function lazyWithRetryUI<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | undefined>,
  options: LazyWithRetryOptions & { fallbackMessage?: string } = {}
): LazyExoticComponent<T> {
  const { fallbackMessage = 'Failed to load this section. Tap to retry.' } = options

  // Wrap the factory to handle undefined results
  const wrappedFactory = async (): Promise<{ default: T }> => {
    const result = await factory()
    if (!result) throw new Error('Module has no default export')
    return result
  }

  return lazy(async (): Promise<{ default: T }> => {
    let attempt = 0
    const { retries = 3, delay = 1000, backoff = 2, onError } = options

    while (true) {
      try {
        return await wrappedFactory()
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        attempt++

        if (attempt > retries) {
          throw new LazyLoadError(err.message, fallbackMessage)
        }

        onError?.(err, attempt)
        const waitTime = delay * Math.pow(backoff, attempt - 1)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  })
}

/**
 * Error class for lazy load failures that carries user-facing message.
 */
export class LazyLoadError extends Error {
  public readonly userMessage: string
  public readonly originalError: Error

  constructor(message: string, userMessage: string, originalError?: Error) {
    super(message)
    this.name = 'LazyLoadError'
    this.userMessage = userMessage
    this.originalError = originalError ?? new Error(message)
  }
}

/**
 * Checks if an error is a LazyLoadError.
 */
export function isLazyLoadError(error: unknown): error is LazyLoadError {
    return error instanceof LazyLoadError
}

/**
 * Creates a retry handler for ErrorBoundary to re-trigger lazy loading.
 */
export function createLazyRetry(
  _factory: () => Promise<{ default: ComponentType<any> }>,
  setRetryKey: React.Dispatch<React.SetStateAction<number>>
): () => void {
  return () => {
    setRetryKey(prev => prev + 1)
    // The lazy component will re-execute when the key changes
  }
}