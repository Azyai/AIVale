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
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

import { formatTokens } from '../lib/format'
import type {
  ModelHistorySeries,
  ModelRanking,
  RankingMover,
  RegionPoint,
  RegionStat,
  UserRanking,
  VendorRanking,
} from '../types'
import { useEChart } from './use-echart'
import type { ScreenChartTheme } from './use-screen-theme'

/** Apply alpha to a normalized `#rrggbb` / `rgba(...)` color. */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith('#') && color.length >= 7) {
    const r = Number.parseInt(color.slice(1, 3), 16)
    const g = Number.parseInt(color.slice(3, 5), 16)
    const b = Number.parseInt(color.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  const m = color.match(/^rgba?\(([^)]+)\)$/i)
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
    }
  }
  return color
}

function verticalGradient(color: string, top: number, bottom: number) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: withAlpha(color, top) },
    { offset: 1, color: withAlpha(color, bottom) },
  ])
}

function horizontalGradient(color: string, head: number, tail: number) {
  return new echarts.graphic.LinearGradient(1, 0, 0, 0, [
    { offset: 0, color: withAlpha(color, head) },
    { offset: 1, color: withAlpha(color, tail) },
  ])
}

function tooltipBase(theme: ScreenChartTheme) {
  return {
    trigger: 'axis',
    backgroundColor: withAlpha(theme.background, 0.92),
    borderColor: withAlpha(theme.accent, 0.4),
    textStyle: { color: theme.textTitle, fontSize: 12 },
  } as const
}

/** Land with no traffic: a faint accent sheen at the top fading to almost
 * nothing, so empty provinces recede behind the ones carrying usage. */
function landGradient(theme: ScreenChartTheme) {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: withAlpha(theme.accent, 0.12) },
    { offset: 0.6, color: withAlpha(theme.textSub, 0.07) },
    { offset: 1, color: withAlpha(theme.textSub, 0.03) },
  ])
}

/** The landmass floats on a dark extrusion; on a light card a grey one reads
 * better than black. */
function landShadow(theme: ScreenChartTheme) {
  return theme.mode === 'dark'
    ? 'rgba(2, 6, 23, 0.6)'
    : withAlpha(theme.textSub, 0.3)
}

/** Choropleth ramp. Five stops instead of three so neighbouring provinces
 * differ by a shade rather than a step. */
function heatRamp(theme: ScreenChartTheme) {
  return [
    withAlpha(theme.accent, 0.14),
    withAlpha(theme.accent, 0.34),
    withAlpha(theme.series[1], 0.55),
    withAlpha(theme.series[1], 0.8),
    theme.series[1],
  ]
}

function axisLine(theme: ScreenChartTheme) {
  return { lineStyle: { color: withAlpha(theme.textSub, 0.35) } }
}

function splitLine(theme: ScreenChartTheme) {
  return { lineStyle: { color: withAlpha(theme.textSub, 0.12) } }
}

/** ECharts tooltip formatters receive a params union; flatten to one item. */
function firstParam(p: unknown): {
  name?: string
  value?: unknown
  percent?: number
} {
  const d = Array.isArray(p) ? p[0] : p
  return (d ?? {}) as { name?: string; value?: unknown; percent?: number }
}

function NoData() {
  const { t } = useTranslation()
  return <div className='bsc-chart-placeholder'>{t('No data')}</div>
}

/** Stable serialization of rank rows for effect deps: `[{name, tokens}]`
 * keyed by content, so parent re-renders (the 1s clock) that recreate the
 * array do not replay setOption and interrupt running chart animations. */
function serializeRows(rows: Array<{ name: string; tokens: number }>) {
  return JSON.stringify(rows)
}

