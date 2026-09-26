import { defineConfig, devices } from '@playwright/test';

// Browser tests. The game runs in its "?test" mode: nothing moves unless a test steps it,
// always by exactly 1/60 s, with seeded randomness, so results don't depend on the machine.
const PORT = 4173;
/** The built game (for the offline test), in its own folder so it never touches dist/. */
export const BUILT_PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 960, height: 540 },
    trace: 'retain-on-failure',
    launchOptions: {
      // WebGL without a GPU (CI machines, containers)
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    }
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 540 } } }],
  webServer: [
    {
      command: `npx vite --port ${PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: `npx vite build --outDir .e2e-dist --emptyOutDir && npx vite preview --outDir .e2e-dist --port ${BUILT_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${BUILT_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000
    }
  ]
});
