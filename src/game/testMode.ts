// "?test" in the URL: automated-test mode. The game only moves when a test calls
// window.__silly.step(frames), always by exactly 1/60 s, with seeded randomness, and it only
// draws when asked. That makes browser tests fast and repeatable on any machine.
const params = new URLSearchParams(typeof window !== 'undefined' ? (window.location?.search ?? '') : '');
export const TEST_MODE = params.has('test');
export const TEST_SEED = Number(params.get('test')) || 1;
