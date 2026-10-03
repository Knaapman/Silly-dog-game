import { seededRandom } from './clock';
import { TEST_MODE, TEST_SEED } from './testMode';

// Random streams: each part of the game draws its random numbers from a stream of its own. In
// test mode each stream is seeded from the test's seed and its name, so a change in one part (a
// new particle effect, a cat that turns one more time) no longer shifts every random number
// after it in every other part. In play they are all just Math.random.

/** FNV-1a: a stream's seed from the test's seed and its name. */
function seedFor(name: string) {
  let h = (2166136261 ^ TEST_SEED) >>> 0;
  for (let i = 0; i < name.length; i += 1) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  return h;
}

export function randomStream(name: string): () => number {
  return TEST_MODE ? seededRandom(seedFor(name)) : () => Math.random();
}
