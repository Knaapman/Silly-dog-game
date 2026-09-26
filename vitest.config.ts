import { defineConfig } from 'vitest/config';

// Unit tests for the pure game modules (input, clock, layout, physics helpers).
// Browser tests live in e2e/ and run with Playwright (npm run test:e2e).
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node'
  }
});