/** Left / right columns: Top-N horizontal ranking bars (skill recipe 2). */
function RankBarChart(props: {
  loading: boolean
  theme: ScreenChartTheme
  rows: Array<{ name: string; tokens: number }>
  barColor: string
  onSelect?: (name: string) => void
}) {
  const { setContainer, setOption } = useEChart({ onClick: props.onSelect })
  const empty = props.rows.length === 0
  // Rows arrive as a fresh array every parent render; memoize on the
  // serialized content so the option effect below only re-runs when the
  // underlying data actually changed.
  const rowsKey = serializeRows(props.rows)
  const rows = useMemo(
    () => JSON.parse(rowsKey) as Array<{ name: string; tokens: number }>,
    [rowsKey]
  )

  useEffect(() => {
    if (empty) return
    const option: EChartsOption = {
      tooltip: {
        ...tooltipBase(props.theme),
        trigger: 'item',
        formatter: (p) => {
          const d = firstParam(p)
          return `${d.name ?? ''}<br/>tokens: <b>${formatTokens(Number(d.value ?? 0))}</b>`
        },
      },
      grid: { top: 10, left: 8, right: 64, bottom: 4, containLabel: true },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: rows.map((r) => r.name),
        axisLine: axisLine(props.theme),
        axisTick: { show: false },
        axisLabel: {
          color: props.theme.textMain,
          fontSize: 12,
          width: 132,
          overflow: 'truncate',
        },
        splitLine: { show: false },
      },
      series: [
        {
          type: 'bar',
          barWidth: 10,
          label: {
            show: true,
            position: 'right',
            color: props.barColor,
            fontWeight: 600,
            fontSize: 12,
            formatter: (p) => formatTokens(Number(p.value ?? 0)),
          },
          itemStyle: {
            borderRadius: 5,
            color: horizontalGradient(props.barColor, 1, 0.06),
          },
          data: rows.map((r) => r.tokens),
        },
      ],
    }
    setOption(option)
  }, [empty, rows, props.theme, props.barColor, setOption])

  if (!props.loading && empty) return <NoData />
  return <div ref={setContainer} className='bsc-chart' />
}

export function ModelRankChart(props: {
  loading: boolean
  theme: ScreenChartTheme
  rows: ModelRanking[]
}) {
  return (
    <RankBarChart
      loading={props.loading}
      theme={props.theme}
      rows={props.rows.map((r) => ({
        name: r.model_name,
        tokens: r.total_tokens,
      }))}
      barColor={props.theme.accent}
    />
  )
}

export function UserRankChart(props: {
  loading: boolean
  theme: ScreenChartTheme
  rows: UserRanking[]
}) {
  return (
    <RankBarChart
      loading={props.loading}
      theme={props.theme}
      rows={props.rows.map((r) => ({
        name: r.username,
        tokens: r.total_tokens,
      }))}
      barColor={props.theme.series[1]}
    />
  )
}

