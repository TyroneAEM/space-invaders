# Space Invaders — Project Guide

## Overview

Browser-based Space Invaders clone built with React 18 + Vite. Single-file game loop rendered on an HTML5 canvas. No game engine — all drawing, collision, and state is hand-rolled.

## Stack

- **React 18** + **Vite 5** (ESM)
- **Canvas 2D API** — all rendering in `SpaceInvaders.jsx`
- **Vercel** — static site hosting (no server)

## Key Files

| File | Purpose |
|------|---------|
| `src/SpaceInvaders.jsx` | Entire game: constants, alien shapes, game loop, input, sound, drawing |
| `src/App.jsx` | Root component, just mounts `<SpaceInvaders />` |
| `src/index.css` | Global styles |
| `vite.config.js` | Vite config with React plugin |

## Links

- **Live site:** https://space-invaders-pi-three.vercel.app
- **GitHub:** https://github.com/TyroneAEM/space-invaders
- **Vercel dashboard:** https://vercel.com/tyrone-tse-s-projects/space-invaders

## Dev

```bash
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
```

## Deploy

```bash
npm run build
npx vercel --prod --yes
```

## Game Design

### Canvas

Fixed logical size `800 × 600`, scaled responsively via CSS transform to fit the viewport.

### Alien Grid

- **11 columns × 6 rows** = 66 aliens max
- Row 0–1: Darth Vader helmets (blue-grey, pulsing red visor)
- Row 2–3: Stormtrooper helmets (white)
- Row 4–5: Skulls (cyan-blue)
- All shapes are drawn procedurally in `ALIEN_SHAPES` — no sprite images

### Player

- 40 × 24px cannon, speed 4px/frame
- Shield toggle: `S` key or mobile shield button
- One bullet on screen at a time

### Controls

| Input | Action |
|-------|--------|
| `←` / `A` | Move left |
| `→` / `D` | Move right |
| `Space` | Shoot / start |
| `S` | Toggle shield |
| Touch buttons | Mobile equivalent |

### UFO

Crosses the screen periodically, plays looping sound while visible. Sound must stop when game phase changes to `gameover`, `dead`, or `levelup`.

### Sound

All audio via Web Audio API (`AudioContext`). No external audio files.

## Known Quirks

- React StrictMode double-mounts the component in dev — event listeners must use stable references (useCallback + useRef) to avoid duplicate firing on Space bar.
- `removeEventListener` must receive the exact same function reference used in `addEventListener`.
