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
import { useCallback, useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

/**
 * Minimal ECharts wrapper for the big screen. The layout is fluid (panels
 * flex to the available space), so each chart follows its container via a
 * ResizeObserver that calls chart.resize().
 *
 * The container is attached via a callback ref and the latest option is kept
 * in a ref, so chart creation and `setOption` calls arriving in any order
 * (including the empty-data → data-filled placeholder swap) all converge.
 */
export function useEChart() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const pendingOptionRef = useRef<EChartsOption | null>(null)

  useEffect(() => {
    if (!container) return
    const chart = echarts.init(container)
    chartRef.current = chart
    const pending = pendingOptionRef.current
    if (pending) chart.setOption(pending, { notMerge: true })
    const observer = new ResizeObserver(() => {
      chart.resize()
    })
    observer.observe(container)
    return () => {
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [container])

  const setOption = useCallback((option: EChartsOption) => {
    pendingOptionRef.current = option
    chartRef.current?.setOption(option, { notMerge: true })
  }, [])

  return { setContainer, setOption, chartRef }
}
