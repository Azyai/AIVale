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
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getRankings } from '../api'
import { formatTokens } from '../lib/format'
import type {
  ModelRanking,
  RankingMover,
  RankingPeriod,
  UserRanking,
  VendorRanking,
} from '../types'
import { CountUpNumber } from './count-up-number'
import {
  ConcentrationGauges,
  ModelRankChart,
  TokenTrendChart,
  UserRankChart,
  VendorShareChart,
} from './screen-charts'
import { useScreenTheme } from './use-screen-theme'
import './rankings-screen.css'

const VALID_PERIODS = new Set<RankingPeriod>([
  'today',
  'week',
  'month',
  'year',
])
const PERIODS: { id: RankingPeriod; labelKey: string }[] = [
  { id: 'today', labelKey: 'Today' },
  { id: 'week', labelKey: 'Week' },
  { id: 'month', labelKey: 'Month' },
  { id: 'year', labelKey: 'Year' },
]
// Module-level empty arrays keep useMemo deps referentially stable while
// the snapshot has not loaded yet.
const EMPTY_MODELS: ModelRanking[] = []
const EMPTY_USERS: UserRanking[] = []
const EMPTY_VENDORS: VendorRanking[] = []
const EMPTY_MOVERS: RankingMover[] = []

/** Refresh the wall-screen data once a minute while staying cache-friendly. */
function useScreenRankings(period: RankingPeriod) {
  return useQuery({
    queryKey: ['rankings', period],
    queryFn: async () => requireServerSuccess(await getRankings(period)),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}

function useClock(): () => string {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return () => {
    const d = now
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
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

/**
 * Rank-movement marquee: duplicated list translated upward in a loop,
 * pausing when the tab is hidden or the user prefers reduced motion.
 */
function MoversMarquee(props: { rows: MoverRow[] }) {
  const { t } = useTranslation()
  const ulRef = useRef<HTMLUListElement>(null)
  const scrollable = props.rows.length >= 5

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

  const rows = (scrollable ? [props.rows, props.rows] : [props.rows]).flatMap(
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
      {props.rows.length === 0 && (
        <div className='bsc-chart-placeholder'>{t('No data')}</div>
      )}
    </div>
  )
}

function KpiCard(props: {
  label: string
  value: number
  format: (value: number) => string
  sub?: string
}) {
  return (
    <div className='bsc-kpi'>
      <CountUpNumber value={props.value} format={props.format} />
      <div className='bsc-kpi-label'>{props.label}</div>
      {props.sub ? <div className='bsc-kpi-sub'>{props.sub}</div> : null}
    </div>
  )
}

/**
 * Rankings page as a big screen — a fixed 1920×1080 stage (letterbox-scaled)
 * rendering the live rankings snapshot, themed to follow the app's light /
 * dark / system setting. Rendered inside the standard public layout (top
 * navigation stays visible), filling the content area below the fixed
 * site header.
 */
export function RankingsScreen() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/rankings/' })
  const navigate = useNavigate({ from: '/rankings/' })
  const clock = useClock()
  const { status } = useStatus()
  const screenTheme = useScreenTheme()

  const period: RankingPeriod = VALID_PERIODS.has(
    search.period as RankingPeriod
  )
    ? (search.period as RankingPeriod)
    : 'week'

  const query = useScreenRankings(period)
  const snapshot = query.data?.data

  const models = snapshot?.models ?? EMPTY_MODELS
  const users = snapshot?.users ?? EMPTY_USERS
  const vendors = snapshot?.vendors ?? EMPTY_VENDORS

  const totalTokens = useMemo(
    () => models.reduce((sum, m) => sum + m.total_tokens, 0),
    [models]
  )
  const modelTop10Share = useMemo(
    () => models.slice(0, 10).reduce((sum, m) => sum + m.share, 0) * 100,
    [models]
  )
  const userTop10Share = useMemo(
    () => users.slice(0, 10).reduce((sum, u) => sum + u.share, 0) * 100,
    [users]
  )
  const topVendorShare = vendors[0] ? vendors[0].share * 100 : 0
  const moverRows = useMemo<MoverRow[]>(() => {
    const toRow = (m: RankingMover): MoverRow => ({
      model: m.model_name,
      delta: m.rank_delta,
      current: m.current_rank,
      growth: m.growth_pct,
    })
    return [
      ...(snapshot?.top_movers ?? EMPTY_MOVERS).map(toRow),
      ...(snapshot?.top_droppers ?? EMPTY_MOVERS).map(toRow),
    ]
  }, [snapshot])

  const handlePeriodChange = (next: RankingPeriod) => {
    navigate({ search: { period: next } })
  }

  // The root fills the viewport below the fixed site header (height set from
  // JS); panels and charts then lay out fluidly inside it — no fixed stage
  // and no transform scaling, so text never distorts. Charts follow their
  // containers via ResizeObserver (use-echart). Embedded webviews may lay
  // out at 0×0 and pause rAF/RO while not rendering, so a short interval
  // poll (timers still fire on hidden pages) guarantees the first apply.
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!rootEl) return
    const apply = () => {
      const docTop = rootEl.getBoundingClientRect().top + window.scrollY
      const h = Math.max(480, window.innerHeight - docTop)
      rootEl.style.height = `${h}px`
    }
    apply()
    window.addEventListener('resize', apply)
    let timer = 0
    let attempts = 0
    const poll = () => {
      apply()
      if (attempts++ > 60) window.clearInterval(timer)
    }
    timer = window.setInterval(poll, 400)
    return () => {
      window.removeEventListener('resize', apply)
      window.clearInterval(timer)
    }
  }, [rootEl])

  const systemName = status?.system_name || 'New API'
  const periodLabel = t(
    PERIODS.find((p) => p.id === period)?.labelKey ?? 'Week'
  )

  let content: ReactNode
  if (query.isLoading) {
    content = (
      <div className='bsc-center'>
        <div>
          <b>{systemName}</b>
          <br />
          {t('Loading')}…
        </div>
      </div>
    )
  } else if (query.isError) {
    content = (
      <div className='bsc-center'>
        <div>
          <b>{t('Failed to load rankings data')}</b>
          <br />
          <button
            type='button'
            className='bsc-retry'
            onClick={() => void query.refetch()}
          >
            {t('Retry')}
          </button>
        </div>
      </div>
    )
  } else {
    content = (
      <div className='bsc-screen'>
              <header className='bsc-header'>
                <h1 className='bsc-title'>{t('Usage Data Monitor')}</h1>
                <div className='bsc-header-right'>
                  <div
                    role='tablist'
                    aria-label={t('Period')}
                    className='bsc-periods'
                  >
                    {PERIODS.map((p) => (
                      <button
                        key={p.id}
                        type='button'
                        role='tab'
                        aria-selected={p.id === period}
                        className='bsc-period-btn'
                        onClick={() => handlePeriodChange(p.id)}
                      >
                      {t(p.labelKey)}
                    </button>
                  ))}
                </div>
                <div className='bsc-clock'>{clock()}</div>
              </div>
        </header>

        <main className='bsc-layout'>
          <div className='bsc-col bsc-col-side'>
            <section className='bsc-panel bsc-corner-b bsc-panel-rank'>
              <div className='bsc-panel-title'>
                {t('Model Rankings')}
                <small>
                  {periodLabel} · tokens
                </small>
              </div>
              <ModelRankChart
                loading={query.isFetching}
                theme={screenTheme}
                rows={models.slice(0, 10)}
              />
            </section>
            <section className='bsc-panel bsc-corner-b bsc-panel-fixed'>
              <div className='bsc-panel-title'>
                {t('Vendor Share')}
                <small>{periodLabel}</small>
              </div>
              <VendorShareChart
                loading={query.isFetching}
                theme={screenTheme}
                rows={vendors}
              />
            </section>
          </div>

          <div className='bsc-col bsc-col-mid'>
            <section className='bsc-panel bsc-corner-b bsc-kpi-row'>
              <KpiCard
                label={t('Total Tokens')}
                value={totalTokens}
                format={formatTokens}
              />
              <KpiCard
                label={t('Active Models')}
                value={models.length}
                format={(v) => Math.round(v).toLocaleString()}
              />
              <KpiCard
                label={t('Listed Users')}
                value={users.length}
                format={(v) => Math.round(v).toLocaleString()}
              />
              <KpiCard
                label={t('Active Vendors')}
                value={vendors.length}
                format={(v) => Math.round(v).toLocaleString()}
              />
              <KpiCard
                label={t('Top Model Share')}
                value={models[0] ? models[0].share * 100 : 0}
                format={(v) => `${v.toFixed(1)}%`}
                sub={models[0]?.model_name}
              />
            </section>

            <section className='bsc-panel bsc-corner-b bsc-panel-rank'>
              <div className='bsc-panel-title'>
                {t('Token Trend')}
                <small>{periodLabel}</small>
              </div>
              <TokenTrendChart
                loading={query.isFetching}
                theme={screenTheme}
                history={snapshot?.models_history}
              />
            </section>

            <section className='bsc-panel bsc-corner-b bsc-log-panel'>
              <div className='bsc-panel-title'>{t('Rank Movements')}</div>
              <MoversMarquee rows={moverRows} />
            </section>
          </div>

          <div className='bsc-col bsc-col-side'>
            <section className='bsc-panel bsc-corner-b bsc-panel-rank'>
              <div className='bsc-panel-title'>
                {t('User Rankings')}
                <small>
                  {periodLabel} · tokens
                </small>
              </div>
              <UserRankChart
                loading={query.isFetching}
                theme={screenTheme}
                rows={users.slice(0, 10)}
              />
            </section>
            <section className='bsc-panel bsc-corner-b bsc-panel-fixed'>
              <div className='bsc-panel-title'>
                {t('Concentration')}
                <small>{periodLabel}</small>
              </div>
              <ConcentrationGauges
                loading={query.isFetching}
                theme={screenTheme}
                modelTop10={modelTop10Share}
                userTop10={userTop10Share}
                topVendor={topVendorShare}
              />
            </section>
          </div>
        </main>
      </div>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='pt-20 md:pt-24'>
        <div className='bsc-root' ref={setRootEl}>
          {content}
        </div>
      </div>
    </PublicLayout>
  )
}
