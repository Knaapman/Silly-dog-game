// The React scheduler ships without types; the test driver only needs this much of it.
declare module 'scheduler' {
  export const unstable_IdlePriority: number;
  export function unstable_scheduleCallback(priority: number, callback: () => void): unknown;
}
