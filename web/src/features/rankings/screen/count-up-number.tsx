/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

type CountUpNumberProps = {
  /** Target value; rolls from the previous value whenever it changes. */
  value: number
  /** Render of the intermediate/final value (compact units, percent, ...). */
  format: (value: number) => string
  className?: string
}

const DURATION_MS = 1200

/**
 * KPI flip number: animates from the previous displayed value to the new one
 * with an easeOut curve (1.2s). Writes textContent directly instead of state
 * so the 60fps updates never re-render the screen.
 *
 * A timer fallback guarantees the final value lands even when rAF is
 * throttled (occluded or background tab).
 */
export function CountUpNumber(props: CountUpNumberProps) {
  const { value, format, className } = props
  const spanRef = useRef<HTMLSpanElement>(null)
  const formatRef = useRef(format)
  formatRef.current = format

  useEffect(() => {
    const el = spanRef.current
    if (!el) return
    const to = Number.isFinite(value) ? value : 0
    const from = Number.parseFloat(el.dataset.numeric ?? '0') || 0
    el.dataset.numeric = String(to)

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
      .matches
    if (reduced || from === to) {
      el.textContent = formatRef.current(to)
      return
    }

    const t0 = performance.now()
    let raf = 0
    const frame = (t: number) => {
      const k = Math.min((t - t0) / DURATION_MS, 1)
      const eased = 1 - Math.pow(1 - k, 3)
      el.textContent = formatRef.current(from + (to - from) * eased)
      if (k < 1) raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const fallback = window.setTimeout(() => {
      el.textContent = formatRef.current(to)
    }, DURATION_MS + 400)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(fallback)
    }
  }, [value])

  return (
    <span
      ref={spanRef}
      data-numeric='0'
      className={cn('bsc-kpi-value', className)}
    >
      {format(0)}
    </span>
  )
}
