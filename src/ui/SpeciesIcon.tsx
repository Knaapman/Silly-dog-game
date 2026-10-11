import { SPECIES_EMOJI, type Species } from '../game/config';

/**
 * An animal's face, as an emoji. The unisheep has none of its own: it's a sheep with a little
 * unicorn peeping over its shoulder. Goes inside an `emoji` span (it takes that span's size).
 */
export function SpeciesIcon({ species }: { species: Species }) {
  if (species !== 'unisheep') return <>{SPECIES_EMOJI[species]}</>;
  return (
    <span className="relative inline-block" data-icon="unisheep">
      {SPECIES_EMOJI.unisheep}
      <span className="absolute leading-none" style={{ fontSize: '0.55em', left: '-0.25em', top: '-0.3em' }} aria-hidden>
        🦄
      </span>
    </span>
  );
}
