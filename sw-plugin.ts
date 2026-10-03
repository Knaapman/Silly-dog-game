import type { Plugin } from 'vite';

/**
 * Writes sw.js into the build: a service worker that stores every file of this build, so the
 * installed game starts from a desktop icon without a server or an internet connection.
 * Each build gets its own cache (named after a hash of its file list); older ones are deleted
 * once the new version takes over.
 */
export function serviceWorker(): Plugin {
  return {
    name: 'silly-park-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['./', ...Object.keys(bundle).map((f) => `./${f}`)];
      for (const extra of ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/icon.svg']) {
        files.push(`./${extra}`);
      }
      const unique = [...new Set(files)].sort();
      let hash = 0;
      for (const ch of unique.join('|')) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
      const version = `silly-park-${(hash >>> 0).toString(36)}`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, unique) });
    }
  };
}

function swSource(version: string, files: string[]) {
  return `// Generated at build time (see sw-plugin.ts).
const VERSION = ${JSON.stringify(version)};
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('silly-park-') && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // The page itself: try the network first (to pick up a new version), else the stored one. A
    // server that answers with an error page (stopped half-way, wrong folder) counts as no network.
    const stored = () => caches.open(VERSION).then((cache) => cache.match('./')).then((r) => r || Response.error());
    event.respondWith(
      fetch(req)
        .then((r) => (r.ok ? r : stored().then((s) => (s.type === 'error' ? r : s))))
        .catch(stored)
    );
    return;
  }
  // Everything else never changes within a version: stored copy first.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
}
