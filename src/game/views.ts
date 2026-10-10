import * as THREE from 'three';
import { perf } from './perf';
import { create } from 'zustand';
import { camera as camState } from './runtime';

// Split screen. Together, everybody shares one camera that frames them all. When children wander
// so far apart that it would have to zoom right out, the screen splits: a view each, following
// their own animal (two side by side; three: two on top and one along the bottom; four: a 2×2
// grid). When they come back together it joins up again. The buddy never gets a view of its own.

/** A part of the screen, as fractions of it, measured from the top left. */
export type Rect = { x: number; y: number; w: number; h: number };

export function layoutRects(n: number): Rect[] {
  if (n <= 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (n === 2) return [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }];
  if (n === 3) return [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }];
  return [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }];
}

/**
 * When to split and when to join up again, by how far back the shared camera would have to be
 * (before the zoom setting). Further apart than this the animals get too small to see on a TV.
 * The gap between the two keeps it from flicking back and forth at the edge.
 */
export const SPLIT_AT = 30;
export const JOIN_AT = 23;

export type View = { slot: number; cam: THREE.PerspectiveCamera; focus: THREE.Vector3; look: THREE.Vector3; rect: Rect };

/**
 * Help meant for one child (see Hints) is drawn on that child's own layer: the shared camera sees
 * every child's, and in split screen each view sees only its own child's.
 */
export const HINT_LAYER = 20;
export const hintLayer = (slot: number) => HINT_LAYER + slot;
/** A view following `slot`: the world, and that child's help only. */
export function seeOwnHelp(cam: THREE.Camera, slot: number) {
  cam.layers.set(0);
  cam.layers.enable(hintLayer(slot));
}
/** The shared camera: the world, and every child's help. */
export function seeAllHelp(cam: THREE.Camera) {
  for (let slot = 0; slot < 4; slot += 1) cam.layers.enable(hintLayer(slot));
}

/** The views as the camera rig last set them up (empty when the screen isn't split), and the shared camera as last drawn. */
export const views = { split: false, list: [] as View[], shared: null as THREE.Camera | null };

/** For the overlay (frames and dividers): which players have a view, in screen order. */
export const useViews = create<{ split: boolean; slots: number[] }>(() => ({ split: false, slots: [] }));

/** The sun, so each view can have shadows around its own animal. */
export const lightRig = { sun: null as THREE.DirectionalLight | null };

/** Where the cameras are looking: every view's animal, or the one shared focus. */
export function cameraFoci(): THREE.Vector3[] {
  return views.split && views.list.length ? views.list.map((v) => v.focus) : [camState.focus];
}

/** Is (x, z) within `range` of anywhere a camera is looking? (for effects that only run near the camera) */
export function nearAnyCamera(x: number, z: number, range: number) {
  return cameraFoci().some((f) => Math.hypot(f.x - x, f.z - z) < range);
}

const size = new THREE.Vector2();

function aimSun(focus: THREE.Vector3) {
  const sun = lightRig.sun;
  if (!sun) return;
  sun.position.set(focus.x + 14, focus.y + 28, focus.z + 12);
  sun.target.position.copy(focus);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
}

/** Draw the frame: the one shared view, or each player's view in its part of the screen. */
export function renderViews(gl: THREE.WebGLRenderer, scene: THREE.Scene, shared: THREE.Camera) {
  // (count the whole frame's draw calls, however many views it takes: see perf.ts)
  gl.info.autoReset = false;
  gl.info.reset();
  views.shared = shared;
  drawViews(gl, scene, shared);
  perf.calls = gl.info.render.calls;
  perf.triangles = gl.info.render.triangles;
}

function drawViews(gl: THREE.WebGLRenderer, scene: THREE.Scene, shared: THREE.Camera) {
  if (!views.split || views.list.length < 2) {
    gl.render(scene, shared);
    return;
  }
  gl.getSize(size);
  gl.setScissorTest(true);
  for (const v of views.list) {
    const x = Math.round(v.rect.x * size.x);
    const w = Math.round((v.rect.x + v.rect.w) * size.x) - x;
    const top = Math.round(v.rect.y * size.y);
    const h = Math.round((v.rect.y + v.rect.h) * size.y) - top;
    const y = size.y - top - h;
    gl.setViewport(x, y, w, h);
    gl.setScissor(x, y, w, h);
    const aspect = w / Math.max(1, h);
    if (Math.abs(v.cam.aspect - aspect) > 1e-4) {
      v.cam.aspect = aspect;
      v.cam.updateProjectionMatrix();
    }
    aimSun(v.focus);
    gl.render(scene, v.cam);
  }
  gl.setScissorTest(false);
  gl.setViewport(0, 0, size.x, size.y);
  aimSun(camState.focus);
}
