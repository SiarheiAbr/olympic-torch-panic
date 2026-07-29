// @ts-check
// Raw DOM events -> normalized input queue + session commands.
// Mouse controls by absolute position (REQ-TOR-001); touch by relative drag
// (REQ-TOR-004); A/D as held keys (REQ-TOR-002/003). Interruption events
// trigger the auto-pause commands (REQ-ERR-001/002).

/**
 * @param {Object} opts
 * @param {import('../core/state.js').GameState} opts.state
 * @param {HTMLElement} opts.playArea
 * @param {{togglePause: () => void, interrupt: () => void, relayout: () => void}} opts.commands
 */
export function createInput({ state, playArea, commands }) {
  /** @type {?number} */
  let dragPointerId = null;
  let dragLastX = 0;

  playArea.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    dragPointerId = e.pointerId;
    dragLastX = e.clientX;
    try {
      playArea.setPointerCapture(e.pointerId);
    } catch {
      // capture is a nicety; dragging still works without it
    }
  });

  playArea.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') {
      const rect = playArea.getBoundingClientRect();
      if (rect.width <= 0) return;
      const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      state.input.queue.push({ kind: 'pointerFraction', fraction });
    } else if (e.pointerId === dragPointerId) {
      // Only the primary drag pointer moves the torch; extra touches are ignored.
      const dx = e.clientX - dragLastX;
      dragLastX = e.clientX;
      if (dx !== 0 && window.innerWidth > 0) {
        state.input.queue.push({ kind: 'dragDelta', dxFraction: dx / window.innerWidth });
      }
    }
  });

  const endDrag = (e) => {
    // REQ-ERR-004: touch end -> torch holds its angle (we simply stop emitting).
    if (e.pointerId === dragPointerId) dragPointerId = null;
  };
  playArea.addEventListener('pointerup', endDrag);
  playArea.addEventListener('pointercancel', endDrag);

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyA') state.input.keys.a = true;
    else if (e.code === 'KeyD') state.input.keys.d = true;
    else if (e.code === 'Escape' || e.code === 'KeyP') commands.togglePause();
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'KeyA') state.input.keys.a = false;
    else if (e.code === 'KeyD') state.input.keys.d = false;
  });

  // REQ-ERR-001: page hidden or focus lost -> pause in the same frame.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) commands.interrupt();
  });
  window.addEventListener('blur', () => commands.interrupt());

  // REQ-ERR-002: resize / orientation change -> pause and re-layout.
  window.addEventListener('resize', () => {
    commands.interrupt();
    commands.relayout();
  });
  window.addEventListener('orientationchange', () => {
    commands.interrupt();
    commands.relayout();
  });
}
