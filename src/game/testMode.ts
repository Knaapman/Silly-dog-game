// "?test" in the URL: automated-test mode. The game only moves when a test calls
// window.__silly.step(frames), always by exactly 1/60 s, with seeded randomness, and it only
// draws when asked. That makes browser tests fast and repeatable on any machine.
const params = new URLSearchParams(typeof window !== 'undefined' ? (window.location?.search ?? '') : '');
export const TEST_MODE = params.has('test');
export const TEST_SEED = Number(params.get('test')) || 1;

/** Parts of the park a test can leave out ("?test=1&off=cats,birds"), when they'd only get in the way. */
export type TestSystem = 'cats' | 'birds' | 'chickens';
const OFF = new Set(TEST_MODE ? (params.get('off') ?? '').split(',').filter(Boolean) : []);
export function systemOff(system: TestSystem) {
  return OFF.has(system);
}

/**
 * And parts that are off in test mode unless a test asks for them ("?test=1&on=secrets"): the
 * secrets would surprise tests that stand still a while or count stickers. Always on in play.
 */
export type OptInSystem = 'secrets';
const ON = new Set(TEST_MODE ? (params.get('on') ?? '').split(',').filter(Boolean) : []);
export function systemOn(system: OptInSystem) {
  return !TEST_MODE || ON.has(system);
}
