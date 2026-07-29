# Olympic Torch Panic

Carry the Olympic flame to LA. The runner moves forward on their own — your
only job is to rotate the torch so its shield faces incoming hazards (wind,
rain, drones, beach balls, fireworks). Unblocked hazards drain the flame;
at zero it goes out. Reach 5,000 m with the flame alive to win.

Plain HTML/CSS/JavaScript. No engines, no frameworks, no build step, zero
runtime dependencies. The deployable artifact is the repository root itself
(`index.html` + `css/` + `js/` + `assets/`) — ready for GitHub Pages.

<img width="1903" height="798" alt="image" src="https://github.com/user-attachments/assets/8e615daa-0838-463b-b9b3-433417d7eff9" />


## Controls

| Platform | Control |
|----------|---------|
| Desktop | Move the mouse left/right (absolute), or hold **A** / **D** |
| Mobile | Drag left/right anywhere on the screen |
| Pause | **Esc** / **P** or switching tabs (auto-pause) |

The torch blocks hazards arriving within ±60° of where it points. Warnings
telegraph every hazard's direction before it strikes.

## Run

Prerequisites: Node.js 22+ and npm (for the dev server and tests only — the
game itself is static files).

```bash
npm install
npm run dev        # serves the repo root at http://localhost:8080
```

ES modules require an HTTP origin — opening `index.html` via `file://` will
not work.

Query params: `?seed=42` reproduces an exact hazard sequence; `?debug=1`
shows a diagnostics overlay (fps, torch angle, integrity, live hazards).

## Test & checks

```bash
npm test            # unit + integration (node:test, no install needed)
npm run test:e2e    # Playwright browser tests (npx playwright install first)
npm run lint
npm run typecheck
npm run format:check
```

## Deploy

The game is served straight from the repository root: point GitHub Pages at
the root of this repo (or upload `index.html`, `css/`, `js/`, and `assets/`
to any static host with HTTPS and correct `Content-Type` for `.js`). `tests/`,
`scripts/`, and config files are dev-only and harmless if published.

## Structure

```
index.html
css/         styles.css
assets/      favicon.svg
js/
  core/      tuning (all gameplay numbers), state, loop, rng, angles
  systems/   runLifecycle, torchControl, hazardSystem, flameIntegrity, scoring
  ui/        input, renderer (canvas), screens, hud, audio
  storage/   saveStore (localStorage: otp.save.v1)
tests/       unit + integration (node:test) and e2e (Playwright)
scripts/     dev tooling (stop.mjs)
```

Game logic (`core/`, `systems/`) is DOM-free and deterministic (injected RNG
and time) so every requirement is unit-testable headlessly. Specs live in the
parent repository under `specification/`.
