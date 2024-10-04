
/**
 * Custom throttle function that allows the first call to go through immediately
 * and then limits subsequent calls.
 * @param func - The function to throttle.
 * @param limit - The minimum time between function calls in milliseconds.
 * @returns A throttled version of the function.
 */
export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): T {
  let lastCall = 0;
  let timeoutId: NodeJS.Timer | null = null;

  return function (this: any, ...args: Parameters<T>) {
    const context = this;
    const now = Date.now();

    if (now - lastCall >= limit) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      return func.apply(context, args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        func.apply(context, args);
      }, limit - (now - lastCall));
    }
  } as T;
}