/** Bottom-left: vendor share rose with rotating highlight (skill recipe 3). */
export function VendorShareChart(props: {
  loading: boolean
  theme: ScreenChartTheme
  rows: VendorRanking[]
}) {
  const { t } = useTranslation()
  const { setContainer, setOption, chartRef } = useEChart()
  const empty = props.rows.length === 0
  // Content-keyed rows (fresh array identities from per-second parent
  // re-renders must not replay setOption; see RankBarChart). Normalized to
  // {name, tokens} so the parsed shape matches what the effect consumes.
  const rowsKey = serializeRows(
    props.rows.map((v) => ({ name: v.vendor, tokens: v.total_tokens }))
  )
  const rows = useMemo(
    () =>
      (JSON.parse(rowsKey) as Array<{ name: string; tokens: number }>).map(
        (r) => ({ vendor: r.name, total_tokens: r.tokens })
      ),
    [rowsKey]
  )

  useEffect(() => {
    if (empty) return
    const top = rows.slice(0, 5)
    const rest = rows.slice(5)
    const data: Array<{ name: string; value: number }> = top.map((v) => ({
      name: v.vendor,
      value: v.total_tokens,
    }))
    if (rest.length > 0) {
      data.push({
        name: t('Others'),
        value: rest.reduce((sum, v) => sum + v.total_tokens, 0),
      })
    }
    const option: EChartsOption = {
      tooltip: {
        ...tooltipBase(props.theme),
        trigger: 'item',
        formatter: (p) => {
          const d = firstParam(p)
          return `${d.name ?? ''}<br/><b>${formatTokens(Number(d.value ?? 0))}</b> (${d.percent ?? 0}%)`
        },
      },
      legend: {
        type: 'scroll',
        bottom: 0,
        left: 'center',
        itemGap: 14,
        textStyle: { color: props.theme.textSub, fontSize: 11 },
      },
      color: props.theme.series,
      series: [
        {
          type: 'pie',
          roseType: 'radius',
          radius: ['18%', '64%'],
          center: ['50%', '46%'],
          label: { color: props.theme.textMain, fontSize: 11, formatter: '{d}%' },
          labelLine: {
            lineStyle: { color: withAlpha(props.theme.textSub, 0.4) },
          },
          itemStyle: { borderColor: props.theme.card, borderWidth: 2 },
          data,
        },
      ],
    }
    setOption(option)
  }, [empty, rows, props.theme, setOption, t])

  // Rotate the rose highlight; skipped for reduced-motion users.
  useEffect(() => {
    if (empty || rows.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cur = 0
    const count = Math.min(rows.length, 6)
    const id = window.setInterval(() => {
      const chart = chartRef.current
      if (!chart) return
      chart.dispatchAction({ type: 'downplay', seriesIndex: 0 })
      chart.dispatchAction({
        type: 'highlight',
        seriesIndex: 0,
        dataIndex: cur,
      })
      cur = (cur + 1) % count
    }, 2400)
    return () => window.clearInterval(id)
  }, [empty, rows.length, chartRef])

  if (!props.loading && empty) return <NoData />
  return <div ref={setContainer} className='bsc-chart' />
}

/** Center: stacked token history by top models + glowing total line. */
export function TokenTrendChart(props: {
  loading: boolean
  theme: ScreenChartTheme
  history?: ModelHistorySeries
}) {
  const { t } = useTranslation()
  const { setContainer, setOption } = useEChart()
  const empty = !props.history || props.history.points.length === 0
  // Content-keyed history (points + models): a new object identity from a
  // parent re-render with identical content must not replay setOption.
  const historyKey = props.history
    ? JSON.stringify([
        props.history.points.map((p) => [p.label, p.model, p.tokens]),
        props.history.models.map((m) => m.name),
      ])
    : ''
  const history = useMemo(() => {
    if (!historyKey) return undefined
    const parsed = JSON.parse(historyKey) as [
      Array<[string, string, number]>,
      string[]
    ]
    return {
      points: parsed[0].map(([label, model, tokens]) => ({
        label,
        model,
        tokens,
      })),
      models: parsed[1].map((name) => ({ name })),
    }
  }, [historyKey])

  useEffect(() => {
    if (empty || !history) return

    const labels: string[] = []
    const labelIndex = new Map<string, number>()
    for (const p of history.points) {
      if (!labelIndex.has(p.label)) {
        labelIndex.set(p.label, labels.length)
        labels.push(p.label)
      }
    }
    const buckets = labels.length
    const zeroed = () => Array.from({ length: buckets }, () => 0)
    const topModels = history.models.slice(0, 5)
    const perModel = new Map<string, number[]>(
      topModels.map((m) => [m.name, zeroed()])
    )
    const others = zeroed()
    const totals = zeroed()
    for (const p of history.points) {
      const i = labelIndex.get(p.label)
      if (i === undefined) continue
      totals[i] += p.tokens
      const arr = perModel.get(p.model)
      if (arr) arr[i] += p.tokens
      else others[i] += p.tokens
    }
    const hasOthers = others.some((v) => v > 0)
    const seriesCount = topModels.length + (hasOthers ? 1 : 0)
    // Reserve series[1] for the total line so it never doubles a bar color.
    const barColor = (idx: number) =>
      idx === 0
        ? props.theme.series[0]
        : props.theme.series[Math.min(idx + 1, 5)]
    const lineColor = props.theme.series[1]

    const series: EChartsOption['series'] = [
      ...topModels.map((m, idx) => ({
        type: 'bar' as const,
        name: m.name,
        stack: 'tokens',
        barWidth: 12,
        itemStyle: {
          borderRadius: idx === seriesCount - 1 ? [4, 4, 0, 0] : 0,
          color: verticalGradient(barColor(idx), 0.9, 0.08),
        },
        data: perModel.get(m.name) ?? [],
      })),
      ...(hasOthers
        ? [
            {
              type: 'bar' as const,
              name: t('Others'),
              stack: 'tokens',
              barWidth: 12,
              itemStyle: {
                borderRadius: [4, 4, 0, 0] as [number, number, number, number],
                color: verticalGradient(props.theme.textSub, 0.55, 0.08),
              },
              data: others,
            },
          ]
        : []),
      {
        type: 'line',
        name: t('Total'),
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2.5,
          color: lineColor,
          shadowColor: withAlpha(lineColor, 0.6),
          shadowBlur: 12,
        },
        areaStyle: { color: verticalGradient(lineColor, 0.18, 0.02) },
        data: totals,
      },
    ]

    const option: EChartsOption = {
      tooltip: {
        ...tooltipBase(props.theme),
        valueFormatter: (v) => formatTokens(Number(v)),
      },
      legend: {
        type: 'scroll',
        textStyle: { color: props.theme.textSub, fontSize: 12 },
        itemWidth: 14,
        itemHeight: 8,
        top: 0,
        right: 0,
      },
      grid: { top: 36, left: 10, right: 14, bottom: 4, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: axisLine(props.theme),
        axisTick: { show: false },
        axisLabel: {
          color: props.theme.textSub,
          fontSize: 11,
          hideOverlap: true,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: axisLine(props.theme),
        axisTick: { show: false },
        axisLabel: {
          color: props.theme.textSub,
          fontSize: 12,
          formatter: (v: number) => formatTokens(v),
        },
        splitLine: splitLine(props.theme),
      },
      series,
    }
    setOption(option)
  }, [empty, history, props.theme, setOption, t])

  if (!props.loading && empty) return <NoData />
  return <div ref={setContainer} className='bsc-chart' />
}

/** Bottom-right: three concentration gauges (skill recipe 4). */
export function ConcentrationGauges(props: {
  loading: boolean
  theme: ScreenChartTheme
  modelTop10: number
  userTop10: number
  topVendor: number
}) {
  const { t } = useTranslation()
  const { setContainer, setOption } = useEChart()
  const empty =
    props.modelTop10 <= 0 && props.userTop10 <= 0 && props.topVendor <= 0

  useEffect(() => {
    if (empty) return
    const gauge = (
      centerX: string,
      color: string,
      value: number,
      title: string
    ) => ({
      type: 'gauge' as const,
      center: [centerX, '55%'],
      // Explicit radius + inward centers keep the outer rings fully inside
      // the canvas even at near-100% values (the arc spans 210°..-30°, so
      // its horizontal reach equals the radius). 72% is the width-bound
      // maximum for three gauges in this panel: centers sit at 25%..
      // 75% and the arc reaches exactly 5px from the canvas edge.
      radius: '72%',
      startAngle: 210,
      endAngle: -30,
      min: 0,
      max: 100,
      progress: { show: true, width: 12, itemStyle: { color } },
      axisLine: {
        lineStyle: {
          width: 12,
          color: [
            [1, withAlpha(props.theme.textSub, 0.15)] as [number, string],
          ],
        },
      },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { show: false },
      pointer: { show: false },
      anchor: { show: false },
      detail: {
        fontSize: 24,
        color,
        fontWeight: 700,
        formatter: (value: number) => `${value.toFixed(1)}%`,
        offsetCenter: [0, '10%'],
      },
      title: {
        show: true,
        offsetCenter: [0, '46%'],
        color: props.theme.textSub,
        fontSize: 12,
      },
      data: [{ value: Number(value.toFixed(1)), name: title }],
    })
    const option: EChartsOption = {
      series: [
        gauge('25%', props.theme.up, props.modelTop10, t('Top 10 Model Concentration')),
        gauge('50%', props.theme.accent, props.userTop10, t('Top 10 User Concentration')),
        gauge('75%', props.theme.warn, props.topVendor, t('Top Vendor Share')),
      ],
    }
    setOption(option)
  }, [empty, props.modelTop10, props.userTop10, props.topVendor, props.theme, setOption, t])

  if (!props.loading && empty) return <NoData />
  return <div ref={setContainer} className='bsc-chart' />
}

/**
 * Center: regional choropleth. `mapKey` is a GeoJSON already registered with
 * ECharts (see use-region-geo); it swaps between the national map and a
 * province's city map, so the container is keyed to force a fresh chart.
 */
export const MAP_LABEL_ZOOM = 2.2

/** Zoom a freshly mounted map starts at; re-reported whenever the geometry
 * swaps so the parent never keeps the previous scope's zoom level. */
const MAP_INITIAL_ZOOM = 1.14

export function RegionMapChart(props: {
  theme: ScreenChartTheme
  mapKey?: string
  rows: RegionStat[]
  showLabels: boolean
  onSelect?: (name: string) => void
  onZoom?: (zoom: number) => void
  fallback?: ReactNode
}) {
  const zoomRef = useRef(MAP_INITIAL_ZOOM)
  const centerRef = useRef<[number, number] | undefined>(undefined)
  const revealedRef = useRef(false)
  const onZoomRef = useRef(props.onZoom)
  onZoomRef.current = props.onZoom
  const { setContainer, setOption, chartRef } = useEChart({
    onClick: props.onSelect,
    onZoom: (zoom) => {
      zoomRef.current = zoom
      // Track the pan alongside the zoom so a later setOption can put the
      // viewer back exactly where they were (see the option effect below).
      const live = chartRef.current?.getOption() as
        | { series?: Array<{ center?: [number, number] }> }
        | undefined
      centerRef.current = live?.series?.[0]?.center
      // Roaming only transforms the map group, so label formatters do not run
      // again on their own. When the reveal threshold is crossed, merge the
      // label config back in — a merge (no replaceMerge) keeps the roam state.
      const revealed = zoom >= MAP_LABEL_ZOOM
      if (revealed !== revealedRef.current) {
        revealedRef.current = revealed
        const patch: EChartsOption = {
          series: [
            {
              type: 'map',
              map: props.mapKey ?? '',
              label: {
                formatter: (p) =>
                  p.value || zoomRef.current >= MAP_LABEL_ZOOM
                    ? String(p.name)
                    : '',
              },
            },
          ],
        }
        chartRef.current?.setOption(patch)
      }
      props.onZoom?.(zoom)
    },
  })

  useEffect(() => {
    zoomRef.current = MAP_INITIAL_ZOOM
    centerRef.current = undefined
    revealedRef.current = false
    onZoomRef.current?.(MAP_INITIAL_ZOOM)
  }, [props.mapKey])

  // Content-keyed: the 1s clock re-renders the parent with fresh array
  // identities, which must not replay setOption (see RankBarChart).
  const rowsKey = JSON.stringify(
    props.rows.map((r) => [r.name, r.total_tokens, r.share])
  )
  const rows = useMemo(
    () =>
      (JSON.parse(rowsKey) as Array<[string, number, number]>).map(
        ([name, tokens, share]) => ({ name, tokens, share })
      ),
    [rowsKey]
  )
  const mapKey = props.mapKey

  useEffect(() => {
    if (!mapKey) return
    // This effect also runs when the minute's data lands, and setOption goes
    // through with replaceMerge:['series'] — which would discard whatever the
    // viewer had roamed to and snap the map back to its initial framing. The
    // roam handlers keep the live view in these refs so it can be handed
    // straight back to the new option; a programmatic setOption fires no
    // georoam, so nothing else would notice the view had been reset.
    const zoom = zoomRef.current
    const center = centerRef.current
    const max = Math.max(1, ...rows.map((r) => r.tokens))
    const option: EChartsOption = {
      tooltip: {
        ...tooltipBase(props.theme),
        trigger: 'item',
        formatter: (p) => {
          const d = firstParam(p)
          const row = rows.find((r) => r.name === d.name)
          if (!row) return `${d.name ?? ''}<br/><b>${formatTokens(0)}</b>`
          return `${row.name}<br/><b>${formatTokens(row.tokens)}</b> · ${(row.share * 100).toFixed(1)}%`
        },
      },
      visualMap: {
        type: 'continuous',
        show: rows.length > 0,
        min: 0,
        max,
        left: 14,
        bottom: 18,
        itemWidth: 10,
        itemHeight: 92,
        calculable: true,
        precision: 0,
        text: [formatTokens(max), '0'],
        textStyle: { color: props.theme.textSub, fontSize: 10 },
        formatter: (value) => formatTokens(Number(value)),
        inRange: { color: heatRamp(props.theme) },
        seriesIndex: 0,
      },
      series: [
        {
          type: 'map',
          map: mapKey,
          // Wheel zoom + drag pan; zooming out to the floor restores the fit.
          roam: true,
          scaleLimit: { min: 1, max: 14 },
          zoom,
          center,
          layoutCenter: ['50%', '52%'],
          layoutSize: '116%',
          label: {
            show: true,
            color: withAlpha(props.theme.textSub, 0.95),
            fontSize: props.showLabels ? 10 : 9,
            // A border halo keeps names legible over both bright and dark
            // provinces — cheaper and crisper than a text shadow.
            textBorderColor: withAlpha(props.theme.background, 0.9),
            textBorderWidth: 2,
            // Only regions with usage are named at the default zoom; past
            // MAP_LABEL_ZOOM every place name shows, which is the cue the
            // landmark island waits for. Read through a ref so a zoom change
            // never replays setOption (that would reset the roam).
            formatter: (p) =>
              p.value || zoomRef.current >= MAP_LABEL_ZOOM ? String(p.name) : '',
          },
          // At full zoom every city is named; drop the ones that would sit on
          // top of each other rather than letting them collide.
          labelLayout: { hideOverlap: true },
          itemStyle: {
            areaColor: landGradient(props.theme),
            // Hairline internal borders: the landmass should read as one
            // surface divided by threads, not as a patchwork of stickers.
            borderColor: withAlpha(props.theme.accent, 0.3),
            borderWidth: 0.8,
            shadowColor: landShadow(props.theme),
            shadowBlur: 22,
            shadowOffsetY: 10,
          },
          emphasis: {
            label: {
              show: true,
              color: props.theme.textTitle,
              fontSize: 11,
              fontWeight: 600,
            },
            itemStyle: {
              areaColor: withAlpha(props.theme.accent, 0.72),
              borderColor: props.theme.series[1],
              borderWidth: 1.4,
              shadowBlur: 30,
              shadowColor: withAlpha(props.theme.accent, 0.5),
            },
          },
          select: { disabled: true },
          data: rows.map((r) => ({ name: r.name, value: r.tokens })),
        },
      ],
    }
    setOption(option)
  }, [mapKey, rows, props.theme, props.showLabels, setOption])

  if (!mapKey) return props.fallback ?? <NoData />
  return <div key={mapKey} ref={setContainer} className='bsc-chart' />
}

/** Right column: province (or drilled-down city) ranking bars. */
export function RegionRankChart(props: {
  loading: boolean
  theme: ScreenChartTheme
  rows: RegionStat[]
  onSelect?: (name: string) => void
}) {
  return (
    <RankBarChart
      loading={props.loading}
      theme={props.theme}
      rows={props.rows.map((r) => ({ name: r.name, tokens: r.total_tokens }))}
      barColor={props.theme.series[2]}
      onSelect={props.onSelect}
    />
  )
}

/** Center-bottom: token trend of the region currently in focus. */
export function RegionTrendChart(props: {
  loading: boolean
  theme: ScreenChartTheme
  points: RegionPoint[]
}) {
  const { setContainer, setOption } = useEChart()
  const pointsKey = JSON.stringify(props.points.map((p) => [p.label, p.tokens]))
  const points = useMemo(
    () =>
      (JSON.parse(pointsKey) as Array<[string, number]>).map(
        ([label, tokens]) => ({ label, tokens })
      ),
    [pointsKey]
  )
  const empty = points.length === 0

  useEffect(() => {
    if (empty) return
    const color = props.theme.series[1]
    const option: EChartsOption = {
      tooltip: {
        ...tooltipBase(props.theme),
        valueFormatter: (v) => formatTokens(Number(v)),
      },
      grid: { top: 16, left: 8, right: 16, bottom: 2, containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((p) => p.label),
        axisLine: axisLine(props.theme),
        axisTick: { show: false },
        axisLabel: {
          color: props.theme.textSub,
          fontSize: 11,
          hideOverlap: true,
        },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: props.theme.textSub,
          fontSize: 11,
          formatter: (v: number) => formatTokens(v),
        },
        splitLine: splitLine(props.theme),
      },
      series: [
        {
          type: 'line',
          smooth: true,
          symbol: 'circle',
          symbolSize: 5,
          showSymbol: points.length <= 40,
          lineStyle: {
            width: 2.5,
            color,
            shadowColor: withAlpha(color, 0.6),
            shadowBlur: 12,
          },
          itemStyle: { color },
          areaStyle: { color: verticalGradient(color, 0.32, 0.02) },
          data: points.map((p) => p.tokens),
        },
      ],
    }
    setOption(option)
  }, [empty, points, props.theme, setOption])

  if (!props.loading && empty) return <NoData />
  return <div ref={setContainer} className='bsc-chart' />
}

