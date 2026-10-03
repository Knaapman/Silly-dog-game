import { Canvas } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import { unlockAudio } from './game/audio';
import { consumeKeyPresses, installInput, onAnyKey } from './game/input';
import { Safe } from './game/Contained';
import { Scene } from './game/Scene';
import { detectQuality, effectiveQuality, qualityDpr, useSettings } from './game/settings';
import { useGame } from './game/store';
import { GrownUpMenu } from './ui/GrownUpMenu';
import { Hud } from './ui/Hud';
import { TitleScreen } from './ui/TitleScreen';
import { SplitFrames } from './ui/SplitFrames';
import { StickerAlbum } from './ui/Stickers';
import { TouchControls } from './ui/TouchControls';

const IGNORED_TITLE_KEYS = new Set(['Escape', 'Tab', 'ShiftLeft', 'ControlLeft', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight', 'CapsLock']);
const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export default function App() {
  const phase = useGame((s) => s.phase);
  const menuOpen = useGame((s) => s.menuOpen);
  const albumOpen = useGame((s) => s.albumOpen);
  const touchUi = useGame((s) => s.touchUi);
  const setMenuOpen = useGame((s) => s.setMenuOpen);
  const setTouchUi = useGame((s) => s.setTouchUi);
  const start = useGame((s) => s.start);
  const quality = useSettings(effectiveQuality);

  useEffect(() => {
    installInput();
    if (window.matchMedia('(pointer: coarse)').matches) setTouchUi(true);

    // Browsers only allow sound after a real click/tap/key (gamepad presses don't count).
    const unlock = () => unlockAudio();
    const onTouch = () => setTouchUi(true);
    const onKey = (e: KeyboardEvent) => {
      unlock();
      const game = useGame.getState();
      if (e.code === 'Escape' && game.phase === 'play') {
        if (game.albumOpen) game.setAlbumOpen(false);
        else game.setMenuOpen(!game.menuOpen);
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
      game.start(ARROWS.has(code) ? 'kb2' : 'kb1', true);
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
    <div className="app-root relative h-full w-full overflow-hidden bg-sky-300">
      <Canvas
        className="game-canvas"
        frameloop="never"
        shadows="percentage"
        dpr={qualityDpr(quality, window.devicePixelRatio, window.innerWidth)}
        camera={{ position: [0, 44, 62], fov: 45, near: 0.5, far: 700 }}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          // "Auto" graphics: pick a level from the graphics card's name.
          const ctx = gl.getContext();
          const info = ctx.getExtension('WEBGL_debug_renderer_info');
          const renderer = String(ctx.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : ctx.RENDERER));
          useSettings.getState().setDetected(detectQuality(renderer, window.matchMedia('(pointer: coarse)').matches), renderer);
        }}
      >
        <Scene />
      </Canvas>

      {phase === 'title' && (
        <TitleScreen
          onPlay={() => {
            unlockAudio();
            start(touchUi ? 'touch' : 'kb1', true);
          }}
        />
      )}
      {/* (each on its own: one that breaks is left out, and a broken menu or album closes, so the
          game isn't left paused behind it; see faults.ts) */}
      {phase === 'play' && (
        <Safe name="split-screen frames">
          <SplitFrames />
        </Safe>
      )}
      {phase === 'play' && (
        <Safe name="HUD">
          <Hud onOpenMenu={() => setMenuOpen(true)} />
        </Safe>
      )}
      {phase === 'play' && touchUi && !menuOpen && !albumOpen && (
        <Safe name="touch controls">
          <TouchControls />
        </Safe>
      )}
      {menuOpen && (
        <Safe name="grown-ups menu" onFail={() => setMenuOpen(false)}>
          <GrownUpMenu />
        </Safe>
      )}
      {albumOpen && (
        <Safe name="sticker album" onFail={() => useGame.getState().setAlbumOpen(false)}>
          <StickerAlbum />
        </Safe>
      )}
    </div>
  );
}
