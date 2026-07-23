// @ts-check
// Bootstrap: build state and context, wire UI, start the loop.
// This file is the composition root — the only place where browser facilities
// (localStorage, URL params, the real clock, unseeded randomness) are touched
// and injected into the deterministic core.

import { createInitialState, SESSION, OUTCOME, FLAME_STATE } from './core/state.js';
import { createRng } from './core/rng.js';
import { createLoop } from './core/loop.js';
import * as runLifecycle from './systems/runLifecycle.js';
import * as scoring from './systems/scoring.js';
import { createSaveStore } from './storage/saveStore.js';
import { createInput } from './ui/input.js';
import { createRenderer } from './ui/renderer.js';
import { createHud } from './ui/hud.js';
import { createScreens } from './ui/screens.js';
import { createAudio } from './ui/audio.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) ? seedParam >>> 0 : (Math.random() * 2 ** 32) >>> 0;
const debug = params.get('debug') === '1';

const state = createInitialState();
const audio = createAudio();
const ctx = { rng: createRng(seed), audio, now: () => new Date().toISOString() };

/** localStorage may throw on access in locked-down browsers — treat as absent. */
function detectStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
const store = createSaveStore(detectStorage());
const saveDoc = store.load();
let storageNoticeShown = false;

function persist() {
  const ok = store.save(saveDoc);
  if (!ok && !storageNoticeShown) {
    storageNoticeShown = true;
    screens.showNotice(
      'Records can’t be saved on this device — scores last only for this session.'
    );
  }
}

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const renderer = createRenderer(canvas);
const hud = createHud({
  distance: $('hud-distance'),
  environment: $('hud-environment'),
  gauge: $('hud-gauge'),
  gaugeFill: $('hud-gauge-fill'),
  banner: $('hud-banner'),
});
const screens = createScreens({
  els: {
    menu: $('screen-menu'),
    menuBest: $('menu-best'),
    hud: $('hud'),
    pauseOverlay: $('overlay-pause'),
    countdownOverlay: $('overlay-countdown'),
    countdownNumber: $('countdown-number'),
    endOverlay: $('overlay-end'),
    results: $('screen-results'),
    resultDistance: $('result-distance'),
    resultTime: $('result-time'),
    resultBadge: $('result-badge'),
    resultRecord: $('result-record'),
    resultMessage: $('result-message'),
    initialsForm: $('initials-form'),
    resultsBoardBody: $('results-board-body'),
    resultsBoardEmpty: $('results-board-empty'),
    leaderboardScreen: $('screen-leaderboard'),
    leaderboardBody: $('leaderboard-body'),
    leaderboardRecord: $('leaderboard-record'),
    leaderboardEmpty: $('leaderboard-empty'),
    notice: $('toast-notice'),
  },
  getSaveDoc: () => saveDoc,
});

/** @type {?{result: import('./systems/scoring.js').RunResult, finalized: boolean}} */
let pendingResult = null;

function startRun() {
  audio.unlock();
  audio.stopCritical();
  pendingResult = null;
  runLifecycle.startRun(state);
  screens.toGame();
}

/** REQ-SCO-003: a qualifying entry not explicitly saved still records as "YOU". */
function finalizePending(rawInitials) {
  if (!pendingResult || pendingResult.finalized) return null;
  pendingResult.finalized = true;
  if (!pendingResult.result.qualifies) return null;
  const rank = scoring.finalizeEntry(saveDoc, pendingResult.result.entry, rawInitials);
  persist();
  return rank;
}

const commands = {
  togglePause() {
    if (state.session === SESSION.RUNNING) runLifecycle.pause(state);
    else if (state.session === SESSION.PAUSED && state.resumeCountdown === null)
      runLifecycle.beginResume(state);
  },
  interrupt() {
    runLifecycle.pause(state);
  },
  relayout() {
    renderer.resize();
  },
};

createInput({ state, playArea: canvas, commands });

