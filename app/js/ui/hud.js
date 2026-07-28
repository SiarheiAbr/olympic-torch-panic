// @ts-check
// REQ-RUN-011: distance (whole meters), integrity gauge, environment name,
// visible at all times while RUNNING. Also shows the stage banner (REQ-RUN-005).
// The torch-and-flame indicator mirrors the flame state thematically
// (REQ-FLM-008 feedback): size/brightness/hue track integrity, flicker grows
// as the flame weakens, and CRITICAL adds a pulsing warning halo.

import { ENVIRONMENTS, TOTAL_DISTANCE } from '../core/tuning.js';
import { FLAME_STATE } from '../core/state.js';

const GAUGE_CLASS_BY_FLAME_STATE = {
  [FLAME_STATE.STRONG]: 'gauge-strong',
  [FLAME_STATE.FLICKERING]: 'gauge-flickering',
  [FLAME_STATE.CRITICAL]: 'gauge-critical',
  [FLAME_STATE.EXTINGUISHED]: 'gauge-critical',
};

// Logical drawing size of the flame icon (CSS px; must match .hud-flame).
const FLAME_W = 38;
const FLAME_H = 46;

/**
 * @param {Object} els
 * @param {HTMLElement} els.distance
 * @param {HTMLElement} els.distanceRemaining
 * @param {HTMLElement} els.environment
 * @param {HTMLElement} els.gauge
 * @param {HTMLElement} els.gaugeFill
 * @param {HTMLCanvasElement} els.flame
 * @param {HTMLElement} els.banner
 */
export function createHud(els) {
  const dpr = window.devicePixelRatio || 1;
  els.flame.width = Math.round(FLAME_W * dpr);
  els.flame.height = Math.round(FLAME_H * dpr);
  const ctx2d = els.flame.getContext('2d');
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  let time = 0;

  function drawFlameIndicator(state, dt) {
    time += dt;
    ctx2d.clearRect(0, 0, FLAME_W, FLAME_H);

    const cx = FLAME_W / 2;

    if (state.flame.state === FLAME_STATE.EXTINGUISHED) {
      // A faint smoke wisp where the flame was.
      ctx2d.strokeStyle = 'rgba(200,200,200,0.6)';
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(cx, FLAME_H / 2 + 10);
      ctx2d.quadraticCurveTo(cx + 6, FLAME_H / 2 - 2, cx - 2, FLAME_H / 2 - 12);
      ctx2d.stroke();
      return;
    }

    const level = Math.max(0, Math.min(1, state.flame.integrity / 100));
    const critical = state.flame.state === FLAME_STATE.CRITICAL;

    // Weak flames flicker harder; CRITICAL shudders visibly (REQ-FLM-008).
    const flickerAmp = 0.06 + 0.14 * (1 - level) + (critical ? 0.1 : 0);
    const flicker =
      1 + flickerAmp * Math.sin(time * 13 + Math.sin(time * 7) * 2) * (0.7 + 0.3 * Math.random());

    // Size and hue track remaining energy: tall golden blaze -> small red ember.
    const flameH = (12 + 24 * level) * flicker;
    const hue = 10 + 38 * level; // red-ish 10 -> golden 48
    // The flame stays vertically centered on the bar's midline, so a small
    // ember still reads as attached to the pill rather than hanging below it.
    const baseY = FLAME_H / 2 + flameH / 2;
    const coreY = baseY - 2 - flameH * 0.45;

    if (critical) {
      // Pulsing warning halo, in step with the on-canvas red vignette. Radius
      // is capped inside the canvas so the falloff reaches zero before any
      // edge — otherwise the clip prints a hard red seam on the bar.
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      const haloR = Math.min(14 + 4 * pulse, FLAME_W / 2 - 1);
      const halo = ctx2d.createRadialGradient(cx, coreY, 2, cx, coreY, haloR);
      halo.addColorStop(0, `rgba(255,60,40,${(0.25 + 0.3 * pulse).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255,60,40,0)');
      ctx2d.fillStyle = halo;
      ctx2d.beginPath();
      ctx2d.arc(cx, coreY, haloR, 0, Math.PI * 2);
      ctx2d.fill();
    }

    // Subtle glow so the flame reads as alive against the dark bar; radius is
    // capped just inside the canvas so its falloff never clips into a square.
    const glowR = Math.min(flameH * 1.15, FLAME_W / 2 - 1);
    const glow = ctx2d.createRadialGradient(cx, coreY, 1, cx, coreY, glowR);
    glow.addColorStop(0, `hsla(${hue}, 100%, 60%, ${0.3 + 0.25 * level})`);
    glow.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    ctx2d.fillStyle = glow;
    ctx2d.beginPath();
    ctx2d.arc(cx, coreY, glowR, 0, Math.PI * 2);
    ctx2d.fill();

    // Emoji-style flame, colored by health: bright yellow/orange when full,
    // darker and redder as it drains, deep red near critical.
    ctx2d.fillStyle = `hsl(${hue}, 95%, ${34 + 24 * level}%)`;
    drawTeardrop(cx, baseY, flameH, flameH * 0.42);
    ctx2d.strokeStyle = `hsl(${Math.max(0, hue - 6)}, 90%, ${24 + 16 * level}%)`;
    ctx2d.lineWidth = 1.5;
    ctx2d.stroke();
    ctx2d.fillStyle = `hsl(${hue + 8}, 100%, ${52 + 26 * level}%)`;
    drawTeardrop(cx, baseY, flameH * 0.55, flameH * 0.24);
  }

  /** A flame-shaped teardrop standing on baseY: round belly, pinched tip.
   *  Fills the shape and leaves the path set for an optional rim stroke. */
  function drawTeardrop(cx, baseY, height, halfWidth) {
    ctx2d.beginPath();
    ctx2d.moveTo(cx, baseY - height);
    ctx2d.bezierCurveTo(
      cx + halfWidth * 0.9,
      baseY - height * 0.55,
      cx + halfWidth,
      baseY - height * 0.2,
      cx,
      baseY
    );
    ctx2d.bezierCurveTo(
      cx - halfWidth,
      baseY - height * 0.2,
      cx - halfWidth * 0.9,
      baseY - height * 0.55,
      cx,
      baseY - height
    );
    ctx2d.closePath();
    ctx2d.fill();
  }

  return {
    /**
     * @param {import('../core/state.js').GameState} state
     * @param {number} [dt]
     */
    update(state, dt = 0) {
      if (!state.run) return;
      // REQ-RUN-011: distance covered, plus how far remains to the finish line.
      // parseInt on the element text still reads `covered` first (see e2e smoke test).
      const covered = Math.floor(state.run.distance);
      const remaining = Math.max(0, TOTAL_DISTANCE - covered);
      els.distance.textContent = `${covered} m`;
      els.distanceRemaining.textContent = `${remaining} m remaining`;
      els.environment.textContent = ENVIRONMENTS[state.run.environmentIndex].name;
      els.gaugeFill.style.width = `${state.flame.integrity}%`;
      els.gauge.className = `hud-gauge ${GAUGE_CLASS_BY_FLAME_STATE[state.flame.state] || 'gauge-strong'}`;
      drawFlameIndicator(state, dt);
      if (state.banner) {
        els.banner.textContent = state.banner.name;
        els.banner.classList.remove('hidden');
      } else {
        els.banner.classList.add('hidden');
      }
    },
  };
}
