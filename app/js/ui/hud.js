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

// Logical drawing size of the indicator; on screen it is upscaled by
// FLAME_SCALE (CSS .hud-flame must equal logical size x scale).
const FLAME_W = 46;
const FLAME_H = 64;
const FLAME_SCALE = 1.25;

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
  const px = (window.devicePixelRatio || 1) * FLAME_SCALE;
  els.flame.width = Math.round(FLAME_W * px);
  els.flame.height = Math.round(FLAME_H * px);
  const ctx2d = els.flame.getContext('2d');
  ctx2d.setTransform(px, 0, 0, px, 0, 0);
  let time = 0;

  function drawFlameIndicator(state, dt) {
    time += dt;
    ctx2d.clearRect(0, 0, FLAME_W, FLAME_H);

    const cx = FLAME_W / 2;
    const cupY = 38;

    // Torch body: tapered handle + gold band, matching the in-game torch hues.
    ctx2d.strokeStyle = '#8a5a2b';
    ctx2d.lineCap = 'round';
    ctx2d.lineWidth = 8;
    ctx2d.beginPath();
    ctx2d.moveTo(cx, cupY + 2);
    ctx2d.lineTo(cx, FLAME_H - 5);
    ctx2d.stroke();
    ctx2d.fillStyle = '#d9a441';
    ctx2d.beginPath();
    ctx2d.roundRect(cx - 9, cupY - 4, 18, 8, 3);
    ctx2d.fill();

    if (state.flame.state === FLAME_STATE.EXTINGUISHED) {
      // A faint smoke wisp where the flame was.
      ctx2d.strokeStyle = 'rgba(200,200,200,0.5)';
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(cx, cupY - 8);
      ctx2d.quadraticCurveTo(cx + 5, cupY - 16, cx - 2, cupY - 22);
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
    const flameH = (9 + 21 * level) * flicker;
    const hue = 10 + 38 * level; // red-ish 10 -> golden 48
    const coreY = cupY - 7 - flameH * 0.45;

    if (critical) {
      // Pulsing warning halo, in step with the on-canvas red vignette.
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      const halo = ctx2d.createRadialGradient(cx, coreY, 2, cx, coreY, 20 + 5 * pulse);
      halo.addColorStop(0, `rgba(255,60,40,${(0.25 + 0.3 * pulse).toFixed(3)})`);
      halo.addColorStop(1, 'rgba(255,60,40,0)');
      ctx2d.fillStyle = halo;
      ctx2d.fillRect(0, 0, FLAME_W, FLAME_H);
    }

    // Layered teardrop flame: outer glow, body, hot core. The glow radius is
    // capped just inside the canvas so its falloff never clips into a square.
    const glowR = Math.min(flameH * 1.15, FLAME_W / 2 - 1);
    const glow = ctx2d.createRadialGradient(cx, coreY, 1, cx, coreY, glowR);
    glow.addColorStop(0, `hsla(${hue}, 100%, 62%, ${0.5 + 0.35 * level})`);
    glow.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`);
    ctx2d.fillStyle = glow;
    ctx2d.beginPath();
    ctx2d.arc(cx, coreY, glowR, 0, Math.PI * 2);
    ctx2d.fill();

    ctx2d.fillStyle = `hsl(${hue}, 95%, ${44 + 14 * level}%)`;
    drawTeardrop(cx, cupY - 5, flameH, flameH * 0.42);
    ctx2d.fillStyle = `hsl(${hue + 8}, 100%, ${70 + 8 * level}%)`;
    drawTeardrop(cx, cupY - 5, flameH * 0.55, flameH * 0.24);
  }

  /** A flame-shaped teardrop standing on baseY: round belly, pinched tip. */
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
