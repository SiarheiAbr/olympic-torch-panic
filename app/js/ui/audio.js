// @ts-check
// Web Audio cues, fully synthesized (no asset files). Degrades to silence
// when the API is unavailable or blocked by autoplay policy (stack.md).

export function createAudio() {
  /** @type {?AudioContext} */
  let audioCtx = null;
  let broken = false;
  /** @type {?number} */
  let criticalTimer = null;

  function ensureContext() {
    if (broken) return null;
    if (!audioCtx) {
      try {
        audioCtx = new AudioContext();
      } catch {
        broken = true;
        return null;
      }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  /**
   * @param {number} freq
   * @param {number} duration - seconds
   * @param {{type?: OscillatorType, gain?: number, delay?: number, slideTo?: number}} [opts]
   */
  function tone(freq, duration, opts = {}) {
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + (opts.delay || 0);
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + duration);
      gain.gain.setValueAtTime(opts.gain ?? 0.05, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + duration);
    } catch {
      // never let audio break gameplay (REQ-ERR-007 spirit)
    }
  }

  return {
    /** Call on the first user gesture so the context is allowed to start. */
    unlock() {
      ensureContext();
    },
    bounce() {
      tone(220, 0.12, { type: 'square', gain: 0.06 });
    },
    damage() {
      tone(140, 0.15, { type: 'sawtooth', gain: 0.05 });
    },
    countdownTick() {
      tone(660, 0.1, { gain: 0.04 });
    },
    extinguish() {
      tone(400, 0.7, { type: 'sawtooth', gain: 0.08, slideTo: 60 });
    },
    victory() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { delay: i * 0.15, gain: 0.06 }));
    },
    startCritical() {
      if (criticalTimer !== null) return;
      criticalTimer = setInterval(() => tone(880, 0.09, { gain: 0.045 }), 500);
    },
    stopCritical() {
      if (criticalTimer !== null) {
        clearInterval(criticalTimer);
        criticalTimer = null;
      }
    },
  };
}
