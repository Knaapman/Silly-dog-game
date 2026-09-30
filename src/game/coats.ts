import type { Species } from './config';

// Each animal comes in a few coats: the usual one first, two more from real life, and two
// silly ones (a blue dog, a purple cow). Picked in the animal picker, under the faces.

export type Coat = {
  /** Most of the animal. */
  fur: string;
  /** Its markings: the dog's patches and ears, the goat's beard, the pig's snout and ears, the sheep's face, the cat's stripes, the duck's wings, the cow's spots. */
  mark: string;
  /** Belly (and the dog's and cat's muzzle, the unicorn's nose). */
  light: string;
  legs: string;
  feet: string;
  /** The goat's and the unicorn's horns, the duck's bill, the cow's nose. */
  extra?: string;
  /** The unicorn's mane and tail, top to bottom. */
  mane?: string[];
};

const RAINBOW = ['#ff4d5e', '#ff9f1c', '#ffd23f', '#22c55e', '#3b82f6', '#a855f7'];

export const COATS: Record<Species, Coat[]> = {
  dog: [
    { fur: '#c98a4b', mark: '#6b4226', light: '#f3dcc0', legs: '#c98a4b', feet: '#f3dcc0' },
    { fur: '#3a3431', mark: '#1f1b19', light: '#ece4d9', legs: '#3a3431', feet: '#ece4d9' },
    { fur: '#f7f6f2', mark: '#262626', light: '#ffffff', legs: '#f7f6f2', feet: '#262626' },
    { fur: '#6fb2ff', mark: '#2f6fd1', light: '#dff0ff', legs: '#6fb2ff', feet: '#dff0ff' },
    { fur: '#ff9fd0', mark: '#d9589b', light: '#ffe3f1', legs: '#ff9fd0', feet: '#ffe3f1' }
  ],
  goat: [
    { fur: '#f4efe6', mark: '#b9ad9c', light: '#f4efe6', legs: '#e8e1d4', feet: '#3a332c', extra: '#7d7266' },
    { fur: '#9a6a43', mark: '#5e3d24', light: '#b3845c', legs: '#8a5e3a', feet: '#2a221c', extra: '#d8ccb4' },
    { fur: '#3b3633', mark: '#a19c96', light: '#4a4440', legs: '#34302d', feet: '#1c1917', extra: '#cfc3a8' },
    { fur: '#c79bff', mark: '#8f5bd9', light: '#dcc2ff', legs: '#b889f5', feet: '#5b3a8f', extra: '#fff3a8' },
    { fur: '#9be38b', mark: '#5fb04f', light: '#c2f0b6', legs: '#8fd67f', feet: '#3a6d31', extra: '#fff3a8' }
  ],
  pig: [
    { fur: '#ffa9c8', mark: '#ff86ae', light: '#ffbdd6', legs: '#ff9fc0', feet: '#c45a80' },
    { fur: '#3b3533', mark: '#ff9fc0', light: '#5a524e', legs: '#3b3533', feet: '#1c1917' },
    { fur: '#e08a4a', mark: '#f0a773', light: '#f2b88e', legs: '#d98044', feet: '#8a4a22' },
    { fur: '#8fc8ff', mark: '#5ea4f2', light: '#c2e2ff', legs: '#86bff7', feet: '#3b6fb0' },
    { fur: '#a8f0d0', mark: '#6fd6aa', light: '#d0fae6', legs: '#9ee8c6', feet: '#3f9c78' }
  ],
  sheep: [
    { fur: '#fbfbf8', mark: '#2f2a28', light: '#fbfbf8', legs: '#2f2a28', feet: '#1a1716' },
    { fur: '#3a3532', mark: '#e9dccb', light: '#4a4441', legs: '#2f2a28', feet: '#1a1716' },
    { fur: '#b88b5e', mark: '#4a3a2e', light: '#c9a077', legs: '#4a3a2e', feet: '#2a211a' },
    { fur: '#ffc4e4', mark: '#2f2a28', light: '#ffd9ee', legs: '#2f2a28', feet: '#1a1716' },
    { fur: '#b3dcff', mark: '#2f2a28', light: '#d2ebff', legs: '#2f2a28', feet: '#1a1716' }
  ],
  cat: [
    { fur: '#f29b3a', mark: '#c8641c', light: '#fff1e0', legs: '#f29b3a', feet: '#fff1e0' },
    { fur: '#9aa0a6', mark: '#5f666d', light: '#eef0f2', legs: '#9aa0a6', feet: '#eef0f2' },
    { fur: '#2e2b2b', mark: '#1b1919', light: '#f2f2f2', legs: '#2e2b2b', feet: '#f2f2f2' },
    { fur: '#c38bff', mark: '#8a4fd6', light: '#f3e6ff', legs: '#c38bff', feet: '#f3e6ff' },
    { fur: '#5fd4c8', mark: '#2a9d91', light: '#e0faf6', legs: '#5fd4c8', feet: '#e0faf6' }
  ],
  duck: [
    { fur: '#ffd23f', mark: '#f5c02a', light: '#ffe27a', legs: '#ff9f1c', feet: '#ff9f1c', extra: '#ff9f1c' },
    { fur: '#fafafa', mark: '#e3e3e3', light: '#ffffff', legs: '#ffa033', feet: '#ffa033', extra: '#ffb03a' },
    { fur: '#a87b52', mark: '#7a5536', light: '#c9a27a', legs: '#ff9f1c', feet: '#ff9f1c', extra: '#e8c23a' },
    { fur: '#ffa6d6', mark: '#ff7ec0', light: '#ffd0ea', legs: '#ff9f1c', feet: '#ff9f1c', extra: '#ff9f1c' },
    { fur: '#7fc4ff', mark: '#4a9be8', light: '#b8deff', legs: '#ff9f1c', feet: '#ff9f1c', extra: '#ffd23f' }
  ],
  cow: [
    { fur: '#fafafa', mark: '#2b2b2b', light: '#ffd6e2', legs: '#fafafa', feet: '#3a332c', extra: '#ffb3c7' },
    { fur: '#c68a52', mark: '#8a5a30', light: '#e0b58a', legs: '#c68a52', feet: '#3a2a22', extra: '#e8b7a0' },
    { fur: '#2b2b2b', mark: '#fafafa', light: '#ffd6e2', legs: '#2b2b2b', feet: '#141414', extra: '#ffb3c7' },
    { fur: '#c9a7ff', mark: '#fafafa', light: '#ecdfff', legs: '#c9a7ff', feet: '#5b3a8f', extra: '#ffb3c7' },
    { fur: '#ffb0cf', mark: '#ff6fa8', light: '#ffd6e6', legs: '#ffb0cf', feet: '#b8416b', extra: '#ffe0ec' }
  ],
  unicorn: [
    { fur: '#fffafc', mark: RAINBOW[5], light: '#ffd1e6', legs: '#fffafc', feet: '#f5c542', extra: '#f5c542', mane: RAINBOW },
    { fur: '#e6d4ff', mark: '#ff9fc4', light: '#ffd1e6', legs: '#e6d4ff', feet: '#f5c542', extra: '#f5c542', mane: ['#ff9fc4', '#ffd6a0', '#fff3a8', '#b8f5c8', '#a8d8ff', '#d6b8ff'] },
    { fur: '#ffc6e3', mark: '#8b5cf6', light: '#ffe3f1', legs: '#ffc6e3', feet: '#f5c542', extra: '#f5c542', mane: ['#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#06b6d4', '#22d3ee'] },
    { fur: '#2d2a3a', mark: '#ec4899', light: '#4a4560', legs: '#2d2a3a', feet: '#c0c4ff', extra: '#c0c4ff', mane: ['#f5c542', '#ec4899', '#a855f7', '#6366f1', '#22d3ee', '#ffffff'] },
    { fur: '#bfe3ff', mark: RAINBOW[0], light: '#ffd1e6', legs: '#bfe3ff', feet: '#f5c542', extra: '#f5c542', mane: RAINBOW }
  ]
};

export const COAT_COUNT = 5;

export function coatOf(species: Species, coat: number): Coat {
  const all = COATS[species];
  return all[((coat % all.length) + all.length) % all.length];
}
