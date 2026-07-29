// @ts-check
// DOM screen manager: menu, pause overlay, resume countdown, results,
// leaderboard, storage notice. Reads state for overlay sync; all session
// transitions go through the commands wired in main.js.

import { RESUME_COUNTDOWN } from '../core/tuning.js';
import { SESSION } from '../core/state.js';

/** @param {HTMLElement} el */
function show(el) {
  el.classList.remove('hidden');
}
/** @param {HTMLElement} el */
function hide(el) {
  el.classList.add('hidden');
}

/**
 * @param {Object} opts
 * @param {Record<string, HTMLElement>} opts.els - screen/overlay elements by key
 * @param {() => import('../storage/saveStore.js').SaveDoc} opts.getSaveDoc
 */
export function createScreens({ els, getSaveDoc }) {
  let lastCountdownShown = null;

  function renderLeaderboardInto(tbody, emptyEl) {
    const doc = getSaveDoc();
    tbody.textContent = '';
    if (doc.leaderboard.length === 0) {
      show(emptyEl);
      return;
    }
    hide(emptyEl);
    doc.leaderboard.forEach((entry, i) => {
      const row = document.createElement('tr');
      const date = new Date(entry.achievedAt);
      const dateText = isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
      row.innerHTML =
        `<td>${i + 1}</td><td>${entry.initials}</td><td>${entry.distance} m</td>` +
        `<td>${entry.survivalTime.toFixed(1)} s</td><td>${entry.reachedLA ? '🏆 LA' : ''}</td>` +
        `<td>${dateText}</td>`;
      tbody.appendChild(row);
    });
  }

  const api = {
    toMenu() {
      hide(els.hud);
      hide(els.results);
      hide(els.pauseOverlay);
      hide(els.countdownOverlay);
      hide(els.endOverlay);
      hide(els.leaderboardScreen);
      hide(els.howToScreen);
      show(els.menu);
      const doc = getSaveDoc();
      els.menuBest.textContent =
        doc.leaderboard.length > 0
          ? `Best: ${doc.leaderboard[0].distance} m · Longest flame: ${doc.longestSurvival.toFixed(1)} s`
          : 'No runs yet — light the way to LA!';
    },

    toGame() {
      hide(els.menu);
      hide(els.results);
      hide(els.leaderboardScreen);
      hide(els.howToScreen);
      hide(els.endOverlay);
      show(els.hud);
    },

    showLeaderboard() {
      renderLeaderboardInto(els.leaderboardBody, els.leaderboardEmpty);
      els.leaderboardRecord.textContent = `Longest Flame Survival: ${getSaveDoc().longestSurvival.toFixed(1)} s`;
      show(els.leaderboardScreen);
    },

    hideLeaderboard() {
      hide(els.leaderboardScreen);
    },

    showHowTo() {
      show(els.howToScreen);
    },

    hideHowTo() {
      hide(els.howToScreen);
    },

    /**
     * End-of-run presentation (flame-out or victory) before the results screen.
     * @param {boolean} victory
     * @param {() => void} done
     */
    showEndPresentation(victory, done) {
      els.endOverlay.textContent = victory ? '🏆 You reached LA! 🏆' : '💨 The flame went out…';
      els.endOverlay.classList.toggle('end-victory', victory);
      show(els.endOverlay);
      setTimeout(() => {
        hide(els.endOverlay);
        done();
      }, 1600);
    },

    /**
     * @param {import('../systems/scoring.js').RunResult} result
     * @param {{qualifies: boolean, rank: ?number}} status
     */
    showResults(result, status) {
      hide(els.hud);
      show(els.results);
      els.resultDistance.textContent = `${result.entry.distance} m`;
      els.resultTime.textContent = `Flame survived ${result.entry.survivalTime.toFixed(1)} s`;
      els.resultBadge.classList.toggle('hidden', !result.entry.reachedLA);
      els.resultRecord.classList.toggle('hidden', !result.newLongestSurvival);

      if (status.qualifies) {
        els.resultMessage.textContent =
          status.rank !== null ? `Top-10 run — rank #${status.rank}!` : 'Top-10 run!';
        show(els.initialsForm);
      } else {
        els.resultMessage.textContent =
          result.metersShort !== null
            ? `You were ${result.metersShort} m short of the top 10.`
            : '';
        hide(els.initialsForm);
      }
      renderLeaderboardInto(els.resultsBoardBody, els.resultsBoardEmpty);
    },

    /** Re-render the results leaderboard after initials are saved. */
    refreshResults(rank) {
      hide(els.initialsForm);
      if (rank !== null) els.resultMessage.textContent = `Saved — rank #${rank}!`;
      renderLeaderboardInto(els.resultsBoardBody, els.resultsBoardEmpty);
    },

    /** One-per-session non-blocking notice (REQ-ERR-005). */
    showNotice(message) {
      els.notice.textContent = message;
      show(els.notice);
      setTimeout(() => hide(els.notice), 6000);
    },

    /**
     * Per-frame overlay sync: pause menu vs resume countdown (REQ-ERR-003).
     * Returns the countdown number when it just changed, for an audio tick.
     * @param {import('../core/state.js').GameState} state
     * @returns {?number}
     */
    update(state) {
      let tick = null;
      if (state.session === SESSION.PAUSED) {
        if (state.resumeCountdown !== null) {
          hide(els.pauseOverlay);
          show(els.countdownOverlay);
          const n = Math.min(RESUME_COUNTDOWN, Math.max(1, Math.ceil(state.resumeCountdown)));
          els.countdownNumber.textContent = String(n);
          if (n !== lastCountdownShown) {
            lastCountdownShown = n;
            tick = n;
          }
        } else {
          show(els.pauseOverlay);
          hide(els.countdownOverlay);
          lastCountdownShown = null;
        }
      } else {
        hide(els.pauseOverlay);
        hide(els.countdownOverlay);
        lastCountdownShown = null;
      }
      return tick;
    },
  };

  return api;
}
