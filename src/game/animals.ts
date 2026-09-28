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