type MoverRow = {
  model: string
  delta: number
  current: number
  growth: number
}

function moveBadge(delta: number) {
  if (delta > 0) {
    return <span className='bsc-lv bsc-lv-up'>▲{delta}</span>
  }
  if (delta < 0) {
    return <span className='bsc-lv bsc-lv-down'>▼{Math.abs(delta)}</span>
  }
  return <span className='bsc-lv'>—</span>
}

function toMoverRows(
  movers: RankingMover[] | undefined,
  droppers: RankingMover[] | undefined
): MoverRow[] {
  const toRow = (m: RankingMover): MoverRow => ({
    model: m.model_name,
    delta: m.rank_delta,
    current: m.current_rank,
    growth: m.growth_pct,
  })
  return [...(movers ?? []).map(toRow), ...(droppers ?? []).map(toRow)]
}

/**
 * Rank-movement marquee: duplicated list translated upward in a loop,
 * pausing when the tab is hidden or the user prefers reduced motion.
 */
export function RankMovementMarquee(props: {
  movers?: RankingMover[]
  droppers?: RankingMover[]
}) {
  const { t } = useTranslation()
  const ulRef = useRef<HTMLUListElement>(null)
  const moversKey = JSON.stringify(props.movers ?? [])
  const droppersKey = JSON.stringify(props.droppers ?? [])
  const source = useMemo(
    () =>
      toMoverRows(
        JSON.parse(moversKey) as RankingMover[],
        JSON.parse(droppersKey) as RankingMover[]
      ),
    [moversKey, droppersKey]
  )
  const scrollable = source.length >= 5

  useEffect(() => {
    if (!scrollable) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ul = ulRef.current
    if (!ul) return
    let y = 0
    const id = window.setInterval(() => {
      if (document.hidden || !ul.scrollHeight) return
      y = (y + 1) % (ul.scrollHeight / 2)
      ul.style.transform = `translateY(-${y}px)`
    }, 40)
    return () => window.clearInterval(id)
  }, [scrollable])

  const rows = (scrollable ? [source, source] : [source]).flatMap(
    (copy, copyIdx) =>
      copy.map((r) => ({ ...r, key: `${copyIdx}:${r.model}:${r.current}` }))
  )
  return (
    <div className='bsc-scroll-table'>
      <ul ref={ulRef}>
        {rows.map((r) => (
          <li key={r.key}>
            <span className='bsc-c-rank'>#{r.current}</span>
            <span className='bsc-c-model'>{r.model}</span>
            <span className='bsc-c-move'>{moveBadge(r.delta)}</span>
            <span
              className={`bsc-c-growth ${r.growth >= 0 ? 'bsc-growth-up' : 'bsc-growth-down'}`}
            >
              {r.growth >= 0 ? '+' : ''}
              {r.growth.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
      {source.length === 0 && (
        <div className='bsc-chart-placeholder'>{t('No data')}</div>
      )}
    </div>
  )
}
