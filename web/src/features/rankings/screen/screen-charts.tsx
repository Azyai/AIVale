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
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

import { formatTokens } from '../lib/format'
import type {
  ModelHistorySeries,
  ModelRanking,
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

/** Left / right columns: Top-N horizontal ranking bars (skill recipe 2). */
function RankBarChart(props: {
  loading: boolean
  theme: ScreenChartTheme
  rows: Array<{ name: string; tokens: number }>
  barColor: string
}) {
  const { setContainer, setOption } = useEChart()
  const empty = props.rows.length === 0

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
        data: props.rows.map((r) => r.name),
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
          data: props.rows.map((r) => r.tokens),
        },
      ],
    }
    setOption(option)
  }, [empty, props.rows, props.theme, props.barColor, setOption])

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

  useEffect(() => {
    if (empty) return
    const top = props.rows.slice(0, 5)
    const rest = props.rows.slice(5)
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
  }, [empty, props.rows, props.theme, setOption, t])

  // Rotate the rose highlight; skipped for reduced-motion users.
  useEffect(() => {
    if (empty || props.rows.length < 2) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cur = 0
    const count = Math.min(props.rows.length, 6)
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
  }, [empty, props.rows.length, chartRef])

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

  useEffect(() => {
    const history = props.history
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
  }, [empty, props.history, props.theme, setOption, t])

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
