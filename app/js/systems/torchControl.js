// @ts-check
// Capability 04 — Torch Control & Shielding
// (specification/business/04-torch-control/spec.md)
//
// Consumes the normalized input queue filled by ui/input.js. Queue events:
//   { kind: 'pointerFraction', fraction } - pointer x across the play area, 0=left..1=right
//   { kind: 'dragDelta', dxFraction }     - horizontal drag as a fraction of viewport width
// Held keys arrive as state.input.keys and are integrated over dt.

import { KEY_ROTATION_SPEED } from '../core/tuning.js';
import { clampAngle } from '../core/angles.js';

/**
 * Applies this frame's input to the torch angle. Called only while RUNNING
 * (REQ-TOR-006 — the loop discards queued input in any other session state).
 * Events apply in arrival order, so the most recent input wins (REQ-TOR-005).
 * @param {import('../core/state.js').GameState} state
 * @param {number} dt
 */
export function update(state, dt) {
  for (const ev of state.input.queue) {
    if (ev.kind === 'pointerFraction') {
      // REQ-TOR-001: right edge -> 0 deg, center -> 90, left edge -> 180.
      state.torch.angle = clampAngle((1 - ev.fraction) * 180);
    } else if (ev.kind === 'dragDelta') {
      // REQ-TOR-004: full-viewport-width drag = 180 deg; dragging right -> toward 0.
      state.torch.angle = clampAngle(state.torch.angle - ev.dxFraction * 180);
    }
  }
  state.input.queue.length = 0;

  const { a, d } = state.input.keys;
  if (a && !d) {
    // REQ-TOR-002: A rotates toward 180 (backward).
    state.torch.angle = clampAngle(state.torch.angle + KEY_ROTATION_SPEED * dt);
  } else if (d && !a) {
    state.torch.angle = clampAngle(state.torch.angle - KEY_ROTATION_SPEED * dt);
  }
  // REQ-TOR-003: both keys held -> no rotation.
}
