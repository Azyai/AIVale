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
  '私有算力 · 规划',
] as const

/**
 * The brand orb as the sun of the hero system: same vector mark as the header,
 * desaturated, blurred and dimmed so it reads as deep-space glow instead of a
 * sticker, with the model chips orbiting it as planets. Sits below the
 * starfield canvas so stars still twinkle in front of it.
 */
export function HeroBrandSun() {
  return (
    <div
      aria-hidden
      className='hero-sun-layer pointer-events-none absolute inset-0 z-0 overflow-hidden'
    >
      <div className='hero-sun-halo' />
      <div className='hero-sun'>
        <BrandOrb className='hero-sun-core size-full' />
      </div>
    </div>
  )
}

export function HeroOrbit() {
  const { t } = useTranslation()
  return (
    <div
      aria-hidden
      className='pointer-events-none absolute inset-0 z-0 hidden items-center justify-center lg:flex'
    >
      <div className='hero-orbit relative size-full'>
        <div className='hero-orbit-ring' />
        <div className='hero-orbit-spin'>
          {ORBIT_CHIPS.map((chip, i) => (
            <div
              key={chip}
              className='hero-orbit-slot'
              style={{ '--a': `${i * (360 / ORBIT_CHIPS.length)}deg` } as React.CSSProperties}
            >
              <span
                className={cn(
                  'hero-chip font-mono',
                  chip.includes('私有') && 'border-dashed text-muted-foreground/70'
                )}
              >
                {chip.includes('私有') ? t(chip) : chip}
              </span>
            </div>
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
