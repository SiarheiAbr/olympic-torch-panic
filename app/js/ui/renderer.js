// @ts-check
// Canvas 2D renderer. Reads state, never mutates it (conventions.md boundary #3).
// All visuals are drawn primitives + emoji glyphs — no image assets (stack.md).
// Requirements served here: REQ-TOR-007 (torch facing unambiguous),
// REQ-HAZ-001 (telegraph shows direction + type), REQ-HAZ-004 (blocked vs
// exposed visuals differ), REQ-FLM-008 (flame states differ, critical pulse).

import { SHIELD_HALF_ARC } from '../core/tuning.js';
import { SESSION, HAZARD_STATE, PROFILE, FLAME_STATE } from '../core/state.js';

const ENV_THEMES = [
  { skyTop: '#7ec8e3', skyBottom: '#d9f2d9', ground: '#7a9e5f', accent: '#4c7031' }, // Countryside
  { skyTop: '#5a7d9a', skyBottom: '#9fb8c8', ground: '#8b8b7a', accent: '#3f5c73' }, // Storm Coast
  { skyTop: '#f5b971', skyBottom: '#fde3b6', ground: '#c98f4e', accent: '#a3652c' }, // Desert
  { skyTop: '#7fc9e8', skyBottom: '#ffe9c9', ground: '#e0c48f', accent: '#3e8fb0' }, // Venice Beach
  { skyTop: '#3f2b63', skyBottom: '#c96f4e', ground: '#54525e', accent: '#8464b8' }, // Downtown LA
];

const HAZARD_GLYPHS = {
  WIND_GUST: '💨',
  RAIN_SHOWER: '🌧️',
  DRONE_DOWNDRAFT: '🛸',
  BEACH_BALL: '🏐',
  FIREWORKS_BURST: '🎆',
};

const TORCH_RADIUS = 62; // px from runner pivot to flame tip
const SHIELD_RADIUS = 82;
const TELEGRAPH_RADIUS = 170;

/** Screen-space direction for a business angle (0=right, 90=up, 180=left). */
function dir(angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.cos(rad), y: -Math.sin(rad) };
}

