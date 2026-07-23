# Olympic Torch Panic

Carry the Olympic flame to LA. The runner moves forward on their own — your
only job is to rotate the torch so its shield faces incoming hazards (wind,
rain, drones, beach balls, fireworks). Unblocked hazards drain the flame;
at zero it goes out. Reach 5,000 m with the flame alive to win.

Plain HTML/CSS/JavaScript. No engines, no frameworks, no build step, zero
runtime dependencies. The deployable artifact is the static `app/` folder.

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
npm run dev        # serves app/ at http://localhost:8080
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

Upload `app/` to any static host (HTTPS, correct `Content-Type` for `.js`).
Reference target: AWS S3 + CloudFront with full invalidation on deploy.

## Structure

```
app/js/
  core/      tuning (all gameplay numbers), state, loop, rng, angles
  systems/   runLifecycle, torchControl, hazardSystem, flameIntegrity, scoring
  ui/        input, renderer (canvas), screens, hud, audio
  storage/   saveStore (localStorage: otp.save.v1)
```

Game logic (`core/`, `systems/`) is DOM-free and deterministic (injected RNG
and time) so every requirement is unit-testable headlessly. Specs live in the
parent repository under `specification/`.
