import { useEffect, useRef, useCallback } from 'react'

// ─── Constants ────────────────────────────────────────────────────────────────
const W = 800, H = 600
const PLAYER_W = 40, PLAYER_H = 24, PLAYER_SPEED = 4
const BULLET_W = 3, BULLET_H = 12, PLAYER_BULLET_SPEED = 8
const ALIEN_BULLET_SPEED = 3
const ALIEN_COLS = 11, ALIEN_ROWS = 6, ALIEN_W = 36, ALIEN_H = 28
const ALIEN_PAD_X = 16, ALIEN_PAD_Y = 12
const ALIEN_START_X = 60, ALIEN_START_Y = 60
const SHIELD_COUNT = 4, SHIELD_W = 64, SHIELD_H = 40
const SHIELD_Y = H - 110
const ALIEN_SHOOT_INTERVAL = 1200 // ms base interval
const ALIEN_MOVE_INTERVAL = 600   // ms base
const PICKUP_FALL_SPEED = 1.2
const WEAPON_SHOTS = 16

// Alien shapes: rows 0-1 Darth Vader, 2-3 stormtroopers, 4-5 skulls
const ALIEN_COLORS = ['#8899cc', '#8899cc', '#dde0ee', '#dde0ee', '#6eb5ff', '#6eb5ff']
const ALIEN_SHAPES = [
  // row 0-1: Darth Vader helmet
  (ctx, x, y, t) => {
    // dome
    ctx.beginPath()
    ctx.arc(x + 18, y + 8, 12, Math.PI, 0)
    ctx.lineTo(x + 30, y + 14)
    ctx.lineTo(x + 6, y + 14)
    ctx.closePath()
    ctx.fill()
    // cheek panels
    ctx.fillRect(x + 1, y + 8, 7, 16)
    ctx.fillRect(x + 28, y + 8, 7, 16)
    // lower mask
    ctx.fillRect(x + 9, y + 14, 18, 14)
    // visor — red glow, pulsing
    const pulse = 0.6 + 0.4 * Math.abs(Math.sin(Date.now() / 400))
    ctx.fillStyle = `rgba(255, 20, 20, ${pulse})`
    ctx.fillRect(x + 8, y + 5, 20, 9)
    // outer bloom
    ctx.fillStyle = `rgba(255, 0, 0, ${pulse * 0.3})`
    ctx.fillRect(x + 6, y + 4, 24, 11)
    // chin grooves
    ctx.clearRect(x + 13, y + 18, 2, 8)
    ctx.clearRect(x + 21, y + 18, 2, 8)
    // animated breathing vents
    const ventH = t % 2 === 0 ? 3 : 2
    ctx.clearRect(x + 10, y + 23, 4, ventH)
    ctx.clearRect(x + 22, y + 23, 4, ventH)
  },
  // row 2-3: stormtrooper helmet
  (ctx, x, y, t) => {
    // full helmet body (dome + face plate)
    ctx.beginPath()
    ctx.arc(x + 18, y + 9, 13, Math.PI, 0)
    ctx.lineTo(x + 31, y + 28)
    ctx.lineTo(x + 5, y + 28)
    ctx.closePath()
    ctx.fill()
    // side ear pods
    ctx.fillRect(x, y + 12, 5, 9)
    ctx.fillRect(x + 31, y + 12, 5, 9)
    // left eye cutout
    ctx.clearRect(x + 6, y + 6, 10, 10)
    // right eye cutout
    ctx.clearRect(x + 20, y + 6, 10, 10)
    // nose bridge between eyes
    ctx.fillRect(x + 16, y + 6, 4, 10)
    // mouth grille (4 vents, animated breathe)
    const ventY = y + 20 + (t % 2 === 0 ? 0 : 1)
    ctx.clearRect(x + 10, ventY, 3, 5)
    ctx.clearRect(x + 14, ventY, 3, 5)
    ctx.clearRect(x + 19, ventY, 3, 5)
    ctx.clearRect(x + 23, ventY, 3, 5)
    // chin notch
    ctx.clearRect(x + 9, y + 25, 18, 3)
  },
  // rows 4-5: skull
  (ctx, x, y, t) => {
    // cranium dome
    ctx.beginPath()
    ctx.arc(x + 18, y + 11, 13, Math.PI, 0)
    ctx.lineTo(x + 31, y + 22)
    ctx.lineTo(x + 5, y + 22)
    ctx.closePath()
    ctx.fill()
    // jaw
    ctx.fillRect(x + 8, y + 20, 20, 8)
    // left eye socket
    ctx.clearRect(x + 8, y + 5, 8, 9)
    // right eye socket
    ctx.clearRect(x + 20, y + 5, 8, 9)
    // nose cavity
    ctx.clearRect(x + 15, y + 14, 6, 5)
    // teeth gaps — jaw chatters with animation
    const chat = t % 2 === 0 ? 0 : 1
    ctx.clearRect(x + 10, y + 21 + chat, 3, 5)
    ctx.clearRect(x + 16, y + 21 + chat, 3, 5)
    ctx.clearRect(x + 22, y + 21 + chat, 3, 5)
  },
]