/** @param {HTMLCanvasElement} canvas */
export function createRenderer(canvas) {
  const ctx2d = canvas.getContext('2d');
  let time = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /**
   * @param {import('../core/state.js').GameState} state
   * @param {number} dt
   */
  function render(state, dt) {
    time += dt;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;

    const envIndex = state.run ? state.run.environmentIndex : 0;
    const theme = ENV_THEMES[envIndex];
    const groundY = h * 0.82;
    const cx = w * 0.5;
    const cy = groundY - 46;

    drawBackdrop(w, h, groundY, theme, state);
    if (state.run && state.session !== SESSION.MAIN_MENU) {
      drawRunner(cx, cy, groundY, state);
      drawShieldArc(cx, cy, state.torch.angle);
      drawTorch(cx, cy, state);
      for (const hazard of state.hazards) drawHazard(cx, cy, hazard);
      if (state.flame.state === FLAME_STATE.CRITICAL) drawCriticalVignette(w, h);
    }
  }

  function drawBackdrop(w, h, groundY, theme, state) {
    const sky = ctx2d.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, theme.skyTop);
    sky.addColorStop(1, theme.skyBottom);
    ctx2d.fillStyle = sky;
    ctx2d.fillRect(0, 0, w, groundY);

    // Distant skyline hint, denser as the route nears LA.
    ctx2d.fillStyle = theme.accent;
    ctx2d.globalAlpha = 0.35;
    const envIndex = state.run ? state.run.environmentIndex : 0;
    const buildings = 3 + envIndex * 3;
    for (let i = 0; i < buildings; i++) {
      const bw = w / (buildings * 1.8);
      const bh = 30 + ((i * 37) % 60) + envIndex * 8;
      ctx2d.fillRect((i + 0.4) * (w / buildings), groundY - bh, bw, bh);
    }
    ctx2d.globalAlpha = 1;

    ctx2d.fillStyle = theme.ground;
    ctx2d.fillRect(0, groundY, w, h - groundY);

    // Road dashes scroll with distance to sell the automatic forward movement.
    const distance = state.run ? state.run.distance : 0;
    const spacing = 90;
    const offset = (distance * 30) % spacing;
    ctx2d.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = -offset; x < w; x += spacing) {
      ctx2d.fillRect(x, groundY + (h - groundY) * 0.45, 42, 5);
    }
  }

  function drawRunner(cx, cy, groundY, state) {
    const distance = state.run.distance;
    const phase = distance * 2.2;
    ctx2d.strokeStyle = '#2b2b2b';
    ctx2d.lineWidth = 4;
    ctx2d.lineCap = 'round';
    // legs
    const legSwing = Math.sin(phase) * 12;
    ctx2d.beginPath();
    ctx2d.moveTo(cx, cy + 18);
    ctx2d.lineTo(cx - 8 + legSwing, groundY);
    ctx2d.moveTo(cx, cy + 18);
    ctx2d.lineTo(cx + 8 - legSwing, groundY);
    // body
    ctx2d.moveTo(cx, cy - 10);
    ctx2d.lineTo(cx, cy + 18);
    ctx2d.stroke();
    // head
    ctx2d.fillStyle = '#f2c9a0';
    ctx2d.beginPath();
    ctx2d.arc(cx, cy - 20, 9, 0, Math.PI * 2);
    ctx2d.fill();
  }

  function drawShieldArc(cx, cy, torchAngle) {
    // Canvas angles are clockwise with y down; business angles are CCW with y up.
    const start = (-(torchAngle + SHIELD_HALF_ARC) * Math.PI) / 180;
    const end = (-(torchAngle - SHIELD_HALF_ARC) * Math.PI) / 180;
    ctx2d.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx2d.lineWidth = 5;
    ctx2d.beginPath();
    ctx2d.arc(cx, cy, SHIELD_RADIUS, start, end);
    ctx2d.stroke();
  }

  function drawTorch(cx, cy, state) {
    const d = dir(state.torch.angle);
    const tipX = cx + d.x * TORCH_RADIUS;
    const tipY = cy + d.y * TORCH_RADIUS;

    ctx2d.strokeStyle = '#8a5a2b';
    ctx2d.lineWidth = 6;
    ctx2d.lineCap = 'round';
    ctx2d.beginPath();
    ctx2d.moveTo(cx + d.x * 16, cy + d.y * 16);
    ctx2d.lineTo(tipX, tipY);
    ctx2d.stroke();

    // Flame size communicates flame state (REQ-FLM-008).
    const sizeByState = {
      [FLAME_STATE.STRONG]: 15,
      [FLAME_STATE.FLICKERING]: 10,
      [FLAME_STATE.CRITICAL]: 6,
      [FLAME_STATE.EXTINGUISHED]: 0,
    };
    const base = sizeByState[state.flame.state] ?? 15;
    if (base <= 0) return;
    const flicker = base * (0.85 + 0.3 * Math.abs(Math.sin(time * 13) * Math.random()));
    const glow = ctx2d.createRadialGradient(tipX, tipY, 1, tipX, tipY, flicker * 2);
    glow.addColorStop(0, 'rgba(255,240,150,0.95)');
    glow.addColorStop(0.5, 'rgba(255,140,0,0.8)');
    glow.addColorStop(1, 'rgba(255,80,0,0)');
    ctx2d.fillStyle = glow;
    ctx2d.beginPath();
    ctx2d.arc(tipX, tipY, flicker * 2, 0, Math.PI * 2);
    ctx2d.fill();
  }

  /** @param {import('../core/state.js').Hazard} hazard */
  function drawHazard(cx, cy, hazard) {
    const d = dir(hazard.approachAngle);
    if (hazard.state === HAZARD_STATE.TELEGRAPHED) {
      // REQ-HAZ-001: direction indicator + type glyph + time-left ring.
      const px = cx + d.x * TELEGRAPH_RADIUS;
      const py = cy + d.y * TELEGRAPH_RADIUS;
      const progress = 1 - hazard.telegraphRemaining / hazard.telegraphTotal;
      const pulse = 1 + 0.12 * Math.sin(time * 10);

      ctx2d.strokeStyle = 'rgba(255,60,60,0.9)';
      ctx2d.lineWidth = 3;
      ctx2d.beginPath();
      ctx2d.arc(px, py, 24 * pulse, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx2d.stroke();

      ctx2d.font = '26px serif';
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(HAZARD_GLYPHS[hazard.type] || '⚠️', px, py);

      // arrow toward the runner
      const ax = cx + d.x * (TELEGRAPH_RADIUS - 42);
      const ay = cy + d.y * (TELEGRAPH_RADIUS - 42);
      ctx2d.fillStyle = 'rgba(255,60,60,0.9)';
      ctx2d.beginPath();
      ctx2d.moveTo(ax, ay);
      ctx2d.lineTo(ax + d.x * -14 - d.y * 8, ay + d.y * -14 + d.x * 8);
      ctx2d.lineTo(ax + d.x * -14 + d.y * 8, ay + d.y * -14 - d.x * 8);
      ctx2d.closePath();
      ctx2d.fill();
      return;
    }

    if (hazard.state !== HAZARD_STATE.ACTIVE && !hazard.blockedImpactFx) return;

    // REQ-HAZ-004: exposed threats reach the runner in red; blocked ones stop
    // at the shield with a deflection burst.
    const stopRadius = hazard.blocked ? SHIELD_RADIUS : 22;
    if (hazard.profile === PROFILE.CONTINUOUS) {
      ctx2d.strokeStyle = hazard.blocked ? 'rgba(180,220,255,0.8)' : 'rgba(255,70,40,0.85)';
      ctx2d.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        const jitter = Math.sin(time * 22 + i * 2.1) * 6;
        const ox = -d.y * (i * 12 + jitter * 0.3);
        const oy = d.x * (i * 12 + jitter * 0.3);
        ctx2d.beginPath();
        ctx2d.moveTo(
          cx + d.x * (TELEGRAPH_RADIUS - 10) + ox,
          cy + d.y * (TELEGRAPH_RADIUS - 10) + oy
        );
        ctx2d.lineTo(cx + d.x * stopRadius + ox, cy + d.y * stopRadius + oy);
        ctx2d.stroke();
      }
      ctx2d.font = '26px serif';
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(
        HAZARD_GLYPHS[hazard.type],
        cx + d.x * (TELEGRAPH_RADIUS - 4),
        cy + d.y * (TELEGRAPH_RADIUS - 4)
      );
    } else {
      // Impact hazards: a burst at the point where they landed this frame.
      const px = cx + d.x * stopRadius;
      const py = cy + d.y * stopRadius;
      ctx2d.font = '26px serif';
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(HAZARD_GLYPHS[hazard.type], px + d.x * 18, py + d.y * 18);
      ctx2d.fillStyle = hazard.blocked ? 'rgba(180,220,255,0.9)' : 'rgba(255,90,30,0.9)';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + time * 4;
        ctx2d.beginPath();
        ctx2d.arc(px + Math.cos(a) * 12, py + Math.sin(a) * 12, 3, 0, Math.PI * 2);
        ctx2d.fill();
      }
    }

    if (hazard.blockedImpactFx) {
      // bounce flash at the shield edge
      const bx = cx + d.x * SHIELD_RADIUS;
      const by = cy + d.y * SHIELD_RADIUS;
      ctx2d.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx2d.lineWidth = 3;
      ctx2d.beginPath();
      ctx2d.arc(bx, by, 16, 0, Math.PI * 2);
      ctx2d.stroke();
    }
  }

  function drawCriticalVignette(w, h) {
    // Unmissable warning pulse while CRITICAL (REQ-FLM-008).
    const alpha = 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(time * 6));
    ctx2d.fillStyle = `rgba(255,0,0,${alpha.toFixed(3)})`;
    ctx2d.fillRect(0, 0, w, h);
  }

  resize();
  return { render, resize };
}