// --- menu / overlay buttons -------------------------------------------------
$('btn-start').addEventListener('click', startRun);
$('btn-menu-leaderboard').addEventListener('click', () => screens.showLeaderboard());
$('btn-leaderboard-back').addEventListener('click', () => screens.hideLeaderboard());
$('btn-resume').addEventListener('click', () => runLifecycle.beginResume(state));
$('btn-quit').addEventListener('click', () => {
  runLifecycle.quitToMenu(state); // REQ-RUN-010: no ScoreEntry
  audio.stopCritical();
  screens.toMenu();
});
$('btn-retry').addEventListener('click', () => {
  finalizePending(/** @type {HTMLInputElement} */ ($('initials-input')).value);
  startRun(); // REQ-SCO-009: straight into a new run
});
$('btn-results-menu').addEventListener('click', () => {
  finalizePending(/** @type {HTMLInputElement} */ ($('initials-input')).value);
  screens.toMenu();
});
$('initials-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const rank = finalizePending(/** @type {HTMLInputElement} */ ($('initials-input')).value);
  screens.refreshResults(rank);
});

// --- run end ------------------------------------------------------------------
function onRunEnded(endedState) {
  const run = endedState.run;
  const victory = run.outcome === OUTCOME.REACHED_LA;
  audio.stopCritical();
  if (victory) audio.victory();
  else audio.extinguish();

  const result = scoring.recordRun(run, saveDoc, ctx.now);
  pendingResult = { result, finalized: false };
  persist(); // REQ-SCO-006: longestSurvival may have changed

  screens.showEndPresentation(victory, () => {
    /** @type {HTMLInputElement} */ ($('initials-input')).value = '';
    screens.showResults(result, { qualifies: result.qualifies, rank: null });
  });
}

// --- per-frame presentation --------------------------------------------------
let prevFlameState = state.flame.state;
let prevIntegrity = state.flame.integrity;
const debugEl = $('debug-overlay');
if (debug) debugEl.classList.remove('hidden');
let fps = 0;

function render(s, dt) {
  renderer.render(s, dt);
  if (s.session !== SESSION.MAIN_MENU) hud.update(s);
  const countdownTick = screens.update(s);
  if (countdownTick !== null) audio.countdownTick();

  // audio driven by state transitions, never by mutating state
  if (s.session === SESSION.RUNNING) {
    if (s.flame.state === FLAME_STATE.CRITICAL && prevFlameState !== FLAME_STATE.CRITICAL)
      audio.startCritical();
    if (s.flame.state !== FLAME_STATE.CRITICAL && prevFlameState === FLAME_STATE.CRITICAL)
      audio.stopCritical();
    if (prevIntegrity - s.flame.integrity >= 5) audio.damage();
    if (s.hazards.some((h) => h.blockedImpactFx)) audio.bounce();
  }
  prevFlameState = s.flame.state;
  prevIntegrity = s.flame.integrity;

  if (debug) {
    fps = dt > 0 ? fps * 0.9 + (1 / dt) * 0.1 : fps;
    debugEl.textContent =
      `fps ${fps.toFixed(0)} | ${s.session} | seed ${seed}\n` +
      `torch ${s.torch.angle.toFixed(1)}° | integrity ${s.flame.integrity.toFixed(1)} (${s.flame.state})\n` +
      (s.run
        ? `dist ${s.run.distance.toFixed(1)} m | t ${s.run.elapsedTime.toFixed(1)} s | env ${s.run.environmentIndex + 1}\n`
        : '') +
      s.hazards
        .map((h) => `${h.type}@${h.approachAngle}° ${h.state}${h.blocked ? ' [blocked]' : ''}`)
        .join('\n');
  }
}

const loop = createLoop({ state, ctx, render, onRunEnded });

if (!store.isAvailable()) {
  storageNoticeShown = true;
  screens.showNotice('Records can’t be saved on this device — scores last only for this session.');
}
screens.toMenu();
loop.start();
