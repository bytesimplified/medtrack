import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vitest/config'

function offlineAppShell(): Plugin {
  return {
    name: 'medtrack-offline-app-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const urls = [
        ...new Set([
          '/',
          '/index.html',
          ...Object.keys(bundle)
            .filter((fileName) => fileName !== 'sw.js')
            .sort()
            .map((fileName) => `/${fileName}`),
        ]),
      ]
      const version = createHash('sha256')
        .update(urls.join('\n'))
        .digest('hex')
        .slice(0, 12)
      const source = `
const CACHE_NAME = 'medtrack-shell-${version}';
const PRECACHE_URLS = ${JSON.stringify(urls)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('medtrack-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (!response.ok) {
            return caches.match('/index.html').then((cached) => cached || response);
          }
          void caches.open(CACHE_NAME)
            .then((cache) => cache.put('/index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached || Response.error())),
    );
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(url.pathname).then((cached) => cached || fetch(request)),
    );
  }
});
`
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [react(), tailwindcss(), offlineAppShell()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    clearMocks: true,
  },
})
