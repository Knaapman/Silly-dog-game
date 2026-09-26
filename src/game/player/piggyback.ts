import { playBoing, playCheer, playJump } from '../audio';
import { MOVE, PARTY_POINTS } from '../config';
import { burstConfetti, emit } from '../fx';
import { rumble } from '../input';
import { distXZ } from '../layout';
import { players, type PlayerRuntime } from '../runtime';
import { useGame } from '../store';
import { RADIUS } from './constants';
import { startFlip, type FrameCtx } from './frame';
import { lerpAngle } from './physics';

function setRiding(f: FrameCtx, on: number | null) {
  f.s.ridingOn = on;
  if (f.rt) f.rt.ridingOn = on;
  // a rider is a ghost for the physics, or it would squash its friend into the ground
  f.col?.setSensor(on != null);
}

/** Piggyback: land on a friend's back and ride along. Towers welcome. Sets f.riding. */
export function piggyback(f: FrameCtx) {
  const { s, rb, t, lv, tmp, input, slot, source, dt } = f;
  if (s.ridingOn == null && s.rideCooldown <= 0 && !s.flopped && !s.holdAt && s.launched <= 0 && !s.swimming && lv.y < 1 && f.rt?.grabbedBy == null) {
    let best: PlayerRuntime | null = null;
    players.forEach((c) => {
      if (c.slot === slot || c.flopped || c.isLaunched()) return;
      let taken = false;
      players.forEach((o) => {
        if (o.ridingOn === c.slot) taken = true;
      });
      if (taken) return; // one rider per back: land on the top of the tower instead
      for (let k: number | null = c.ridingOn, n = 0; k != null && n < 6; n += 1) {
        if (k === slot) return; // no riding someone who's riding you
        k = players.get(k)?.ridingOn ?? null;
      }
      const dy = s.pos.y - c.position.y;
      // riders are ghosts, so a falling friend can sink into one: that still counts as landing on it
      if (dy < (c.ridingOn != null ? -0.3 : 0.55) * c.size || dy > 1.7 * c.size) return;
      if (distXZ(s.pos.x, s.pos.z, c.position.x, c.position.z) > 0.6 * c.size) return;
      if (!best || c.position.y > best.position.y) best = c;
    });
    const carrier = best as PlayerRuntime | null;
    if (carrier) {
      setRiding(f, carrier.slot);
      s.squash = 0.4;
      playBoing(s.pos, 1.3);
      emit('heart', [t.x, t.y + 0.6, t.z], { count: 6, color: ['#ff4d8d', '#ff8fb5'], speed: 1.5, up: 2 });
      rumble(source, 0.3, 0.3, 120);
      useGame.getState().addParty(PARTY_POINTS.duet);
      let height = 2;
      for (let k: number | null = carrier.ridingOn; k != null && height < 6; k = players.get(k)?.ridingOn ?? null) height += 1;
      if (height >= 3) {
        // a tower of three (or four)!
        burstConfetti([t.x, t.y + 1.5, t.z], 50, 6);
        playCheer();
        useGame.getState().addParty(PARTY_POINTS.star);
      }
    }
  }
  if (s.ridingOn != null) {
    const c = players.get(s.ridingOn);
    const thrown = !c || c.flopped || c.isLaunched();
    const hopOff = input.pressed.jump && !thrown;
    if (c) tmp.c.set(c.position.x, c.position.y + 0.45 * c.size + RADIUS * s.size, c.position.z);
    // (a bean rocket blasts you off the top of the tower, keeping its speed)
    const licked = f.rt?.grabbedBy != null;
    if (thrown || hopOff || licked || f.rocketed || s.flopped || s.holdAt || s.pendingLaunch || s.stunned > 0 || tmp.c.distanceTo(s.pos) > 3) {
      setRiding(f, null);
      s.rideCooldown = 0.6;
      if (hopOff) {
        f.v.y = MOVE.jumpVelocity;
        f.v.x = input.x * 4 + (c?.velocity.x ?? 0);
        f.v.z = input.z * 4 + (c?.velocity.z ?? 0);
        startFlip(f, 'x', 0.5);
        playJump(s.pos);
      } else if (thrown) {
        // the carrier flopped (or got launched): everybody off!
        const a = Math.random() * Math.PI * 2;
        f.v.x = Math.cos(a) * 5;
        f.v.z = Math.sin(a) * 5;
        f.v.y = 8;
        startFlip(f, 'z', 0.7, Math.random() < 0.5 ? 1 : -1);
        playBoing(s.pos, 0.9);
      }
      s.jumpBuffer = 0;
      rb.setLinvel(f.v, true);
    } else if (c) {
      rb.setTranslation(tmp.c, true);
      rb.setLinvel({ x: c.velocity.x, y: c.velocity.y, z: c.velocity.z }, true);
      f.v.x = c.velocity.x;
      f.v.y = c.velocity.y;
      f.v.z = c.velocity.z;
      s.grounded = true;
      s.airTime = 0;
      s.jumps = 0;
      s.coyote = 0;
      // the rider steers where it looks (for headbutts and licks), not where it goes
      if (Math.hypot(input.x, input.z) > 0.15) s.targetFacing = Math.atan2(input.x, input.z);
      else s.targetFacing = c.facing;
      s.facing = lerpAngle(s.facing, s.targetFacing, 1 - Math.exp(-10 * dt));
    }
  }
  f.riding = s.ridingOn != null;
}
