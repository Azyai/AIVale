/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied WARRANTY of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { BrandOrb } from '@/components/layout/components/header-logo'
import { cn } from '@/lib/utils'

/* Orbiting model chips — the models the gateway currently routes. */
const ORBIT_CHIPS = [
  '千问 125B',
  'Qwen3.8-Flash',
  'MiniMax H3',
  'DeepSeek',
  'GLM',
  'Claude',
  'GPT',
  'Kimi',
  'Gemini',
  'Llama',
  'Mistral',
  '私有算力 · 规划',
] as const

/* The swarm is desktop-only decoration; the CSS hides it behind the same gate. */
const SWARM_QUERY = '(min-width: 1024px)'
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

/** Deterministic pseudo-random in [0,1) per chip, so a resize never reshuffles. */
function seeded(index: number, salt: number) {
  const x = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2

type ChipMode = 'orbit' | 'drift' | 'return'

type Chip = {
  /** Track geometry: a tilted ellipse whose radius is woven by a sine, so the
   * path reads as an S-curve rather than a plain circle. */
  phase: number
  speed: number
  rxF: number
  ryF: number
  tilt: number
  weave: number
  weavePhase: number
  rx: number
  ry: number
  mode: ChipMode
  timer: number
  x: number
  y: number
  vx: number
  vy: number
  fromX: number
  fromY: number
  progress: number
  duration: number
  depth: number
}

function buildChips(): Chip[] {
  return ORBIT_CHIPS.map((_, i) => {
    const r1 = seeded(i, 1)
    const r2 = seeded(i, 2)
    const r3 = seeded(i, 3)
    const r4 = seeded(i, 4)
    return {
      phase: (i / ORBIT_CHIPS.length) * Math.PI * 2 + r1 * 0.7,
      speed: 0.1 + r2 * 0.055,
      rxF: 0.78 + r3 * 0.5,
      ryF: 0.3 + r4 * 0.3,
      tilt: (r1 - 0.5) * 0.9,
      weave: 0.1 + r2 * 0.15,
      weavePhase: r3 * Math.PI * 2,
      rx: 0,
      ry: 0,
      mode: 'orbit' as ChipMode,
      timer: 6 + r4 * 14,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      fromX: 0,
      fromY: 0,
      progress: 0,
      duration: 0,
      depth: 0,
    }
  })
}

/**
 * The hero's little solar system, all sharing one anchor: the brand orb as a
 * dim sun low-left of the headline, a dashed corona ring, and the model chips
 * as planets. Each chip rides its own tilted, S-woven ellipse; every so often
 * it breaks orbit, diffuses outward at random, then eases back onto the track.
 * Purely decorative, and painted below the starfield canvas.
 */
export function HeroBrandSystem() {
  const { t } = useTranslation()
  const layerRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<Array<HTMLSpanElement | null>>([])

  useEffect(() => {
    const layer = layerRef.current
    const ring = ringRef.current
    if (!layer || !ring) return

    const swarmMedia = window.matchMedia(SWARM_QUERY)
    const reduced = window.matchMedia(REDUCED_QUERY).matches
    const chips = buildChips()

    // The orbit radius is read off the rendered corona ring (its diameter is
    // 1.5 × --orbit-r), so chips and ring can never disagree about the size of
    // the system.
    const measure = () => {
      const radius = ring.getBoundingClientRect().width / 1.5
      for (const c of chips) {
        c.rx = radius * c.rxF
        c.ry = c.rx * c.ryF
      }
    }

    const orbitPoint = (c: Chip, elapsed: number) => {
      const th = c.phase + c.speed * elapsed
      const w = 1 + c.weave * Math.sin(2 * th + c.weavePhase)
      const ex = c.rx * w * Math.cos(th)
      const ey = c.ry * w * Math.sin(th)
      return {
        x: ex * Math.cos(c.tilt) - ey * Math.sin(c.tilt),
        y: ex * Math.sin(c.tilt) + ey * Math.cos(c.tilt),
        depth: Math.sin(th),
      }
    }

    // Depth drives scale and opacity so chips read as passing in front of and
    // behind the sun; a drifting one fades further while it diffuses.
    const paint = (c: Chip, node: HTMLSpanElement, fade: number) => {
      const near = c.depth * 0.5 + 0.5
      const scale = (0.78 + 0.26 * near) * (1 + 0.08 * (1 - fade))
      // translate(-50%,-50%) puts the chip's own centre on the orbit point;
      // scale comes last so it grows around that centre.
      node.style.transform = `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`
      node.style.opacity = ((0.34 + 0.56 * near) * fade).toFixed(3)
    }

    let raf = 0
    let last = 0
    let elapsed = 0
    let inView = true

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      if (document.hidden || !inView) {
        last = now
        return
      }
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0)
      last = now
      elapsed += dt

      for (let i = 0; i < chips.length; i++) {
        const c = chips[i]
        const node = chipsRef.current[i]
        if (!c || !node) continue
        const target = orbitPoint(c, elapsed)
        let fade = 1

        if (c.mode === 'orbit') {
          c.x = target.x
          c.y = target.y
          c.depth = target.depth
          c.timer -= dt
          if (c.timer <= 0) {
            // Slung off the track: outward along the radius plus a tangential
            // kick, so the diffusion continues the sense of rotation.
            const len = Math.hypot(c.x, c.y) || 1
            const push = 34 + seeded(i, 7) * 46
            c.vx = (c.x / len) * push - (c.y / len) * push * 0.35
            c.vy = (c.y / len) * push + (c.x / len) * push * 0.35
            c.mode = 'drift'
            c.timer = 1.8 + seeded(i, 8) * 1.6
          }
        } else if (c.mode === 'drift') {
          const damp = Math.max(0, 1 - 1.1 * dt)
          c.vx *= damp
          c.vy *= damp
          c.x += c.vx * dt
          c.y += c.vy * dt
          c.depth = target.depth
          fade = 0.5
          c.timer -= dt
          if (c.timer <= 0) {
            c.mode = 'return'
            c.fromX = c.x
            c.fromY = c.y
            c.progress = 0
            c.duration = 1.6 + seeded(i, 9) * 1.2
          }
        } else {
          c.progress = Math.min(1, c.progress + dt / c.duration)
          const e = easeInOutCubic(c.progress)
          c.x = c.fromX + (target.x - c.fromX) * e
          c.y = c.fromY + (target.y - c.fromY) * e
          c.depth = target.depth
          fade = 0.5 + 0.5 * e
          if (c.progress >= 1) {
            c.mode = 'orbit'
            c.timer = 7 + seeded(i, 11) * 13
          }
        }

        paint(c, node, fade)
      }
    }

    /** Reduced motion: park the chips along their tracks and never animate. */
    const paintStatic = () => {
      measure()
      for (let i = 0; i < chips.length; i++) {
        const c = chips[i]
        const node = chipsRef.current[i]
        if (!c || !node) continue
        const p = orbitPoint(c, 0)
        c.x = p.x
        c.y = p.y
        c.depth = p.depth
        paint(c, node, 1)
      }
    }

    const start = () => {
      cancelAnimationFrame(raf)
      if (!swarmMedia.matches) return
      measure()
      if (reduced) {
        paintStatic()
        return
      }
      last = 0
      raf = requestAnimationFrame(frame)
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        inView = entry?.isIntersecting ?? true
      },
      { threshold: 0.02 }
    )
    io.observe(layer)

    let rzT: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(rzT)
      rzT = setTimeout(start, 150)
    }
    window.addEventListener('resize', onResize)
    swarmMedia.addEventListener('change', onResize)
    start()

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', onResize)
      swarmMedia.removeEventListener('change', onResize)
      clearTimeout(rzT)
    }
  }, [])

  return (
    <div
      ref={layerRef}
      aria-hidden
      className='hero-sun-layer pointer-events-none absolute inset-0 z-0 overflow-hidden'
    >
      <div className='hero-system'>
        <div className='hero-sun-halo' />
        <div className='hero-sun'>
          <BrandOrb className='hero-sun-core size-full' />
        </div>
        <div ref={ringRef} className='hero-orbit-ring' />
        <div className='hero-swarm'>
          {ORBIT_CHIPS.map((chip, i) => (
            <span
              key={chip}
              ref={(el) => {
                chipsRef.current[i] = el
              }}
              className={cn(
                'hero-chip hero-swarm-chip font-mono',
                chip.includes('私有') &&
                  'border-dashed text-muted-foreground/70'
              )}
            >
              {chip.includes('私有') ? t(chip) : chip}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Starfield + flowing data lanes on a canvas, mirroring the keynote cover:
 * drifting stars, three sine lanes of comet dots (violet/cyan), click
 * ripples. Pauses when off-screen and honors reduced motion.
 */
export function HeroParticles() {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const parent = canvas.parentElement
    if (!parent) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    let W = 0
    let H = 0
    let visible = true
    let raf = 0

    type Star = { x: number; y: number; r: number; vx: number; vy: number; ph: number }
    type Dot = { x: number; sp: number; sz: number }
    type Lane = { y0: number; amp: number; freq: number; hue: 'v' | 'c'; dots: Dot[] }
    type Ripple = { x: number; y: number; r: number }

    const stars: Star[] = []
    const lanes: Lane[] = []
    const ripples: Ripple[] = []

    // Pre-rendered radial-gradient sprites for the comet dots (one per hue).
    const sprite = (r: number, g: number, b: number) => {
      const c = document.createElement('canvas')
      c.width = c.height = 64
      const x = c.getContext('2d')
      if (!x) return c
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32)
      gr.addColorStop(0, `rgba(${r},${g},${b},.9)`)
      gr.addColorStop(0.4, `rgba(${r},${g},${b},.28)`)
      gr.addColorStop(1, `rgba(${r},${g},${b},0)`)
      x.fillStyle = gr
      x.fillRect(0, 0, 64, 64)
      return c
    }
    const spV = sprite(167, 139, 250)
    const spC = sprite(56, 224, 246)

    const initField = () => {
      stars.length = 0
      lanes.length = 0
      const nStar = reduced ? 40 : 90
      for (let i = 0; i < nStar; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 0.4 + Math.random() * 1.1,
          vx: -0.06 - Math.random() * 0.12,
          vy: (Math.random() - 0.5) * 0.1,
          ph: Math.random() * 6.28,
        })
      }
      ;[0.28, 0.5, 0.72].forEach((f, i) => {
        lanes.push({
          y0: H * f,
          amp: 22 + i * 8,
          freq: 0.003 + i * 0.0004,
          hue: i % 2 ? 'c' : 'v',
          dots: [],
        })
      })
      for (const l of lanes) {
        const n = reduced ? 5 : 13
        for (let i = 0; i < n; i++) {
          l.dots.push({
            x: Math.random() * W,
            sp: 34 + Math.random() * 40,
            sz: 7 + Math.random() * 9,
          })
        }
      }
    }

    const sizeHero = () => {
      const rect = parent.getBoundingClientRect()
      W = rect.width
      H = rect.height
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    const draw = (now: number) => {
      if (!visible) return
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0,0,0,.16)'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      for (const s of stars) {
        s.x += s.vx
        s.y += s.vy
        if (s.x < -2) s.x = W + 2
        if (s.y < -2) s.y = H + 2
        if (s.y > H + 2) s.y = -2
        const a = 0.18 + 0.16 * Math.sin(now * 0.001 + s.ph)
        ctx.fillStyle = `rgba(214,222,255,${a})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, 6.29)
        ctx.fill()
      }
      const t = now * 0.0006
      for (const l of lanes) {
        for (const d of l.dots) {
          d.x += d.sp / 60
          if (d.x > W + 20) d.x = -20
          const y = l.y0 + Math.sin(d.x * l.freq + t) * l.amp
          ctx.drawImage(l.hue === 'v' ? spV : spC, d.x - d.sz / 2, y - d.sz / 2, d.sz, d.sz)
        }
      }
      for (let i = ripples.length - 1; i >= 0; i--) {
        const p = ripples[i]
        if (!p) continue
        p.r += 3.4
        const a = Math.max(0, 1 - p.r / 260)
        if (a <= 0) {
          ripples.splice(i, 1)
          continue
        }
        ctx.strokeStyle = `rgba(139,92,246,${a * 0.5})`
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, 6.29)
        ctx.stroke()
      }
      raf = requestAnimationFrame(draw)
    }

    const onClick = (e: MouseEvent) => {
      if (reduced) return
      const rect = parent.getBoundingClientRect()
      ripples.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, r: 0 })
    }

    sizeHero()
    initField()
    if (!reduced) {
      parent.addEventListener('click', onClick)
      raf = requestAnimationFrame(draw)
    } else {
      // Reduced motion: draw one static frame.
      draw(performance.now())
      cancelAnimationFrame(raf)
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        const vis = entry?.isIntersecting ?? true
        if (vis && !visible && !reduced) {
          visible = true
          raf = requestAnimationFrame(draw)
        } else if (!vis) {
          visible = false
          cancelAnimationFrame(raf)
        }
      },
      { threshold: 0.05 }
    )
    io.observe(parent)

    let rzT: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(rzT)
      rzT = setTimeout(() => {
        sizeHero()
        initField()
      }, 150)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      window.removeEventListener('resize', onResize)
      parent.removeEventListener('click', onClick)
      clearTimeout(rzT)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-label={t('星点与数据流背景')}
      className='pointer-events-none absolute inset-0 z-0 size-full'
    />
  )
}
