import { create } from 'zustand';
import { TEST_MODE } from './testMode';

// Offline play: in a built game (not while developing, not in test mode) a service worker keeps
// every file, and the browser can put the game on the desktop as an app.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export const useInstall = create<{ canInstall: boolean; installed: boolean; offlineReady: boolean }>(() => ({
  canInstall: false,
  installed: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches,
  offlineReady: false
}));

let deferred: InstallEvent | null = null;

export function setupInstall() {
  if (TEST_MODE || !import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker
    .register('./sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then(() => useInstall.setState({ offlineReady: true }))
    .catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    useInstall.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    useInstall.setState({ canInstall: false, installed: true });
  });
}

/** Ask the browser to put the game on the desktop (only after a click). */
export async function installApp() {
  if (!deferred) return;
  const e = deferred;
  deferred = null;
  useInstall.setState({ canInstall: false });
  await e.prompt();
  await e.userChoice.catch(() => undefined);
}
