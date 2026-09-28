import { playTap } from '../game/audio';
import { PLAYER_SHAPES, SPECIES, SPECIES_EMOJI, type Species } from '../game/config';
import { useGame, type PlayerInfo } from '../game/store';
import { unlockedSpecies, useStickers } from '../game/stickers';
import { ACTION_UI } from './actions';
import { PlayerShapeIcon } from './PlayerShapeIcon';

/**
 * Choosing an animal: a row of faces for each player who's choosing, in their colour and with
 * their shape. Their stick (or a tap on a face) picks, and their animal in the park changes along
 * with it. The animals still to be earned with stickers are dark shadows, like in the album.
 */
export function AnimalPickers() {
  const players = useGame((s) => s.players);
  const stickers = useStickers((s) => s.got.length);
  const choosing = players.filter((p) => p.picking);
  if (choosing.length === 0) return null;
  const open = unlockedSpecies(stickers);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,5vh)] z-30 flex flex-col items-center gap-3 px-2">
      {choosing.map((p) => (
        <PickerRow key={p.slot} player={p} open={open} />
      ))}
    </div>
  );
}

function PickerRow({ player, open }: { player: PlayerInfo; open: Species[] }) {
  const setSpecies = useGame((s) => s.setSpecies);
  const setPicking = useGame((s) => s.setPicking);
  const face = 'h-[min(8.5vw,3.6rem)] w-[min(8.5vw,3.6rem)] text-[min(6vw,2.4rem)]';
  const go = ACTION_UI.jump;
  return (
    <div
      className="pointer-events-auto flex animate-pop items-center gap-0.5 rounded-full border-4 bg-white/90 px-2 py-1.5 shadow-xl sm:gap-1.5 sm:px-3"
      style={{ borderColor: player.color, boxShadow: `0 5px 0 ${player.color}` }}
      data-testid={`animal-picker-${player.slot}`}
    >
      <span className="mr-0.5 shrink-0 sm:mr-1">
        <PlayerShapeIcon shape={PLAYER_SHAPES[player.slot]} color={player.color} size={26} />
      </span>
      {SPECIES.map((s) => {
        const can = open.includes(s);
        const on = s === player.species;
        return (
          <button
            key={s}
            disabled={!can}
            onClick={() => {
              setSpecies(player.slot, s);
              setPicking(player.slot, false);
              playTap();
            }}
            className={`flex shrink-0 items-center justify-center rounded-full transition-transform duration-150 ${face} ${on ? 'z-10 scale-125 border-[3px] border-white shadow-lg' : 'active:scale-90'}`}
            style={{ background: on ? player.color : undefined }}
            data-species={s}
            data-selected={on}
            title={can ? SPECIES_EMOJI[s] : undefined}
          >
            <span
              className={`emoji leading-none ${on ? 'animate-hop' : ''}`}
              style={can ? undefined : { filter: 'brightness(0)', opacity: 0.2 }}
            >
              {SPECIES_EMOJI[s]}
            </span>
          </button>
        );
      })}
      {/* the "go and play" button: the same green jump button as on the pad */}
      <button
        onClick={() => {
          setPicking(player.slot, false);
          playTap();
        }}
        className={`ml-1 flex shrink-0 items-center justify-center rounded-full border-[3px] border-white text-white shadow-md active:scale-90 sm:ml-2 ${face}`}
        style={{ background: go.color, boxShadow: `0 3px 0 ${go.shadow}` }}
        title="Go!"
        data-testid={`animal-picker-go-${player.slot}`}
      >
        <span className="scale-75">{go.icon}</span>
      </button>
    </div>
  );
}
