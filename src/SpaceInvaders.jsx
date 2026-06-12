import { useEffect, useRef, useCallback } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 800, H = 600
const PLAYER_W = 40, PLAYER_H = 24, PLAYER_SPEED = 4
const BULLET_W = 3, BULLET_H = 12, PLAYER_BULLET_SPEED = 8
const ALIEN_BULLET_SPEED = 3
const ALIEN_COLS = 11, ALIEN_ROWS = 5, ALIEN_W = 36, ALIEN_H = 28
const ALIEN_PAD_X = 16, ALIEN_PAD_Y = 12
const ALIEN_START_X = 60, ALIEN_START_Y = 60
const SHIELD_COUNT = 4, SHIELD_W = 64, SHIELD_H = 40
const SHIELD_Y = H - 110
const ALIEN_SHOOT_INTERVAL = 1200 // ms base interval
const ALIEN_MOVE_INTERVAL = 600   // ms base

// Alien shapes: rows 0-1 squids, 2-3 crabs, 4 ufo-like
const ALIEN_COLORS = ['#ff6ec7', '#ff6ec7', '#7fff6e', '#7fff6e', '#6eb5ff']
const ALIEN_SHAPES = [
  // row 0-1: top aliens (squid)
  (ctx, x, y, t) => {
    ctx.beginPath()
    ctx.moveTo(x + 18, y + 2)
    ctx.lineTo(x + 22, y + 2)
    ctx.lineTo(x + 26, y + 8)
    ctx.lineTo(x + 36, y + 4)
    ctx.lineTo(x + 32, y + 14)
    ctx.lineTo(x + 36, y + 20)
    ctx.lineTo(x + 24, y + 20)
    ctx.lineTo(x + 22, y + 28)
    ctx.lineTo(x + 18, y + 28)
    ctx.lineTo(x + 14, y + 20)
    ctx.lineTo(x + 0, y + 20)
    ctx.lineTo(x + 4, y + 14)
    ctx.lineTo(x + 0, y + 4)
    ctx.lineTo(x + 10, y + 8)
    ctx.closePath()
    ctx.fill()
    // antennae
    ctx.fillRect(x + 8, y - 4 + (t % 2 === 0 ? 0 : 1), 3, 5)
    ctx.fillRect(x + 25, y - 4 + (t % 2 === 0 ? 1 : 0), 3, 5)
  },
  // row 2-3: crab
  (ctx, x, y, t) => {
    ctx.fillRect(x + 4, y + 4, 28, 16)
    ctx.fillRect(x + 8, y, 20, 8)
    ctx.fillRect(x, y + 8, 8, 8)
    ctx.fillRect(x + 28, y + 8, 8, 8)
    // claws animate
    const off = t % 2 === 0 ? 0 : 2
    ctx.fillRect(x - 2, y + 16 + off, 6, 6)
    ctx.fillRect(x + 32, y + 16 + off, 6, 6)
    ctx.clearRect(x + 12, y + 6, 6, 6)
    ctx.clearRect(x + 18, y + 6, 6, 6)
  },
  // row 4: bottom ufo
  (ctx, x, y, t) => {
    ctx.beginPath()
    ctx.ellipse(x + 18, y + 14, 16, 10, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.ellipse(x + 18, y + 10, 10, 7, 0, Math.PI, 0)
    ctx.fill()
    ctx.clearRect(x + 8, y + 10, 5, 5)
    ctx.clearRect(x + 15, y + 8, 5, 5)
    ctx.clearRect(x + 22, y + 10, 5, 5)
    // legs
    ctx.fillRect(x + 2, y + 22 + (t % 2 === 0 ? 0 : 1), 4, 5)
    ctx.fillRect(x + 10, y + 22 + (t % 2 === 0 ? 1 : 0), 4, 5)
    ctx.fillRect(x + 22, y + 22 + (t % 2 === 0 ? 0 : 1), 4, 5)
    ctx.fillRect(x + 30, y + 22 + (t % 2 === 0 ? 1 : 0), 4, 5)
  },
]

function getAlienShapeIdx(row) {
  if (row <= 1) return 0
  if (row <= 3) return 1
  return 2
}

function buildAliens() {
  const aliens = []
  for (let r = 0; r < ALIEN_ROWS; r++) {
    for (let c = 0; c < ALIEN_COLS; c++) {
      aliens.push({
        row: r, col: c,
        x: ALIEN_START_X + c * (ALIEN_W + ALIEN_PAD_X),
        y: ALIEN_START_Y + r * (ALIEN_H + ALIEN_PAD_Y),
        alive: true,
        points: (ALIEN_ROWS - r) * 10,
      })
    }
  }
  return aliens
}

function buildShields() {
  const shields = []
  const spacing = (W - SHIELD_COUNT * SHIELD_W) / (SHIELD_COUNT + 1)
  for (let i = 0; i < SHIELD_COUNT; i++) {
    const sx = spacing + i * (SHIELD_W + spacing)
    // each shield is a grid of 8×5 blocks (8px each)
    const blocks = []
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 8; c++) {
        // carve arch opening at bottom-center
        if (r >= 3 && c >= 2 && c <= 5) continue
        blocks.push({ r, c, hp: 3 })
      }
    }
    shields.push({ x: sx, y: SHIELD_Y, blocks })
  }
  return shields
}

