# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Browser-based Space Invaders clone built with React 18 + Vite. Almost the entire game — state, physics, collision, drawing, audio, input — lives in one file (`src/SpaceInvaders.jsx`) and renders to a single HTML5 canvas. No game engine, no external assets: alien shapes are drawn procedurally and all sound is synthesized with the Web Audio API. There is no backend, no test suite, and no state management library.

## Stack

- **React 18** + **Vite 5** (ESM)
- **Canvas 2D API** — all rendering in `SpaceInvaders.jsx`
- **Vercel** — static site hosting (no server)

## Commands

```bash
npm install
npm run dev       # start Vite dev server at http://localhost:5173
npm run build     # production build to dist/
npm run preview   # preview the production build locally
```

There is no lint or test command configured. Verify changes with `npm run build` plus manual play-testing (start / play / die / level-up / game-over / mobile controls) — this game has no automated coverage.

### Deploy (Vercel)

```bash
npm run build
npx vercel --prod --yes
```

Vercel auto-detects Vite (`vite build` → `dist/`); no vercel.json is needed.

## Architecture

### Mutable state ref, not React state

All game state lives in one plain object created by `initGame()` and held in `stateRef` (`useRef`, not `useState`). The render loop mutates this object directly every frame instead of going through React's setState/re-render cycle — this is what makes 60fps canvas physics possible. **Never move gameplay state into `useState`**; React state/props are only for things outside the frame loop.

### Game loop shape

Inside the single `useEffect` in `SpaceInvaders.jsx`:
- `update(dt, s)` — advances physics/collision/timers for one frame, mutating `s`
- `draw(ctx, s, time)` — pure rendering, reads `s` and paints the canvas; never mutates state
- `loop(ts)` — the `requestAnimationFrame` driver; computes `dt` (capped at 50ms to avoid a spiral-of-death after a tab-switch) and calls `update` then `draw`

Keyboard input is captured via `window` `keydown`/`keyup` listeners that just set `s.keys[code] = true/false`; `update()` reads `s.keys` each frame rather than reacting to key events directly. Mobile touch buttons drive the same `s.keys` map (and call `fireWeaponRef.current` / `detonateBombRef.current` for discrete actions), so desktop and mobile share one input model.

### Game phases

`s.phase` drives both `update()` branching and the overlay drawn on top of the canvas: `start → playing ⇄ dead (brief respawn pause) → gameover`, or `playing → levelup → playing` (next wave — aliens speed up via `marchInterval`, weapon/bombs/combo carry over). Check the phase early in `update()`/`draw()` before adding new behavior — most systems (UFO drone sound, bomb detonation, timers) explicitly no-op or pause on non-`playing` phases.

### Draw order matters

`draw()` layers, back to front: starfield → shields/bunkers → aliens → player → bullets/lasers → particles → smart-bomb shockwave/flash → HUD → phase overlay. Screen-shake during a bomb detonation is applied only to the gameplay layers, not HUD/overlay, so score/messages stay readable.

### Systems of note

- **Weapons**: `s.weapon` (`normal | missile | fire | laser`) with `s.weaponShots` counting down a limited-use pickup; each weapon has its own fire behavior, ammo cap, and collision shape in `doFire()`.
- **Smart bomb**: `s.smartBombs` is an uncapped stockpile, incremented by catching a UFO-dropped bomb pickup. `B` (desktop) or the mobile BOMB button detonates one via `tryDetonateBomb` → `doSmartBomb`. Detonation is a staggered shockwave (`a.detonateAt` computed per-alien from distance to the cannon), not an instant kill, and clears in-flight alien bullets while tying `s.playerInvincible` to the full blast duration so the bomb can never kill the player.
- **Combo**: `s.combo` increments per kill (any weapon or bomb) and decays once `s.comboTimer` runs out; combo level applies a score multiplier.
- **Shields/bunkers**: each of the 4 shields is a destructible grid of 8×5 blocks with `hp`; guided missiles (`piercing`) fly through the player's own bunkers, other bullet types do not.
- **UFO**: spawns periodically, loops a synthesized drone while alive, and drops exactly one weapon/bomb/life pickup on death (never more than one pickup on screen at once). Its looping sound must be explicitly stopped (`audioRef.current?.stopUFO()`) whenever the phase leaves `playing`.
- **Hi-score**: persisted via a 10-year cookie (`getHiScore`/`saveHiScore`), read on init and written immediately on every new high score.

### Alien grid

- 11 columns × 6 rows = 66 aliens max, built by `buildAliens()`
- Row 0–1: Darth Vader helmets (blue-grey, pulsing red visor); row 2–3: stormtrooper helmets (white); row 4–5: skulls (cyan-blue)
- All shapes are drawn procedurally per-frame in `ALIEN_SHAPES` — no sprite images

## Controls

| Input | Action |
|-------|--------|
| `←` / `A`, `→` / `D` | Move |
| `Space` | Shoot (or start/restart from start/gameover/win screens) |
| `S` (hold) | Shield — drains/recharges `shieldEnergy` |
| `B` | Detonate an armed smart bomb |
| Touch buttons | ◀ ▶ move, SHIELD, FIRE, 💣 BOMB — mirror the keys above |

## Key Files

| File | Purpose |
|------|---------|
| `src/SpaceInvaders.jsx` | Entire game: constants, alien shapes, audio synthesis, game loop, input, drawing, mobile controls |
| `src/App.jsx` | Root component, just mounts `<SpaceInvaders />` |
| `src/index.css` | Global styles |
| `vite.config.js` | Vite config with React plugin |

## Links

- **Live site:** https://space-invaders-pi-three.vercel.app
- **GitHub:** https://github.com/TyroneAEM/space-invaders
- **Vercel dashboard:** https://vercel.com/tyrone-tse-s-projects/space-invaders

## Known Quirks

- React StrictMode double-mounts the component in dev — event listeners must use stable function references (not inline closures re-created per render) or `Space`/keys can fire twice.
- `removeEventListener` must receive the exact same function reference passed to `addEventListener` — keep `onKeyDown`/`onKeyUp` as named consts inside the effect, don't inline them.
- Canvas is a fixed logical `800×600` (`W`, `H` constants) scaled responsively via CSS (`width: 100%; height: auto`) — collision math always uses logical coordinates, never DOM/pixel size.
