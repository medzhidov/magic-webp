/**
 * Debug logging system for magic-webp
 * Logs are disabled by default in production, can be enabled via setDebugMode()
 */

let debugMode = false;

/**
 * Enable or disable debug logging
 * @param enabled - true to enable debug logs, false to disable
 * 
 * @example
 * ```typescript
 * import { setDebugMode } from 'magic-webp';
 * 
 * // Enable debug logging
 * setDebugMode(true);
 * ```
 */
export function setDebugMode(enabled: boolean): void {
  debugMode = enabled;
  if (enabled) {
    console.log('[magic-webp] Debug mode enabled');
  }
}

/**
 * Get current debug mode state
 */
export function isDebugMode(): boolean {
  return debugMode;
}

/**
 * Internal debug logger - only logs when debug mode is enabled
 */
export function debug(...args: any[]): void {
  if (debugMode) {
    console.log(...args);
  }
}

/**
 * Internal error logger - always logs errors
 */
export function error(...args: any[]): void {
  console.error(...args);
}

/**
 * Internal warning logger - always logs warnings
 */
export function warn(...args: any[]): void {
  console.warn(...args);
}

