// "?test" in the URL: automated-test mode. The game only moves when a test calls
// window.__silly.step(frames), always by exactly 1/60 s, with seeded randomness, and it only
// draws when asked. That makes browser tests fast and repeatable on any machine.
export const TEST_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('test');
export const TEST_SEED = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('test')) || 1 : 1;
