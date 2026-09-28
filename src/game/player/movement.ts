import { playBoing, playJump, playSlideWhistle, playSplash } from '../audio';
import { gameNow } from '../clock';
import { MOVE, PARTY_POINTS } from '../config';
import { emit, ring } from '../fx';
import { rumble } from '../input';
import { distXZ, isOnSnow } from '../layout';
import { players, playersCentroid } from '../runtime';
import { LEASH_RADIUS, settings, SPEED_FACTOR } from '../settings';
import { useGame } from '../store';
import { startFlip, type FrameCtx } from './frame';
import type { Flip } from './state';
import { lerpAngle } from './physics';
import { glide, jumpsOf, rainbowJump, TRICK, woolBounce } from './tricks';

/** Walking, sliding, swimming, jumping and bouncing; or, while flopped / held / riding, not. */
export function movement(f: FrameCtx) {
  const { s, rb, col, t, lv, tmp, input, slot, source, surface, dt } = f;
  const v = f.v;
  if (s.flopped || s.holdAt || f.riding) {
    if (s.grip) {
      s.grip = false;
      if (!s.flopped) col?.setFriction(0); // flopping sets its own friction
    }
    // riders float along with their friend (gravity would pull them through it)
    if (s.gravityOff !== f.riding) {
      s.gravityOff = f.riding;
      rb.setGravityScale(f.riding ? 0 : 1, true);
    }
    return;
  }

  const prefs = settings();
  let speed: number = MOVE.speed;
  if (s.swimming) speed = f.species === 'duck' ? TRICK.duckSwim : MOVE.swimSpeed;
  else if (s.inMud) speed = f.species === 'pig' ? TRICK.pigMud : MOVE.mudSpeed;
  speed *= SPEED_FACTOR[prefs.speed];
  if (f.heavyDrag) speed *= 0.72;
  if (s.power === 'giant') speed *= 1.2;
  else if (s.power === 'chili') speed *= 1.5;
  const grabbed = f.rt?.grabbedBy != null;
  const controlling = s.launched <= 0 && s.stunned <= 0 && !grabbed;
  const mag = Math.hypot(input.x, input.z);
  const pv = s.platformVel;
  if (controlling) {
    const accel = s.grounded || s.swimming ? (surface?.slippery ?? MOVE.groundAccel) : s.gliding ? TRICK.glideAccel : MOVE.airAccel;
    const k = 1 - Math.exp(-accel * dt);
    v.x += (input.x * speed + pv.x - v.x) * k;
    v.z += (input.z * speed + pv.z - v.z) * k;
    if (mag > 0.15 && s.bonkTime <= 0) s.targetFacing = Math.atan2(input.x, input.z);
  }
  // Stick to rides going up and down (but not in the frame a launch throws you off one: the
  // launch's upward speed would be replaced by the ride's, and you'd flop off the side).
  if (s.grounded && surface?.velocityAt && s.jumpBuffer <= 0 && s.launched <= 0) v.y = pv.y - 0.3;
  if (s.dashTime > 0) {
    v.x = tmp.fwd.x * MOVE.bonkDashSpeed + pv.x;
    v.z = tmp.fwd.z * MOVE.bonkDashSpeed + pv.z;
  }
  s.facing = lerpAngle(s.facing, s.targetFacing, 1 - Math.exp(-14 * dt));

  // Slides: a happy "wheee" when you start going fast.
  const sliding = s.grounded && !!surface?.slide && Math.hypot(lv.x, lv.z) > 3;
  if (sliding && !s.sliding) {
    playSlideWhistle('down', s.pos);
    useGame.getState().addParty(PARTY_POINTS.bounce);
  }
  s.sliding = sliding;
  if (sliding && Math.random() < 0.3) emit('star', [t.x, t.y - 0.3, t.z], { count: 1, color: ['#ffffff', '#fff3a8'], speed: 1, up: 1, size: 0.1 });

  // Snow crunches under your feet.
  if (s.grounded && (surface?.snow || isOnSnow(t.x, t.z)) && Math.hypot(lv.x, lv.z) > 2) {
    s.stepTimer -= dt;
    if (s.stepTimer <= 0) {
      s.stepTimer = 0.18;
      emit('puff', [t.x, s.groundY + 0.1, t.z], { count: 2, color: '#ffffff', speed: 1, up: 0.8, size: 0.18 });
    }
  }

  // Soft leash: nobody wanders off-screen in co-op.
  if (players.size > 1 && s.launched <= 0) {
    playersCentroid(tmp.c, slot);
    const d = distXZ(t.x, t.z, tmp.c.x, tmp.c.z);
    const leash = LEASH_RADIUS[prefs.together];
    if (d > leash) {
      const pull = Math.min(6, (d - leash) * 1.5);
      v.x += ((tmp.c.x - t.x) / d) * pull;
      v.z += ((tmp.c.z - t.z) / d) * pull;
    }
  }

  // Jump / double jump (with a flip!)
  if (input.pressed.jump) s.jumpBuffer = 0.14;
  if (s.grounded || s.swimming) {
    s.coyote = 0.1;
    s.jumps = 0;
  }

  // Bouncy things (trampolines, mushrooms, bouncy castle). Checked before jumping so
  // mashing jump on landing gives an even bigger bounce instead of a normal hop. The
  // collider's own restitution may already have bounced us a little: still boost.
  if (surface?.bounce && s.bounceCooldown <= 0 && lv.y < surface.bounce - 3 && f.groundDist < f.rad + 0.35) {
    v.y = surface.bounce + (input.held.jump || s.jumpBuffer > 0 ? 3.5 : 0);
    s.jumps = 1;
    s.jumpBuffer = 0;
    s.coyote = 0;
    s.bounceCooldown = 0.3;
    s.squash = 0.45;
    const axes: Flip['axis'][] = ['x', 'z', 'y'];
    startFlip(f, axes[Math.floor(Math.random() * axes.length)], 0.8, Math.random() < 0.5 ? 1 : -1);
    playBoing(s.pos, 0.9 + Math.random() * 0.4);
    ring([t.x, s.groundY + 0.05, t.z], { color: '#ffffff', radius: 2.2, duration: 0.4 });
    rumble(source, 0.3, 0.6, 120);
    surface.onBounce?.(slot);
    useGame.getState().addParty(PARTY_POINTS.bounce);
  }

  woolBounce(f);

  if (s.jumpBuffer > 0 && s.stunned <= 0) {
    if (s.coyote > 0) {
      v.y = (s.swimming ? 8 : MOVE.jumpVelocity * (s.power === 'giant' ? 1.3 : 1)) + Math.max(0, pv.y);
      s.jumps = 1;
      s.coyote = 0;
      s.jumpBuffer = 0;
      s.squash = -0.3;
      s.jumpedAt = gameNow();
      playJump(s.pos);
      if (s.swimming) {
        playSplash(s.pos, false);
        emit('drop', [t.x, s.groundY + 0.5, t.z], { count: 12, color: ['#7fd3ff', '#ffffff'], speed: 3, up: 5 });
      } else emit('puff', [t.x, s.groundY + 0.1, t.z], { count: 5, color: '#f5f0e6', speed: 2, up: 0.5, size: 0.25 });
    } else if (s.jumps === 2 && jumpsOf(f) > 2 && s.airTime > 0.05) {
      s.jumpBuffer = 0;
      s.jumpedAt = gameNow();
      rainbowJump(f);
    } else if (s.jumps < 2 && s.airTime > 0.05) {
      v.y = MOVE.doubleJumpVelocity * (s.power === 'giant' ? 1.3 : 1);
      s.jumps = 2;
      s.jumpBuffer = 0;
      s.jumpedAt = gameNow();
      startFlip(f, 'x', 0.5);
      playJump(s.pos, true);
      ring([t.x, t.y - 0.4, t.z], { color: '#ffffff', radius: 1.4, duration: 0.35 });
      emit('star', [t.x, t.y - 0.3, t.z], { count: 4, color: ['#ffffff', '#ffe14d'], speed: 2.5, up: -1 });
    }
  }

  glide(f, controlling);

  // Sticky feet: standing still on a slope (hill, roof, volcano) shouldn't creep downhill.
  // Static ground: switch gravity off. Moving things (see-saw, crates) need your weight,
  // so there you grip with friction instead.
  const still =
    s.grounded &&
    mag < 0.1 &&
    !surface?.slippery &&
    !surface?.velocityAt &&
    !surface?.bounce &&
    s.launched <= 0 &&
    s.jumpBuffer <= 0 &&
    !s.swimming &&
    s.dashTime <= 0 &&
    s.stunned <= 0 &&
    !grabbed &&
    v.y <= 1;
  const idle = still && f.onStatic;
  const grip = still && !f.onStatic;
  if (grip !== s.grip) {
    s.grip = grip;
    col?.setFriction(grip ? 2 : 0);
  }
  if (idle !== s.gravityOff) {
    s.gravityOff = idle;
    rb.setGravityScale(idle ? 0 : 1, true);
  }
  if (idle) {
    v.y = Math.min(0, v.y) * 0.5;
    v.x *= 0.6;
    v.z *= 0.6;
  }

  rb.setLinvel(v, true);
}
