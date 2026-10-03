// When something in the game goes wrong. One broken part (an attraction's per-frame code, a
// timer, a component that fails to draw, the graphics card dropping out) must never freeze or
// blank the whole park in front of a child: it's caught where it happens, reported once (to the
// console and the play log) and everything else keeps going.

export const faults = { count: 0, messages: [] as string[] };
const listeners = new Set<(message: string) => void>();

/** Hear about every new fault (the play log keeps them). */
export function onFault(fn: (message: string) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Something threw (`where`: what was running). Each distinct message is reported once. */
export function reportFault(where: string, error: unknown, level: 'error' | 'warn' = 'error') {
  faults.count += 1;
  const e = error instanceof Error ? error : new Error(String(error));
  const at = (e.stack ?? '').split('\n').find((l) => l.trim().startsWith('at '))?.trim() ?? '';
  const message = `${where}: ${e.message}${at ? ` (${at})` : ''}`;
  if (faults.messages.includes(message)) return;
  if (faults.messages.length < 50) faults.messages.push(message);
  console[level](`[silly park] ${message}`);
  listeners.forEach((fn) => fn(message));
}
