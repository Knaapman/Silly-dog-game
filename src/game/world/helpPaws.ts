import * as THREE from 'three';
import { groundHeight } from '../terrain';
import { hintLayer } from '../views';
import { pawGeometry } from './PaintBuckets';

// Help without words, on the ground: a few white paw prints ("run this way", "stand here"). They
// appear one after another when wanted and fade away when not, and only the views of the
// children they're meant for draw them (see Hints).

let geometry: THREE.BufferGeometry | null = null;

export class HelpPaws {
  readonly group = new THREE.Group();
  /** How far shown, 0..1 (for the tests too). */
  shown = 0;
  private readonly material = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  private readonly paws: THREE.Mesh[];
  private appear = 0;

  constructor(
    count: number,
    private readonly size = 1.8,
    /** Drawn over whatever is in the way (like the hint bubbles), for prints the camera can't see. */
    onTop = false,
    /** How solid the prints get (0..1). */
    private readonly opacity = 0.6
  ) {
    if (onTop) {
      this.material.depthTest = false;
      this.material.polygonOffset = false;
    }
    geometry ??= pawGeometry();
    this.paws = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geometry!, this.material);
      m.scale.setScalar(size);
      if (onTop) m.renderOrder = 9;
      this.group.add(m);
      return m;
    });
    this.group.visible = false;
  }

  /** Put the prints down: each at (x, z), walking towards `angle` (as animals face: atan2(x, z)). */
  place(spots: { x: number; z: number; angle: number }[]) {
    spots.forEach((s, i) => {
      const m = this.paws[i];
      if (!m) return;
      m.position.set(s.x, groundHeight(s.x, s.z) + 0.03, s.z);
      // (the toes point along the paw's -z)
      m.rotation.set(0, s.angle + Math.PI, 0);
    });
  }

  /** Which layers (children's views) draw the prints: for the tests. */
  get mask() {
    return this.paws[0]?.layers.mask ?? 0;
  }

  /** Each frame: fade in (one print after another) while `want`, out when not; drawn for `slots` only. */
  update(want: boolean, dt: number, slots: number[]) {
    if (want && this.shown === 0) this.appear = 0;
    this.shown = THREE.MathUtils.clamp(this.shown + (want ? dt * 2.5 : -dt * 3), 0, 1);
    this.appear += dt;
    this.group.visible = this.shown > 0 && slots.length > 0;
    if (!this.group.visible) return;
    this.material.opacity = this.opacity * this.shown;
    this.paws.forEach((m, i) => {
      if (want) m.scale.setScalar(this.size * THREE.MathUtils.clamp((this.appear - i * 0.18) / 0.25, 0, 1));
      m.layers.mask = 0;
      for (const slot of slots) m.layers.enable(hintLayer(slot));
    });
  }
}

/**
 * Who has learned something, so that help stops for them. A child is a player slot *and* the
 * controller they play with: a different child who later gets the same slot (someone left, or a
 * friend took the buddy's place) is new and gets the help again. The buddy never learns.
 */
export class Learned {
  private readonly who = new Map<number, string>();
  add(p: { slot: number; source: string; bot?: boolean }) {
    if (!p.bot) this.who.set(p.slot, p.source);
  }
  has(p: { slot: number; source: string }) {
    return this.who.get(p.slot) === p.source;
  }
  /** For the tests: the slots that have learned. */
  get slots() {
    return [...this.who.keys()];
  }
}
