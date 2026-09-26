import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { unlockAudio } from './game/audio';
import { consumeKeyPresses, installInput, onAnyKey } from './game/input';
import { Scene } from './game/Scene';
import { useGame } from './game/store';
import { GrownUpMenu } from './ui/GrownUpMenu';
import { Hud } from './ui/Hud';
import { TitleScreen } from './ui/TitleScreen';
import { TouchControls } from './ui/TouchControls';

const IGNORED_TITLE_KEYS = new Set(['Escape', 'Tab', 'ShiftLeft', 'ControlLeft', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock']);
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export default function App() {
  const phase = useGame((s) => s.phase);
  const menuOpen = useGame((s) => s.menuOpen);
  const touchUi = useGame((s) => s.touchUi);
  const setMenuOpen = useGame((s) => s.setMenuOpen);
  const setTouchUi = useGame((s) => s.setTouchUi);
  const start = useGame((s) => s.start);

  useEffect(() => {
    installInput();
    if (window.matchMedia('(pointer: coarse)').matches) setTouchUi(true);

    // Browsers only allow sound after a real click/tap/key (gamepad presses don't count).
    const unlock = () => unlockAudio();
    const onTouch = () => setTouchUi(true);
    const onKey = (e: KeyboardEvent) => {
      unlock();
      if (e.code === 'Escape' && useGame.getState().phase === 'play') {
        useGame.getState().setMenuOpen(!useGame.getState().menuOpen);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouch, { passive: true });
    const blockMenu = (e: Event) => e.preventDefault();
    window.addEventListener('contextmenu', blockMenu);

    // On the title screen any key starts; arrow keys start as the "arrows" keyboard player.
    onAnyKey((code) => {
      const game = useGame.getState();
      if (game.phase !== 'title' || game.menuOpen || IGNORED_TITLE_KEYS.has(code)) return;
      game.start(ARROWS.has(code) ? 'kb2' : 'kb1');
      consumeKeyPresses();
    });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('contextmenu', blockMenu);
      onAnyKey(null);
    };
  }, [setTouchUi]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-sky-300">
      <Canvas
        shadows="percentage"
        dpr={[1, 1.75]}
        camera={{ position: [0, 30, 42], fov: 45, near: 0.5, far: 700 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
        }}
      >
        <Scene />
      </Canvas>

      {phase === 'title' && (
        <TitleScreen
          onPlay={() => {
            unlockAudio();
            start(touchUi ? 'touch' : 'kb1');
          }}
        />
      )}
      {phase === 'play' && <Hud onOpenMenu={() => setMenuOpen(true)} />}
      {phase === 'play' && touchUi && !menuOpen && <TouchControls />}
      {menuOpen && <GrownUpMenu />}
    </div>
  );
}
