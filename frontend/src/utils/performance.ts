/**
 * Performance optimization utilities
 * Handles virtualization, memoization, and efficient rendering patterns
 */

import { useCallback, useRef, useEffect } from 'react';

/**
 * Virtual scrolling configuration for tables/lists
 */
export interface VirtualizationConfig {
  itemHeight: number;
  visibleItems: number;
  bufferSize: number;
}

/**
 * Default virtualization config for 500+ items
 */
export const DEFAULT_VIRTUALIZATION_CONFIG: VirtualizationConfig = {
  itemHeight: 60,
  visibleItems: 20,
  bufferSize: 5,
};

/**
 * Calculate virtual scroll range
 */
export const calculateVirtualRange = (
  scrollTop: number,
  containerHeight: number,
  itemHeight: number,
  bufferSize: number
): { start: number; end: number } => {
  const visibleItems = Math.ceil(containerHeight / itemHeight);
  const start = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
  const end = Math.min(
    start + visibleItems + bufferSize * 2,
    Math.ceil(containerHeight / itemHeight)
  );

  return { start, end };
};

/**
 * Debounce hook for expensive operations
 */
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

/**
 * Throttle hook for high-frequency events
 */
export const useThrottle = <T,>(value: T, interval: number): T => {
  const [throttledValue, setThrottledValue] = React.useState(value);
  const lastUpdated = useRef<number>(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now >= lastUpdated.current + interval) {
      lastUpdated.current = now;
      setThrottledValue(value);
    }
  }, [value, interval]);

  return throttledValue;
};

/**
 * Batch update strategy for WebSocket messages
 */
export interface UpdateBatch<T> {
  items: T[];
  timestamp: number;
}

/**
 * Create batched updates from stream of items
 */
export const createUpdateBatcher = <T>(batchSize: number, timeWindow: number) => {
  let batch: UpdateBatch<T> = {
    items: [],
    timestamp: Date.now(),
  };

  return {
    add: (item: T): UpdateBatch<T> | null => {
      batch.items.push(item);

      const now = Date.now();
      const isTimeWindowExceeded = now - batch.timestamp > timeWindow;
      const isBatchFull = batch.items.length >= batchSize;

      if (isTimeWindowExceeded || isBatchFull) {
        const result = batch;
        batch = { items: [], timestamp: now };
        return result;
      }

      return null;
    },

    flush: (): UpdateBatch<T> | null => {
      if (batch.items.length === 0) return null;
      const result = batch;
      batch = { items: [], timestamp: Date.now() };
      return result;
    },
  };
};

/**
 * Calculate if component should update (prevents unnecessary renders)
 */
export const shouldComponentUpdate = <T extends Record<string, any>>(
  currentProps: T,
  nextProps: T,
  keysToCheck?: (keyof T)[]
): boolean => {
  const keys = keysToCheck || Object.keys(currentProps) as (keyof T)[];

  for (const key of keys) {
    if (currentProps[key] !== nextProps[key]) {
      return true;
    }
  }

  return false;
};

/**
 * Optimize array operations with Map for O(1) lookups
 */
export class OptimizedCollection<T extends { id: string }> {
  private map: Map<string, T> = new Map();

  add(item: T): void {
    this.map.set(item.id, item);
  }

  update(item: T): void {
    this.map.set(item.id, { ...this.map.get(item.id), ...item });
  }

  remove(id: string): void {
    this.map.delete(id);
  }

  get(id: string): T | undefined {
    return this.map.get(id);
  }

  getAll(): T[] {
    return Array.from(this.map.values());
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  filter(predicate: (item: T) => boolean): T[] {
    const result: T[] = [];
    for (const item of this.map.values()) {
      if (predicate(item)) result.push(item);
    }
    return result;
  }

  findIndex(id: string): number {
    let index = 0;
    for (const key of this.map.keys()) {
      if (key === id) return index;
      index++;
    }
    return -1;
  }
}

/**
 * Web Worker task execution for heavy computations
 */
export const offloadToWorker = async (
  computation: (data: any) => any,
  data: any
): Promise<any> => {
  return new Promise((resolve, reject) => {
    try {
      const result = computation(data);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Memory-efficient request animation frame batching
 */
export const useRAFBatch = () => {
  const frameRef = useRef<number | null>(null);
  const tasksRef = useRef<Array<() => void>>([]);

  const schedule = useCallback((task: () => void) => {
    tasksRef.current.push(task);

    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(() => {
        const tasks = tasksRef.current;
        tasksRef.current = [];
        frameRef.current = null;

        tasks.forEach((task) => task());
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  return { schedule };
};

/**
 * React import - avoid circular dependencies
 */
import React from 'react';