function getHiScore() {
  const match = document.cookie.match(/(?:^|;\s*)hiScore=(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

function saveHiScore(score) {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 10)
  document.cookie = `hiScore=${score};expires=${d.toUTCString()};path=/;SameSite=Lax`
}

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
  let ufoNodes = null
  return {
    shoot: () => play(440, 'square', 0.08),
    alienShoot: () => play(180, 'sawtooth', 0.12),
    explosion: () => play(80, 'sawtooth', 0.3, 0.2),
    ufoExplosion: () => {
      // big sci-fi bang: high-pitched burst sweeping down, layered boom
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(900, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.9)
      gain.gain.setValueAtTime(0.45, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9)
      osc.start(); osc.stop(ctx.currentTime + 0.9)
      play(60, 'sawtooth', 0.7, 0.35)
      play(120, 'square', 0.4, 0.2)
    },
    playerHit: () => {
      // descending sweep — classic ship-destroyed sound
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(480, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(35, ctx.currentTime + 0.7)
      gain.gain.setValueAtTime(0.35, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7)
      osc.start(); osc.stop(ctx.currentTime + 0.7)
      play(70, 'sawtooth', 0.5, 0.28)
    },
    startUFO: () => {
      if (ufoNodes) return
      const osc = ctx.createOscillator()
      const lfo = ctx.createOscillator()
      const lfoGain = ctx.createGain()
      const gainNode = ctx.createGain()
      // sawtooth base at 100Hz, square LFO at 6Hz ±30Hz → alternates 70–130Hz
      osc.type = 'sawtooth'
      osc.frequency.value = 100
      lfo.type = 'square'
      lfo.frequency.value = 6
      lfoGain.gain.value = 30
      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)
      osc.connect(gainNode)
      gainNode.connect(ctx.destination)
      gainNode.gain.setValueAtTime(0.12, ctx.currentTime)
      lfo.start(); osc.start()
      ufoNodes = { osc, lfo }
    },
    stopUFO: () => {
      if (!ufoNodes) return
      try { ufoNodes.osc.stop(); ufoNodes.lfo.stop() } catch (_) {}
      ufoNodes = null
    },
    march: (() => {
      const notes = [160, 130, 110, 130]
      let i = 0
      return () => { play(notes[i % 4], 'square', 0.1, 0.08); i++ }
    })(),
    pickupCollect: () => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'square'
      osc.frequency.setValueAtTime(400, ctx.currentTime)
      osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.18)
      gain.gain.setValueAtTime(0.18, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22)
      osc.start(); osc.stop(ctx.currentTime + 0.22)
    },
    missileFire: () => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.18)
      gain.gain.setValueAtTime(0.22, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18)
      osc.start(); osc.stop(ctx.currentTime + 0.18)
    },
    flameFire: () => {
      play(200, 'sawtooth', 0.1, 0.2)
      play(280, 'square', 0.07, 0.1)
    },
    laserFire: () => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(1400, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(180, ctx.currentTime + 0.28)
      gain.gain.setValueAtTime(0.28, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28)
      osc.start(); osc.stop(ctx.currentTime + 0.28)
    },
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SpaceInvaders() {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const rafRef = useRef(null)
  const audioRef = useRef(null)
  const fireWeaponRef = useRef(null)

  const initGame = useCallback(() => {
    const aliens = buildAliens()
    const shields = buildShields()
    return {
      // player
      playerX: W / 2 - PLAYER_W / 2,
      playerY: H - 56,
      lives: 3,
      score: 0,
      hiScore: Math.max(stateRef.current?.hiScore || 0, getHiScore()),
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
      // shield
      shieldEnergy: 100,
      shieldHit: 0,
      // explosion particles
      playerParticles: [],
      ufoParticles: [],
      // weapons
      weaponPickup: null,
      weapon: 'normal',
      weaponShots: 0,
      lasers: [],
      // combo & pause
      combo: 0,
      comboTimer: 0,
      paused: false,
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let audio
    try { audio = createAudio(); audioRef.current = audio } catch (_) { audioRef.current = null }

    stateRef.current = initGame()
    stateRef.current.phase = 'start'

    // ── Weapon helpers ──
    function killUFO(s) {
      const ux = s.ufo.x + 24, uy = s.ufo.y + 12
      s.score += s.ufo.points
      if (s.score > s.hiScore) { s.hiScore = s.score; saveHiScore(s.hiScore) }
      audioRef.current?.stopUFO()
      audioRef.current?.ufoExplosion()
      const ucolors = ['#ff3333', '#ff9999', '#ffdd00', '#ffffff', '#ff8800']
      s.ufoParticles = Array.from({ length: 28 }, () => {
        const angle = Math.random() * Math.PI * 2
        const speed = 1.5 + Math.random() * 4
        return {
          x: ux + (Math.random() - 0.5) * 48, y: uy + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          life: 1, size: 2 + Math.random() * 4,
          color: ucolors[Math.floor(Math.random() * ucolors.length)],
        }
      })
      if (!s.weaponPickup) {
        const type = Math.random() < 0.25
          ? 'life'
          : ['missile', 'fire', 'laser'][Math.floor(Math.random() * 3)]
        s.weaponPickup = { x: s.ufo.x + 6, y: uy, type }
      }
      s.ufo = null
    }

    function doFire(s) {
      if (s.keys['KeyS'] && s.shieldEnergy > 0) return

      if (s.weapon === 'laser') {
        const lx = s.playerX + PLAYER_W / 2
        s.aliens.forEach(a => {
          if (!a.alive) return
          if (lx >= a.x - 2 && lx <= a.x + ALIEN_W + 2) {
            a.alive = false
            const comboMultiplier = 1 + Math.floor(s.combo / 5) * 0.1
            s.score += Math.floor(a.points * comboMultiplier)
            s.combo++
            s.comboTimer = 2500
            if (s.score > s.hiScore) { s.hiScore = s.score; saveHiScore(s.hiScore) }
            s.flash = 80
            audioRef.current?.explosion()
          }
        })
        if (s.ufo && lx >= s.ufo.x && lx <= s.ufo.x + 48) killUFO(s)
        s.lasers.push({ x: lx, life: 350, maxLife: 350 })
        audioRef.current?.laserFire()
        s.weaponShots--
        if (s.weaponShots <= 0) s.weapon = 'normal'

      } else if (s.weapon === 'missile') {
        if (s.playerBullets.filter(b => b.type === 'missile').length < 2) {
          const cx = s.playerX + PLAYER_W / 2
          s.playerBullets.push({ x: cx - 5, y: s.playerY - 22, vx: 0, vy: -5, type: 'missile', w: 10, h: 22, piercing: 1 })
          audioRef.current?.missileFire()
          s.weaponShots--
          if (s.weaponShots <= 0) s.weapon = 'normal'
        }

      } else if (s.weapon === 'fire') {
        if (s.playerBullets.length < 9) {
          const cx = s.playerX + PLAYER_W / 2
          s.playerBullets.push(
            { x: cx - 10, y: s.playerY - 8,  vx: -1.5, vy: -7, type: 'fire', w: 5, h: 11 },
            { x: cx - 2,  y: s.playerY - 10, vx: 0,    vy: -7, type: 'fire', w: 5, h: 11 },
            { x: cx + 5,  y: s.playerY - 8,  vx: 1.5,  vy: -7, type: 'fire', w: 5, h: 11 },
          )
          audioRef.current?.flameFire()
          s.weaponShots--
          if (s.weaponShots <= 0) s.weapon = 'normal'
        }

      } else {
        if (s.playerBullets.length < 3) {
          s.playerBullets.push({ x: s.playerX + PLAYER_W / 2 - BULLET_W / 2, y: s.playerY - BULLET_H, vx: 0, vy: -PLAYER_BULLET_SPEED, type: 'normal', w: BULLET_W, h: BULLET_H })
          audioRef.current?.shoot()
        }
      }
    }
    fireWeaponRef.current = doFire

    // ── Input ──
    const onKey = (e, down) => {
      stateRef.current.keys[e.code] = down
      if (down && (e.code === 'Space' || e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD' || e.code === 'KeyS')) {
        e.preventDefault()
      }
      if (down && e.code === 'KeyP') {
        e.preventDefault()
        const s = stateRef.current
        if (s.phase === 'playing') s.paused = !s.paused
      }
      if (down && e.code === 'Space') {
        const s = stateRef.current
        if (s.phase === 'start' || s.phase === 'gameover' || s.phase === 'win') {
          stateRef.current = initGame()
          stateRef.current.phase = 'playing'
          return
        }
        if (s.phase === 'playing' && !s.paused) doFire(s)
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
      if (s.phase === 'start' || s.phase === 'gameover' || s.phase === 'win') {
        audioRef.current?.stopUFO()
        return
      }
      if (s.paused) {
        return
      }
      if (s.phase === 'dead') {
        audioRef.current?.stopUFO()
        s.phaseTimer -= dt
        if (s.phaseTimer <= 0) s.phase = 'playing'
        return
      }
      if (s.phase === 'levelup') {
        audioRef.current?.stopUFO()
        s.phaseTimer -= dt
        if (s.phaseTimer <= 0) {
          const next = initGame()
          next.score = s.score
          next.hiScore = s.hiScore
          next.lives = s.lives
          next.level = s.level + 1
          next.weapon = s.weapon
          next.weaponShots = s.weaponShots
          next.combo = s.combo
          next.comboTimer = s.comboTimer
          next.phase = 'playing'
          // speed up aliens
          next.marchInterval = Math.max(80, 600 - (s.level) * 60)
          stateRef.current = next
        }
        return
      }

      s.flash = Math.max(0, s.flash - dt)
      s.playerInvincible = Math.max(0, s.playerInvincible - dt)
      s.shieldHit = Math.max(0, s.shieldHit - dt)

      // Combo decay
      s.comboTimer -= dt
      if (s.comboTimer <= 0) {
        s.combo = 0
      }

      // Shield energy drain / recharge
      const shieldOn = !!s.keys['KeyS'] && s.shieldEnergy > 0
      if (shieldOn) {
        s.shieldEnergy = Math.max(0, s.shieldEnergy - 22 * dt / 1000)
      } else {
        s.shieldEnergy = Math.min(100, s.shieldEnergy + 12 * dt / 1000)
      }

      // Update explosion particles
      s.playerParticles = s.playerParticles
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.08, life: p.life - dt / 800 }))
        .filter(p => p.life > 0)
      s.ufoParticles = s.ufoParticles
        .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.05, life: p.life - dt / 900 }))
        .filter(p => p.life > 0)

      // Player movement
      const left = s.keys['ArrowLeft'] || s.keys['KeyA']
      const right = s.keys['ArrowRight'] || s.keys['KeyD']
      if (left) s.playerX = Math.max(0, s.playerX - PLAYER_SPEED)
      if (right) s.playerX = Math.min(W - PLAYER_W, s.playerX + PLAYER_SPEED)

      // Move player bullets
      s.playerBullets = s.playerBullets.filter(b => {
        // Heat-seeking for missiles
        if (b.type === 'missile') {
          const alive = s.aliens.filter(a => a.alive)
          if (alive.length > 0) {
            // Find closest alien
            let closest = alive[0]
            let minDist = Infinity
            for (const a of alive) {
              const dx = (a.x + ALIEN_W / 2) - (b.x + 5)
              const dy = (a.y + ALIEN_H / 2) - (b.y + 11)
              const dist = dx * dx + dy * dy
              if (dist < minDist) {
                minDist = dist
                closest = a
              }
            }
            // Move towards target
            const tx = closest.x + ALIEN_W / 2
            const ty = closest.y + ALIEN_H / 2
            const dx = tx - (b.x + 5)
            const dy = ty - (b.y + 11)
            const dist = Math.sqrt(dx * dx + dy * dy)
            if (dist > 0) {
              const speed = 5.5
              b.vx = (dx / dist) * speed
              b.vy = (dy / dist) * speed
            }
          }
        }
        b.x += b.vx || 0
        b.y += b.vy !== undefined ? b.vy : -PLAYER_BULLET_SPEED
        return b.y + (b.h || BULLET_H) > 0 && b.x > -20 && b.x < W + 20
      })

      // Move alien bullets
      s.alienBullets = s.alienBullets.filter(b => {
        b.x += b.vx || 0
        b.y += b.vy !== undefined ? b.vy : ALIEN_BULLET_SPEED
        return b.y < H + 10 && b.x > -10 && b.x < W + 10
      })

      // UFO
      s.ufoTimer += dt
      if (s.ufoTimer > 20000 && !s.ufo) {
        s.ufo = { x: -60, y: 30, dir: 1, points: [50, 100, 150, 300][Math.floor(Math.random() * 4)] }
        s.ufoTimer = 0
        audioRef.current?.startUFO()
      }
      if (s.ufo) {
        s.ufo.x += s.ufo.dir * 2
        if (s.ufo.x > W + 60) { audioRef.current?.stopUFO(); s.ufo = null }
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
        const bw = b.w || BULLET_W, bh = b.h || BULLET_H
        for (const a of s.aliens) {
          if (!a.alive) continue
          if (b.x < a.x + ALIEN_W && b.x + bw > a.x && b.y < a.y + ALIEN_H && b.y + bh > a.y) {
            a.alive = false
            const comboMultiplier = 1 + Math.floor(s.combo / 5) * 0.1
            s.score += Math.floor(a.points * comboMultiplier)
            s.combo++
            s.comboTimer = 2500  // reset timer on kill
            if (s.score > s.hiScore) { s.hiScore = s.score; saveHiScore(s.hiScore) }
            s.flash = 80
            audioRef.current?.explosion()
            if (b.piercing > 0) { b.piercing--; continue }
            return false
          }
        }
        // vs UFO
        if (s.ufo) {
          if (b.x < s.ufo.x + 48 && b.x + bw > s.ufo.x && b.y < s.ufo.y + 20 && b.y + bh > s.ufo.y) {
            killUFO(s)
            return false
          }
        }
        // vs shields
        for (const shield of s.shields) {
          for (const block of shield.blocks) {
            const sx = shield.x + block.c * 8, sy = shield.y + block.r * 8
            if (b.x < sx + 8 && b.x + bw > sx && b.y < sy + 8 && b.y + bh > sy && block.hp > 0) {
              block.hp--
              return false
            }
          }
        }
        return true
      })

      // ── Collision: alien bullets vs player / shield ──
      if (s.playerInvincible <= 0) {
        s.alienBullets = s.alienBullets.filter(b => {
          // Shield dome check (semicircle above player)
          if (s.keys['KeyS'] && s.shieldEnergy > 0) {
            const cx = s.playerX + PLAYER_W / 2
            const cy = s.playerY + 4
            const dx = (b.x + BULLET_W / 2) - cx
            const dy = (b.y + BULLET_H / 2) - cy
            if (dx * dx + dy * dy <= 38 * 38 && b.y < cy + 10) {
              s.shieldHit = 180
              return false
            }
          }
          const hit = b.x < s.playerX + PLAYER_W && b.x + BULLET_W > s.playerX &&
            b.y < s.playerY + PLAYER_H && b.y + BULLET_H > s.playerY
          if (hit) {
            s.lives--
            s.playerInvincible = 2500
            audioRef.current?.playerHit()
            // spawn explosion particles
            const px = s.playerX + PLAYER_W / 2
            const py = s.playerY + PLAYER_H / 2
            const colors = ['#00ff88', '#ffffff', '#ffdd00', '#ff8800', '#ff4400']
            s.playerParticles = Array.from({ length: 22 }, () => {
              const angle = Math.random() * Math.PI * 2
              const speed = 1.5 + Math.random() * 3.5
              return {
                x: px + (Math.random() - 0.5) * PLAYER_W,
                y: py + (Math.random() - 0.5) * PLAYER_H,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                size: 2 + Math.random() * 3,
                color: colors[Math.floor(Math.random() * colors.length)],
              }
            })
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

      // ── Weapon pickup fall + catch ──
      if (s.weaponPickup) {
        s.weaponPickup.y += PICKUP_FALL_SPEED
        const p = s.weaponPickup
        if (p.x < s.playerX + PLAYER_W && p.x + 44 > s.playerX &&
            p.y + 28 > s.playerY && p.y < s.playerY + PLAYER_H) {
          if (p.type === 'life') {
            s.lives = Math.min(s.lives + 1, 5)
          } else {
            s.weapon = p.type
            s.weaponShots = WEAPON_SHOTS
          }
          s.weaponPickup = null
          audioRef.current?.pickupCollect()
        } else if (s.weaponPickup && s.weaponPickup.y > H + 30) {
          s.weaponPickup = null
        }
      }

      // Age lasers
      s.lasers = s.lasers.map(l => ({ ...l, life: l.life - dt })).filter(l => l.life > 0)
    }

    // ── Draw helpers ──
    function drawParticles(ctx, particles) {
      particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size)
      })
      ctx.globalAlpha = 1
    }

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

    function drawPlayerShield(ctx, s, time) {
      const shieldOn = s.keys['KeyS'] && s.shieldEnergy > 0
      if (!shieldOn && s.shieldHit <= 0) return
      const cx = s.playerX + PLAYER_W / 2
      const cy = s.playerY + 4
      const r = 38
      const hitFlash = s.shieldHit > 0
      const pulse = 0.75 + 0.25 * Math.sin(time / 120)
      // always fully visible while S is held; fades only on hit-flash decay
      const alpha = hitFlash ? 0.95 : shieldOn ? pulse : pulse * 0.3
      const color = hitFlash ? `rgba(255,80,80,${alpha})` : `rgba(0,180,255,${alpha})`
      const glowColor = hitFlash ? `rgba(255,80,80,${alpha * 0.25})` : `rgba(0,120,255,${alpha * 0.2})`
      // outer glow ring
      ctx.beginPath()
      ctx.arc(cx, cy, r + 4, Math.PI, 0)
      ctx.strokeStyle = glowColor
      ctx.lineWidth = 8
      ctx.stroke()
      // main dome arc
      ctx.beginPath()
      ctx.arc(cx, cy, r, Math.PI, 0)
      ctx.strokeStyle = color
      ctx.lineWidth = 2.5
      ctx.stroke()
      // fill
      ctx.beginPath()
      ctx.arc(cx, cy, r, Math.PI, 0)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
      ctx.fillStyle = hitFlash ? `rgba(255,80,80,0.08)` : `rgba(0,150,255,0.07)`
      ctx.fill()
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
      s.playerBullets.forEach(b => {
        if (b.type === 'missile') {
          // nose
          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.moveTo(b.x + 5, b.y)
          ctx.lineTo(b.x, b.y + 7)
          ctx.lineTo(b.x + 10, b.y + 7)
          ctx.closePath()
          ctx.fill()
          // body
          ctx.fillStyle = '#ffdd00'
          ctx.fillRect(b.x + 2, b.y + 7, 6, 11)
          // fins
          ctx.fillStyle = '#ff8800'
          ctx.fillRect(b.x, b.y + 14, 3, 6)
          ctx.fillRect(b.x + 7, b.y + 14, 3, 6)
          // exhaust
          ctx.fillStyle = `rgba(255,140,0,${0.5 + 0.5 * Math.sin(Date.now() / 40)})`
          ctx.fillRect(b.x + 2, b.y + 20, 6, 4)
        } else if (b.type === 'fire') {
          const pulse = 0.7 + 0.3 * Math.sin(Date.now() / 60 + b.x)
          ctx.fillStyle = `rgba(255,120,0,${pulse})`
          ctx.fillRect(b.x, b.y, b.w, b.h)
          ctx.fillStyle = `rgba(255,230,0,${pulse * 0.8})`
          ctx.fillRect(b.x + 1, b.y + 2, b.w - 2, b.h - 4)
        } else {
          ctx.fillStyle = '#fff'
          ctx.fillRect(b.x, b.y, b.w || BULLET_W, b.h || BULLET_H)
        }
      })
      ctx.fillStyle = '#ff4444'
      s.alienBullets.forEach(b => {
        ctx.fillRect(b.x, b.y, BULLET_W, 8)
        ctx.fillRect(b.x + 2, b.y + 4, BULLET_W, 4)
      })
    }

    function drawPickup(ctx, pickup, time) {
      if (!pickup) return
      const { x, y, type } = pickup
      const COLORS = { missile: '#ffdd00', fire: '#ff6600', laser: '#00ffff', life: '#00ff88' }
      const LABELS = { missile: 'MISSILE', fire: 'FIRE', laser: 'LASER', life: '1UP' }
      const color = COLORS[type]
      const pulse = 0.6 + 0.4 * Math.sin(time / 180)
      ctx.fillStyle = 'rgba(0,0,0,0.8)'
      ctx.fillRect(x, y, 44, 28)
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(x, y, 44, 28)
      ctx.globalAlpha = pulse * 0.5
      ctx.strokeStyle = color
      ctx.lineWidth = 6
      ctx.strokeRect(x - 3, y - 3, 50, 34)
      ctx.globalAlpha = 1
      ctx.fillStyle = color
      ctx.font = 'bold 10px "Courier New"'
      ctx.textAlign = 'center'
      ctx.fillText(LABELS[type], x + 22, y + 18)
      ctx.textAlign = 'left'
      // drop arrow
      ctx.globalAlpha = pulse
      ctx.fillStyle = color
      ctx.fillRect(x + 20, y + 31, 3, 6)
      ctx.fillRect(x + 18, y + 36, 7, 2)
      ctx.globalAlpha = 1
    }

    function drawLasers(ctx, lasers) {
      const beamH = H - 36  // stop at the ground line
      lasers.forEach(l => {
        const a = l.life / l.maxLife
        ctx.fillStyle = `rgba(0,160,255,${a * 0.12})`
        ctx.fillRect(l.x - 14, 0, 28, beamH)
        ctx.fillStyle = `rgba(80,200,255,${a * 0.5})`
        ctx.fillRect(l.x - 4, 0, 8, beamH)
        ctx.fillStyle = `rgba(200,240,255,${a * 0.85})`
        ctx.fillRect(l.x - 1, 0, 3, beamH)
        ctx.fillStyle = `rgba(255,255,255,${a})`
        ctx.fillRect(l.x, 0, 1, beamH)
      })
    }

    function drawHUD(ctx, s) {
      ctx.fillStyle = '#00ff88'
      ctx.font = 'bold 22px "Courier New"'
      ctx.fillText(`SCORE: ${s.score}`, 20, 32)
      ctx.fillText(`HI: ${s.hiScore}`, W / 2 - 60, 32)
      ctx.fillText(`LEVEL: ${s.level}`, W - 150, 32)
      // lives
      for (let i = 0; i < s.lives; i++) {
        const lx = 20 + i * 34, ly = H - 20
        ctx.fillStyle = '#00ff88'
        ctx.fillRect(lx + 8, ly - 12, 14, 8)
        ctx.fillRect(lx + 11, ly - 16, 8, 6)
        ctx.fillRect(lx, ly - 4, 10, 6)
        ctx.fillRect(lx + 20, ly - 4, 10, 6)
      }
      // shield energy bar
      const barW = 80, barH = 6, barX = W - 110, barY = H - 28
      ctx.fillStyle = '#003344'
      ctx.fillRect(barX, barY, barW, barH)
      const energyColor = s.shieldEnergy > 50 ? '#00ccff' : s.shieldEnergy > 20 ? '#ffaa00' : '#ff4444'
      ctx.fillStyle = energyColor
      ctx.fillRect(barX, barY, barW * (s.shieldEnergy / 100), barH)
      ctx.strokeStyle = '#0088aa'
      ctx.lineWidth = 1
      ctx.strokeRect(barX, barY, barW, barH)
      ctx.fillStyle = '#0099cc'
      ctx.font = '10px "Courier New"'
      ctx.fillText('S-SHIELD', barX, barY - 3)
      // active weapon indicator
      if (s.weapon !== 'normal') {
        const WCOLORS = { missile: '#ffdd00', fire: '#ff6600', laser: '#00ffff' }
        const wc = WCOLORS[s.weapon]
        ctx.fillStyle = wc
        ctx.fillRect(148, H - 26, 6, 6)
        ctx.font = 'bold 12px "Courier New"'
        ctx.fillText(`${s.weapon.toUpperCase()} x${s.weaponShots}`, 158, H - 19)
      }
      // combo display
      if (s.combo > 0) {
        const comboMult = 1 + Math.floor(s.combo / 5) * 0.1
        const comboColor = s.combo >= 20 ? '#ff00ff' : s.combo >= 10 ? '#ffff00' : '#ff6600'
        ctx.fillStyle = comboColor
        ctx.font = 'bold 16px "Courier New"'
        ctx.textAlign = 'center'
        ctx.fillText(`COMBO x${s.combo} (${comboMult.toFixed(1)}x)`, W / 2, H - 52)
        ctx.textAlign = 'left'
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
        ctx.fillText('SPACE to shoot  |  P to pause', W / 2, H / 2 + 10)
        ctx.fillStyle = '#00ccff'
        ctx.fillText('S to activate shield', W / 2, H / 2 + 36)
        ctx.fillStyle = '#ffdd00'
        ctx.fillText('Build combos for score multiplier!', W / 2, H / 2 + 62)
        if (Math.floor(time / 600) % 2 === 0) {
          ctx.fillStyle = '#fff'
          ctx.font = 'bold 22px "Courier New"'
          ctx.fillText('PRESS SPACE OR TAP FIRE TO START', W / 2, H / 2 + 105)
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
      if (s.paused) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        ctx.fillRect(0, 0, W, H)
        ctx.textAlign = 'center'
        ctx.fillStyle = '#00ccff'
        ctx.font = 'bold 48px "Courier New"'
        ctx.fillText('PAUSED', W / 2, H / 2 - 20)
        ctx.fillStyle = '#fff'
        ctx.font = '18px "Courier New"'
        if (Math.floor(time / 600) % 2 === 0) {
          ctx.fillText('PRESS P TO RESUME', W / 2, H / 2 + 40)
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
      drawParticles(ctx, s.ufoParticles)
      drawPickup(ctx, s.weaponPickup, time)
      drawLasers(ctx, s.lasers)
      drawBullets(ctx, s)
      drawPlayer(ctx, s)
      drawParticles(ctx, s.playerParticles)
      drawPlayerShield(ctx, s, time)
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

  const touchShield = useCallback((active) => {
    if (stateRef.current) stateRef.current.keys['KeyS'] = active
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
    if (s.phase === 'playing') fireWeaponRef.current?.(s)
  }, [initGame])

  const touchPause = useCallback(() => {
    const s = stateRef.current
    if (s && s.phase === 'playing') {
      s.paused = !s.paused
    }
  }, [])

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

        {/* Shield button */}
        <button
          style={{ ...btnBase, width: 80, height: 72, fontSize: 12, letterSpacing: 1, border: '2px solid #00ccff88', color: '#00ccff', background: 'rgba(0,180,255,0.1)' }}
          onTouchStart={e => { e.preventDefault(); touchShield(true) }}
          onTouchEnd={e => { e.preventDefault(); touchShield(false) }}
          onTouchCancel={e => { e.preventDefault(); touchShield(false) }}
          onMouseDown={() => touchShield(true)}
          onMouseUp={() => touchShield(false)}
          onMouseLeave={() => touchShield(false)}
        >🛡️<br />SHIELD</button>

        {/* Pause button */}
        <button
          style={{ ...btnBase, width: 72, height: 72, fontSize: 10, letterSpacing: 0.5, border: '2px solid #ffaa0088', color: '#ffaa00', background: 'rgba(255,170,0,0.1)' }}
          onTouchStart={e => { e.preventDefault(); touchPause() }}
          onMouseDown={touchPause}
        >⏸<br />PAUSE</button>

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
