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
import { useEffect, useMemo, useState } from 'react'

import { useTheme } from '@/context/theme-provider'

/**
 * Big-screen chart palette that follows the app theme (light / dark /
 * system, including theme presets). Theme CSS variables are oklch or
 * color-mix values, which ECharts gradients cannot parse — so each value is
 * round-tripped through a canvas `fillStyle` assignment, which normalizes
 * any CSS color the browser supports into `#rrggbb` / `rgba(...)` form.
 *
 * Read from `document.body`: the dark class lives on <html> and theme
 * presets are applied via `data-theme-preset` on <body>, so body sees the
 * final cascade. The object is re-created whenever the resolved theme
 * flips, which makes every chart rebuild through its effect deps.
 */
export type ScreenChartTheme = {
  /** 'light' | 'dark' — part of effect deps to force option rebuilds. */
  mode: 'light' | 'dark'
  /** Active theme preset id (body[data-theme-preset]) — same rebuild role. */
  preset: string | null
  /** Six series colors from --chart-1..5 plus --primary. */
  series: string[]
  background: string
  card: string
  textTitle: string
  textMain: string
  textSub: string
  accent: string
  warn: string
  danger: string
  up: string
}

function normalizeColor(cssColor: string): string {
  if (!cssColor) return cssColor
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return cssColor
  ctx.fillStyle = '#123456'
  ctx.fillStyle = cssColor
  const normalized = ctx.fillStyle
  // Invalid values keep the sentinel; fall back to the raw string then.
  return typeof normalized === 'string' &&
    normalized.toLowerCase() !== '#123456'
    ? normalized
    : cssColor
}

export function useScreenTheme(): ScreenChartTheme {
  const { resolvedTheme } = useTheme()
  const mode = resolvedTheme === 'dark' ? 'dark' : 'light'

  // Theme presets swap via `data-theme-preset` on <body> without touching
  // the resolved light/dark mode — track the attribute so the palette
  // re-reads and every chart rebuilds with the new colors.
  const [preset, setPreset] = useState<string | null>(() =>
    document.body.getAttribute('data-theme-preset')
  )
  useEffect(() => {
    const sync = () => setPreset(document.body.getAttribute('data-theme-preset'))
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-theme-preset'],
    })
    return () => observer.disconnect()
  }, [])

  return useMemo(() => {
    const cs = getComputedStyle(document.body)
    const read = (name: string) => normalizeColor(cs.getPropertyValue(name).trim())
    return {
      mode,
      preset,
      series: [
        read('--chart-1'),
        read('--chart-2'),
        read('--chart-3'),
        read('--chart-4'),
        read('--chart-5'),
        read('--primary'),
      ],
      background: read('--background'),
      card: read('--card'),
      textTitle: read('--foreground'),
      textMain: read('--foreground'),
      textSub: read('--muted-foreground'),
      accent: read('--primary'),
      warn: read('--chart-4'),
      danger: read('--destructive'),
      up: read('--success'),
    }
  }, [mode, preset])
}
