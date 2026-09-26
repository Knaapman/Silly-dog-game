import { TEST_MODE } from './testMode';

// Small, forgiving wrapper around localStorage. Storage can be missing, full, or throw
// (private windows, blocked site data): then things simply aren't remembered. Test mode never
// reads or writes it, so every test starts from the same clean park.

const PREFIX = 'silly-park:';

export function loadJson<T>(key: string): T | undefined {
  if (TEST_MODE) return undefined;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw == null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

/** Returns false when it couldn't be saved (no storage, or it's full). */
export function saveJson(key: string, value: unknown): boolean {
  if (TEST_MODE) return true;
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string) {
  if (TEST_MODE) return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // nothing to do
  }
}
