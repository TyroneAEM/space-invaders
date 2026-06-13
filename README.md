# Space Invaders

A browser-based Space Invaders clone built with React and Vite.

**Live:** https://space-invaders-pi-three.vercel.app

## Controls

### Desktop (keyboard)

| Key | Action |
|-----|--------|
| `←` / `A` | Move left |
| `→` / `D` | Move right |
| `Space` | Shoot |

### Mobile (touch)

| Button | Action |
|--------|--------|
| ◀ | Move left |
| ▶ | Move right |
| FIRE | Shoot / start game |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
```

## Hosting (Vercel)

The app is deployed to Vercel as a static site. Vite builds it to a `dist/` folder and Vercel serves that directly — no server required.

### First-time deploy

```bash
npm run build
npx vercel login
npx vercel --prod --yes
```

Vercel auto-detects Vite and sets the build command (`vite build`) and output directory (`dist`) without any extra config.

### Redeploy after changes

```bash
npm run build
npx vercel --prod --yes
```

### Project dashboard

https://vercel.com/tyrone-tse-s-projects/space-invaders
