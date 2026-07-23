// @ts-check
// REQ-RUN-011: distance (whole meters), integrity gauge, environment name,
// visible at all times while RUNNING. Also shows the stage banner (REQ-RUN-005).

import { ENVIRONMENTS } from '../core/tuning.js';
import { FLAME_STATE } from '../core/state.js';

const GAUGE_CLASS_BY_FLAME_STATE = {
  [FLAME_STATE.STRONG]: 'gauge-strong',
  [FLAME_STATE.FLICKERING]: 'gauge-flickering',
  [FLAME_STATE.CRITICAL]: 'gauge-critical',
  [FLAME_STATE.EXTINGUISHED]: 'gauge-critical',
};

/**
 * @param {Object} els
 * @param {HTMLElement} els.distance
 * @param {HTMLElement} els.environment
 * @param {HTMLElement} els.gauge
 * @param {HTMLElement} els.gaugeFill
 * @param {HTMLElement} els.banner
 */
export function createHud(els) {
  return {
    /** @param {import('../core/state.js').GameState} state */
    update(state) {
      if (!state.run) return;
      els.distance.textContent = `${Math.floor(state.run.distance)} m`;
      els.environment.textContent = ENVIRONMENTS[state.run.environmentIndex].name;
      els.gaugeFill.style.width = `${state.flame.integrity}%`;
      els.gauge.className = `hud-gauge ${GAUGE_CLASS_BY_FLAME_STATE[state.flame.state] || 'gauge-strong'}`;
      if (state.banner) {
        els.banner.textContent = state.banner.name;
        els.banner.classList.remove('hidden');
      } else {
        els.banner.classList.add('hidden');
      }
    },
  };
}
