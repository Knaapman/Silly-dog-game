import { COAT_COUNT } from './coats';
import { BASE_SPECIES, SPECIES, type Species } from './config';
import { loadJson, saveJson } from './storage';
import { unlockedSpecies } from './stickers';

// Which animal each player number picked, remembered for next time: whoever is usually
// player two gets their own animal back instead of the goat.

const KEY = 'animals:v1';

function load(): (Species | null)[] {
  const saved = loadJson<unknown>(KEY);
  if (!Array.isArray(saved)) return [];
  return saved.map((s) => ((SPECIES as readonly unknown[]).includes(s) ? (s as Species) : null));
}

const picked = load();

/** The animal this player number had last time (if it's still in the park), or the usual one. */
export function favouriteSpecies(slot: number): Species {
  const s = picked[slot];
  return s && unlockedSpecies().includes(s) ? s : BASE_SPECIES[slot % BASE_SPECIES.length];
}

export function rememberSpecies(slot: number, species: Species) {
  if (picked[slot] === species) return;
  picked[slot] = species;
  saveJson(KEY, Array.from({ length: picked.length }, (_, i) => picked[i] ?? null));
}

// And which coat each player number wore on each animal: back to the pink pig, not just the pig.

const COAT_KEY = 'coats:v1';

type CoatMemory = Partial<Record<Species, number>>;

function loadCoats(): CoatMemory[] {
  const saved = loadJson<unknown>(COAT_KEY);
  if (!Array.isArray(saved)) return [];
  return saved.map((row) => {
    const out: CoatMemory = {};
    if (row && typeof row === 'object') {
      for (const sp of SPECIES) {
        const n = (row as Record<string, unknown>)[sp];
        if (Number.isInteger(n) && (n as number) >= 0 && (n as number) < COAT_COUNT) out[sp] = n as number;
      }
    }
    return out;
  });
}

const coats = loadCoats();

export function favouriteCoat(slot: number, species: Species): number {
  return coats[slot]?.[species] ?? 0;
}

export function rememberCoat(slot: number, species: Species, coat: number) {
  if (favouriteCoat(slot, species) === coat) return;
  coats[slot] = { ...coats[slot], [species]: coat };
  saveJson(COAT_KEY, Array.from({ length: coats.length }, (_, i) => coats[i] ?? {}));
}