// ─── Audio ────────────────────────────────────────────────────────────────────
function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const play = (freq, type, duration, vol = 0.15) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime)
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(); osc.stop(ctx.currentTime + duration)
  }
  return {
    shoot: () => play(440, 'square', 0.08),
    alienShoot: () => play(180, 'sawtooth', 0.12),
    explosion: () => play(80, 'sawtooth', 0.3, 0.2),
    playerHit: () => { play(120, 'sawtooth', 0.4, 0.3); play(80, 'sawtooth', 0.5, 0.3) },
    ufo: () => play(660, 'sine', 0.15, 0.1),
    march: (() => {
      const notes = [160, 130, 110, 130]
      let i = 0
      return () => { play(notes[i % 4], 'square', 0.1, 0.08); i++ }
    })(),
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SpaceInvaders() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const audioRef = useRef(null)

  const initGame = useCallback(() => {
    const aliens = buildAliens()
    const shields = buildShields()
    return {
      // player
      playerX: W / 2 - PLAYER_W / 2,
      playerY: H - 56,
      lives: 3,
      score: 0,
      hiScore: stateRef.current?.hiScore || 0,
      level: 1,
      // input
      keys: {},
      // bullets
      playerBullets: [],
      alienBullets: [],
      // aliens
      aliens,
      alienDir: 1,      // 1 = right, -1 = left
      alienDrop: false,
      alienMoveTimer: 0,
      alienShootTimer: 0,
      animFrame: 0,
      marchTimer: 0,
      marchInterval: 600,
      // shields
      shields,
      // ufo
      ufo: null,
      ufoTimer: 0,
      // state
      phase: 'start',   // start | playing | dead | levelup | gameover | win
      phaseTimer: 0,
      playerInvincible: 0,
      flash: 0,
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let audio
    try { audio = createAudio(); audioRef.current = audio } catch (_) { audioRef.current = null }

    stateRef.current = initGame()
    stateRef.current.phase = 'start'

    // ── Input ──
    const onKey = (e, down) => {
      stateRef.current.keys[e.code] = down
      if (down && (e.code === 'Space' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD')) {
        e.preventDefault()
      }
      if (down && e.code === 'Space') {
        const s = stateRef.current
        if (s.phase === 'start' || s.phase === 'gameover' || s.phase === 'win') {
          stateRef.current = initGame()
          stateRef.current.phase = 'playing'
          return
        }
        if (s.phase === 'playing' && s.playerBullets.length < 3) {
          s.playerBullets.push({ x: s.playerX + PLAYER_W / 2 - BULLET_W / 2, y: s.playerY - BULLET_H })
          audioRef.current?.shoot()
        }
      }
    }
    const onKeyDown = e => onKey(e, true)
    const onKeyUp = e => onKey(e, false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // ── Stars ──
    const stars = Array.from({ length: 80 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.5 + 0.5,
      brightness: Math.random(),
    }))

    // ── Game loop ──
    let last = 0
    let marchTick = 0

    function update(dt, s) {
      if (s.phase === 'start' || s.phase === 'gameover' || s.phase === 'win') return
      if (s.phase === 'dead') {
        s.phaseTimer -= dt
        if (s.phaseTimer <= 0) s.phase = 'playing'
        return
      }
      if (s.phase === 'levelup') {
        s.phaseTimer -= dt
        if (s.phaseTimer <= 0) {
          const next = initGame()
          next.score = s.score
          next.hiScore = s.hiScore
          next.lives = s.lives
          next.level = s.level + 1
          next.phase = 'playing'
          // speed up aliens
          next.marchInterval = Math.max(80, 600 - (s.level) * 60)
          stateRef.current = next
        }
        return
      }

      s.flash = Math.max(0, s.flash - dt)
      s.playerInvincible = Math.max(0, s.playerInvincible - dt)

      // Player movement
      const left = s.keys['ArrowLeft'] || s.keys['KeyA']
      const right = s.keys['ArrowRight'] || s.keys['KeyD']
      if (left) s.playerX = Math.max(0, s.playerX - PLAYER_SPEED)
      if (right) s.playerX = Math.min(W - PLAYER_W, s.playerX + PLAYER_SPEED)

      // Move player bullets
      s.playerBullets = s.playerBullets.filter(b => {
        b.y -= PLAYER_BULLET_SPEED
        return b.y + BULLET_H > 0
      })

      // Move alien bullets
      s.alienBullets = s.alienBullets.filter(b => {
        b.y += ALIEN_BULLET_SPEED
        return b.y < H
      })

      // UFO
      s.ufoTimer += dt
      if (s.ufoTimer > 20000 && !s.ufo) {
        s.ufo = { x: -60, y: 30, dir: 1, points: [50, 100, 150, 300][Math.floor(Math.random() * 4)] }
        s.ufoTimer = 0
        audioRef.current?.ufo()
      }
      if (s.ufo) {
        s.ufo.x += s.ufo.dir * 2
        if (s.ufo.x > W + 60) s.ufo = null
      }

      // Alien marching
      marchTick += dt
      if (marchTick >= s.marchInterval) {
        marchTick = 0
        s.animFrame = (s.animFrame + 1) % 2
        audioRef.current?.march()

        const alive = s.aliens.filter(a => a.alive)
        if (alive.length === 0) {
          s.phase = 'levelup'
          s.phaseTimer = 2000
          return
        }

        // Check edges
        const minX = Math.min(...alive.map(a => a.x))
        const maxX = Math.max(...alive.map(a => a.x + ALIEN_W))
        let drop = false
        if (s.alienDir === 1 && maxX >= W - 10) { s.alienDir = -1; drop = true }
        if (s.alienDir === -1 && minX <= 10) { s.alienDir = 1; drop = true }

        const stepX = drop ? 0 : s.alienDir * 16
        const stepY = drop ? 20 : 0
        s.aliens.forEach(a => { if (a.alive) { a.x += stepX; a.y += stepY } })

        // Check if aliens reached player line
        if (alive.some(a => a.y + ALIEN_H >= s.playerY)) {
          s.lives = 0
          s.phase = 'gameover'
        }
      }

      // Alien shooting
      s.alienShootTimer += dt
      const shootDelay = Math.max(300, ALIEN_SHOOT_INTERVAL - s.score * 2)
      if (s.alienShootTimer >= shootDelay) {
        s.alienShootTimer = 0
        const alive = s.aliens.filter(a => a.alive)
        if (alive.length > 0) {
          const shooter = alive[Math.floor(Math.random() * alive.length)]
          s.alienBullets.push({ x: shooter.x + ALIEN_W / 2, y: shooter.y + ALIEN_H })
          audioRef.current?.alienShoot()
        }
      }

      // ── Collision: player bullets vs aliens ──
      s.playerBullets = s.playerBullets.filter(b => {
        for (const a of s.aliens) {
          if (!a.alive) continue
          if (b.x < a.x + ALIEN_W && b.x + BULLET_W > a.x && b.y < a.y + ALIEN_H && b.y + BULLET_H > a.y) {
            a.alive = false
            s.score += a.points
            if (s.score > s.hiScore) s.hiScore = s.score
            s.flash = 80
            audioRef.current?.explosion()
            return false // remove bullet
          }
        }
        // vs UFO
        if (s.ufo) {
          if (b.x < s.ufo.x + 48 && b.x + BULLET_W > s.ufo.x && b.y < s.ufo.y + 20 && b.y + BULLET_H > s.ufo.y) {
            s.score += s.ufo.points
            if (s.score > s.hiScore) s.hiScore = s.score
            s.ufo = null
            audioRef.current?.explosion()
            return false
          }
        }
        // vs shields
        for (const shield of s.shields) {
          for (const block of shield.blocks) {
            const bx = shield.x + block.c * 8, by = shield.y + block.r * 8
            if (b.x < bx + 8 && b.x + BULLET_W > bx && b.y < by + 8 && b.y + BULLET_H > by && block.hp > 0) {
              block.hp--
              return false
            }
          }
        }
        return true
      })

      // ── Collision: alien bullets vs player ──
      if (s.playerInvincible <= 0) {
        s.alienBullets = s.alienBullets.filter(b => {
          const hit = b.x < s.playerX + PLAYER_W && b.x + BULLET_W > s.playerX &&
            b.y < s.playerY + PLAYER_H && b.y + BULLET_H > s.playerY
          if (hit) {
            s.lives--
            s.playerInvincible = 2500
            audioRef.current?.playerHit()
            if (s.lives <= 0) {
              s.phase = 'gameover'
            } else {
              s.phase = 'dead'
              s.phaseTimer = 1500
            }
            return false
          }
          return true
        })
      }

      // ── Alien bullets vs shields ──
      s.alienBullets = s.alienBullets.filter(b => {
        for (const shield of s.shields) {
          for (const block of shield.blocks) {
            const bx = shield.x + block.c * 8, by = shield.y + block.r * 8
            if (b.x < bx + 8 && b.x + BULLET_W > bx && b.y < by + 8 && b.y + BULLET_H > by && block.hp > 0) {
              block.hp--
              return false
            }
          }
        }
        return true
      })
    }

    // ── Draw helpers ──
    function drawPlayer(ctx, s) {
      if (s.phase === 'dead') return
      if (s.playerInvincible > 0 && Math.floor(Date.now() / 120) % 2 === 0) return
      ctx.fillStyle = '#00ff88'
      const px = s.playerX, py = s.playerY
      // body
      ctx.fillRect(px + 8, py + 8, PLAYER_W - 16, PLAYER_H - 8)
      // cannon
      ctx.fillRect(px + 17, py, 6, 12)
      // wings
      ctx.fillRect(px, py + 14, 12, 10)
      ctx.fillRect(px + PLAYER_W - 12, py + 14, 12, 10)
      // engine glow
      ctx.fillStyle = `rgba(0,255,136,${0.4 + 0.3 * Math.sin(Date.now() / 80)})`
      ctx.fillRect(px + 10, py + PLAYER_H, PLAYER_W - 20, 4)
    }

    function drawAlien(ctx, alien, frame) {
      const shapeIdx = getAlienShapeIdx(alien.row)
      ctx.fillStyle = ALIEN_COLORS[alien.row]
      ctx.save()
      // clip to alien bounds so shapes don't bleed
      ctx.beginPath()
      ctx.rect(alien.x - 4, alien.y - 6, ALIEN_W + 8, ALIEN_H + 8)
      ctx.clip()
      ALIEN_SHAPES[shapeIdx](ctx, alien.x, alien.y, frame)
      ctx.restore()
    }

    function drawUFO(ctx, ufo) {
      ctx.fillStyle = '#ff3333'
      ctx.beginPath()
      ctx.ellipse(ufo.x + 24, ufo.y + 12, 24, 10, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ff9999'
      ctx.beginPath()
      ctx.ellipse(ufo.x + 24, ufo.y + 8, 14, 8, 0, Math.PI, 0)
      ctx.fill()
      // lights
      ;[6, 16, 26, 36, 42].forEach((lx, i) => {
        ctx.fillStyle = ['#fff', '#ff0', '#0ff', '#ff0', '#fff'][i]
        ctx.beginPath()
        ctx.arc(ufo.x + lx, ufo.y + 13, 2, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    function drawShields(ctx, shields) {
      shields.forEach(shield => {
        shield.blocks.forEach(block => {
          if (block.hp <= 0) return
          const alpha = block.hp / 3
          ctx.fillStyle = `rgba(0,200,100,${alpha})`
          ctx.fillRect(shield.x + block.c * 8, shield.y + block.r * 8, 7, 7)
        })
      })
    }

    function drawBullets(ctx, s) {
      ctx.fillStyle = '#fff'
      s.playerBullets.forEach(b => ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H))
      ctx.fillStyle = '#ff4444'
      s.alienBullets.forEach(b => {
        ctx.fillRect(b.x, b.y, BULLET_W, 8)
        // zigzag effect
        ctx.fillRect(b.x + 2, b.y + 4, BULLET_W, 4)
      })
    }

    function drawHUD(ctx, s) {
      ctx.fillStyle = '#00ff88'
      ctx.font = 'bold 16px "Courier New"'
      ctx.fillText(`SCORE: ${s.score}`, 20, 28)
      ctx.fillText(`HI: ${s.hiScore}`, W / 2 - 50, 28)
      ctx.fillText(`LEVEL: ${s.level}`, W - 120, 28)
      // lives
      for (let i = 0; i < s.lives; i++) {
        const lx = 20 + i * 34, ly = H - 20
        ctx.fillStyle = '#00ff88'
        ctx.fillRect(lx + 8, ly - 12, 14, 8)
        ctx.fillRect(lx + 11, ly - 16, 8, 6)
        ctx.fillRect(lx, ly - 4, 10, 6)
        ctx.fillRect(lx + 20, ly - 4, 10, 6)
      }
      // ground line
      ctx.fillStyle = '#00ff88'
      ctx.fillRect(0, H - 36, W, 2)
    }

    function drawStars(ctx, time) {
      stars.forEach(s => {
        const twinkle = 0.4 + 0.6 * Math.abs(Math.sin(time / 1200 + s.brightness * 10))
        ctx.fillStyle = `rgba(255,255,255,${twinkle})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      })
    }

    function drawOverlay(ctx, s, time) {
      if (s.phase === 'start') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        ctx.fillRect(0, 0, W, H)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ff6ec7'
        ctx.font = 'bold 52px "Courier New"'
        ctx.fillText('SPACE INVADERS', W / 2, H / 2 - 80)
        ctx.fillStyle = '#00ff88'
        ctx.font = '18px "Courier New"'
        ctx.fillText('← → or A D  to move', W / 2, H / 2 - 20)
        ctx.fillText('SPACE or FIRE button to shoot', W / 2, H / 2 + 10)
        if (Math.floor(time / 600) % 2 === 0) {
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 22px "Courier New"'
          ctx.fillText('PRESS SPACE OR TAP FIRE TO START', W / 2, H / 2 + 70)
        }
        ctx.textAlign = 'left'
      }
      if (s.phase === 'gameover') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(0, 0, W, H)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ff3333'
        ctx.font = 'bold 52px "Courier New"'
        ctx.fillText('GAME OVER', W / 2, H / 2 - 40)
        ctx.fillStyle = '#fff'
        ctx.font = '20px "Courier New"'
        ctx.fillText(`SCORE: ${s.score}`, W / 2, H / 2 + 10)
        if (Math.floor(time / 600) % 2 === 0) {
          ctx.fillStyle = '#00ff88'
          ctx.fillText('PRESS SPACE TO PLAY AGAIN', W / 2, H / 2 + 60)
        }
        ctx.textAlign = 'left'
      }
      if (s.phase === 'levelup') {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(0, 0, W, H)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffff00'
        ctx.font = 'bold 40px "Courier New"'
        ctx.fillText(`LEVEL ${s.level} CLEAR!`, W / 2, H / 2)
        ctx.textAlign = 'left'
      }
      if (s.phase === 'win') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(0, 0, W, H)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#ffff00'
        ctx.font = 'bold 44px "Courier New"'
        ctx.fillText('YOU WIN!', W / 2, H / 2 - 40)
        ctx.fillStyle = '#fff'
        ctx.font = '20px "Courier New"'
        ctx.fillText(`FINAL SCORE: ${s.score}`, W / 2, H / 2 + 10)
        if (Math.floor(time / 600) % 2 === 0) {
          ctx.fillStyle = '#00ff88'
          ctx.fillText('PRESS SPACE TO PLAY AGAIN', W / 2, H / 2 + 60)
        }
        ctx.textAlign = 'left'
      }
    }

    function draw(ctx, s, time) {
      // Background
      ctx.fillStyle = '#000'
      ctx.fillRect(0, 0, W, H)
      drawStars(ctx, time)

      // Flash on hit
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255,100,0,${s.flash / 200})`
        ctx.fillRect(0, 0, W, H)
      }

      // Game objects
      drawShields(ctx, s.shields)
      s.aliens.forEach(a => { if (a.alive) drawAlien(ctx, a, s.animFrame) })
      if (s.ufo) drawUFO(ctx, s.ufo)
      drawBullets(ctx, s)
      drawPlayer(ctx, s)
      drawHUD(ctx, s)
      drawOverlay(ctx, s, time)
    }

    // ── RAF loop ──
    function loop(ts) {
      const dt = Math.min(ts - last, 50) // cap at 50ms to avoid spiral
      last = ts
      const s = stateRef.current
      update(dt, s)
      draw(ctx, s, ts)
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(ts => { last = ts; rafRef.current = requestAnimationFrame(loop) })

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [initGame])

  // ── Touch handlers (mobile controls) ──
  const touchLeft = useCallback((active) => {
    if (stateRef.current) stateRef.current.keys['ArrowLeft'] = active
  }, [])

  const touchRight = useCallback((active) => {
    if (stateRef.current) stateRef.current.keys['ArrowRight'] = active
  }, [])

  const touchFire = useCallback(() => {
    const s = stateRef.current
    if (!s) return
    if (s.phase === 'start' || s.phase === 'gameover' || s.phase === 'win') {
      const next = initGame()
      next.phase = 'playing'
      stateRef.current = next
      return
    }
    if (s.phase === 'playing' && s.playerBullets.length < 3) {
      s.playerBullets.push({ x: s.playerX + PLAYER_W / 2 - BULLET_W / 2, y: s.playerY - BULLET_H })
      audioRef.current?.shoot()
    }
  }, [initGame])

  const btnBase = {
    background: 'rgba(0,255,136,0.1)',
    border: '2px solid #00ff8888',
    borderRadius: 12,
    color: '#00ff88',
    fontFamily: 'monospace',
    fontWeight: 'bold',
    fontSize: 22,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'none',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: 800, padding: '8px 0' }}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{
          width: '100%',
          height: 'auto',
          border: '2px solid #00ff88',
          borderRadius: 4,
          imageRendering: 'pixelated',
          touchAction: 'none',
          display: 'block',
        }}
        tabIndex={0}
      />

      {/* Mobile controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '12px 16px', marginTop: 4 }}>
        {/* Move buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            style={{ ...btnBase, width: 72, height: 72 }}
            onTouchStart={e => { e.preventDefault(); touchLeft(true) }}
            onTouchEnd={e => { e.preventDefault(); touchLeft(false) }}
            onTouchCancel={e => { e.preventDefault(); touchLeft(false) }}
            onMouseDown={() => touchLeft(true)}
            onMouseUp={() => touchLeft(false)}
            onMouseLeave={() => touchLeft(false)}
          >◀</button>
          <button
            style={{ ...btnBase, width: 72, height: 72 }}
            onTouchStart={e => { e.preventDefault(); touchRight(true) }}
            onTouchEnd={e => { e.preventDefault(); touchRight(false) }}
            onTouchCancel={e => { e.preventDefault(); touchRight(false) }}
            onMouseDown={() => touchRight(true)}
            onMouseUp={() => touchRight(false)}
            onMouseLeave={() => touchRight(false)}
          >▶</button>
        </div>

        <div style={{ color: '#00ff8844', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' }}>
          SPACE — fire<br />← → / A D — move
        </div>

        {/* Fire button */}
        <button
          style={{ ...btnBase, width: 100, height: 72, fontSize: 14, letterSpacing: 1, background: 'rgba(0,255,136,0.15)' }}
          onTouchStart={e => { e.preventDefault(); touchFire() }}
          onMouseDown={touchFire}
        >FIRE</button>
      </div>
    </div>
  )
}
