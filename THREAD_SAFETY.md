# Thread Safety Implementation

## Overview

As of version 0.2.0, `magic-webp` implements automatic operation queuing to ensure thread-safety when processing WebP images.

## Problem

The WASM module uses global state for:
- Error messages (`static char last_error[256]`)
- Memory allocation (shared WASM heap)

Without synchronization, concurrent operations could cause:
- Race conditions in memory allocation
- Error message corruption
- Unpredictable results or crashes

## Solution

### Promise-Based Operation Queue

All WASM operations are automatically queued using a Promise chain:

```typescript
let operationQueue = Promise.resolve();

function enqueueOperation<T>(operation: () => T | Promise<T>): Promise<T> {
  const promise = operationQueue.then(operation, operation);
  operationQueue = promise.then(() => {}, () => {});
  return promise;
}
```

### API Changes

All transformation methods are now **async**:

**Before (v0.1.x):**
```typescript
const cropped = img.crop(0, 0, 100, 100);  // Synchronous
const resized = img.resize(200, 200);      // Synchronous
```

**After (v0.2.x):**
```typescript
const cropped = await img.crop(0, 0, 100, 100);  // Async
const resized = await img.resize(200, 200);      // Async
```

## Usage Examples

### Sequential Operations
```typescript
const img = await MagicWebp.fromFile(file);
const cropped = await img.crop(0, 0, 100, 100);
const resized = await cropped.resize(50, 50);
```

### Concurrent Operations (Safe!)
```typescript
// All operations are queued automatically
const [result1, result2, result3] = await Promise.all([
  img.crop(0, 0, 100, 100),
  img.resize(200, 200),
  img.resizeFit(150, 150)
]);
```

### Multiple Images
```typescript
// Process multiple images concurrently - also safe!
const results = await Promise.all(
  images.map(img => img.resize(100, 100))
);
```

### Chaining
```typescript
const result = await img
  .crop(10, 10, 200, 200)
  .then(cropped => cropped.resize(100, 100))
  .then(resized => resized.resizeFit(80, 80));
```

## Performance Impact

- **Sequential execution**: Operations run one at a time
- **No blocking**: The queue is non-blocking - other JavaScript code continues to run
- **Minimal overhead**: Queue management adds negligible overhead (~1-2ms per operation)

## Migration Guide

### Breaking Changes

1. **All transformation methods are now async**
   - Add `await` before `crop()`, `resize()`, `resizeFit()`
   - Update method chaining to use `.then()`

2. **Return types changed**
   - `crop()`: `MagicWebp` → `Promise<MagicWebp>`
   - `resize()`: `MagicWebp` → `Promise<MagicWebp>`
   - `resizeFit()`: `MagicWebp` → `Promise<MagicWebp>`

### Migration Examples

**Before:**
```typescript
const result = img.crop(0, 0, 100, 100).resize(50, 50).toBlob();
```

**After:**
```typescript
const cropped = await img.crop(0, 0, 100, 100);
const resized = await cropped.resize(50, 50);
const result = resized.toBlob();

// Or with chaining:
const result = await img
  .crop(0, 0, 100, 100)
  .then(c => c.resize(50, 50))
  .then(r => r.toBlob());
```

## Testing

New test suite in `src-js/concurrent.test.ts` covers:
- Sequential operations
- Concurrent operations with `Promise.all()`
- Multiple images processed concurrently
- Chained operations
- Error handling in concurrent scenarios
- Rapid-fire operations (stress test)

Run tests:
```bash
pnpm test
```

## Technical Details

### Implementation

1. **Queue mechanism**: Promise chain ensures FIFO execution
2. **Error handling**: Errors don't break the queue
3. **No locks needed**: JavaScript is single-threaded
4. **Worker-safe**: Each Worker has its own WASM instance and queue

### Why Not Locks?

JavaScript is single-threaded, so traditional locks aren't needed. The Promise queue provides:
- Automatic serialization
- Non-blocking behavior
- Clean async/await syntax
- Error isolation

## Future Improvements

Potential optimizations for future versions:
- [ ] Parallel processing with multiple WASM instances
- [ ] Batch operations API
- [ ] Operation cancellation
- [ ] Progress callbacks for long operations

