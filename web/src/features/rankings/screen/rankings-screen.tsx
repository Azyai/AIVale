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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getRankings } from '../api'
import { formatTokens } from '../lib/format'
import type {
  ModelHistorySeries,
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

type BoardId =
  | 'monitor'
  | 'models'
  | 'users'
  | 'vendors'
  | 'trend'
  | 'movers'
  | 'concentration'

function trendSnapshot(history: ModelHistorySeries | undefined) {
  const buckets = new Map<string, number>()
  for (const point of history?.points ?? []) {
    buckets.set(point.label, (buckets.get(point.label) ?? 0) + point.tokens)
  }
  const labels = [...buckets.keys()]
  const latest = labels.length ? (buckets.get(labels[labels.length - 1]) ?? 0) : 0
  const previous =
    labels.length > 1 ? (buckets.get(labels[labels.length - 2]) ?? 0) : 0
  const growth = previous > 0 ? ((latest - previous) / previous) * 100 : 0
  return {
    latest,
    growth,
    label: labels[labels.length - 1] ?? '',
    topModel: history?.models[0]?.name ?? '',
  }
}

function BoardButton(props: {
  open: boolean
  title: string
  hint: string
  action: string
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type='button'
      data-slot='card'
      data-open={props.open ? 'true' : undefined}
      className={`rank-board bg-card text-card-foreground border-border flex h-full min-h-56 flex-col gap-3 rounded-xl border p-4 ${props.className ?? ''}`}
      onClick={props.onClick}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0'>
          <div className='text-sm font-semibold'>{props.title}</div>
          <div className='text-muted-foreground mt-0.5 text-xs'>{props.hint}</div>
        </div>
        <span className='text-primary shrink-0 text-xs font-medium'>
          {props.action}
        </span>
      </div>
      <div className='flex min-h-0 flex-1 flex-col justify-center gap-2.5'>
        {props.children}
      </div>
    </button>
  )
}

function SummaryRow(props: { mark: string; name: string; value: string }) {
  return (
    <div className='flex min-w-0 items-center gap-2 text-sm'>
      <span className='text-primary w-8 shrink-0 font-semibold tabular-nums'>
        {props.mark}
      </span>
      <span className='min-w-0 flex-1 truncate'>{props.name}</span>
      <span className='text-muted-foreground shrink-0 tabular-nums'>
        {props.value}
      </span>
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

  const [openBoard, setOpenBoard] = useState<BoardId | null>(null)
  const trend = trendSnapshot(snapshot?.models_history)

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
    const detail = boardDetail({
      id: openBoard,
      t,
      periodLabel,
      loading: query.isFetching,
      theme: screenTheme,
      models,
      users,
      vendors,
      history: snapshot?.models_history,
      moverRows,
      modelTop10Share,
      userTop10Share,
      topVendorShare,
    })
    content = (
      <div className='space-y-4'>
        <header className='flex flex-wrap items-center justify-between gap-3'>
          <h1 className='text-xl font-semibold tracking-tight'>
            {t('Usage Data Monitor')}
          </h1>
          <div className='flex flex-wrap items-center gap-3'>
            <div role='tablist' aria-label={t('Period')} className='bsc-periods'>
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

        <button
          type='button'
          data-slot='card'
          data-open={openBoard === 'monitor' ? 'true' : undefined}
          className='rank-monitor bg-card text-card-foreground border-border rounded-xl border p-4'
          onClick={() => setOpenBoard('monitor')}
        >
          <div className='mb-3 flex items-center justify-between gap-3'>
            <div className='text-sm font-semibold'>{t('Full Monitor')}</div>
            <span className='text-primary text-xs font-medium'>
              {t('View details')}
            </span>
          </div>
          <div className='grid grid-cols-2 gap-3 md:grid-cols-5'>
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
          </div>
        </button>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
          <BoardButton
            open={openBoard === 'models'}
            title={t('Model Rankings')}
            hint={`${periodLabel} · tokens`}
            action={t('View details')}
            onClick={() => setOpenBoard('models')}
          >
            {models.slice(0, 3).map((row) => (
              <SummaryRow
                key={row.model_name}
                mark={`#${row.rank}`}
                name={row.model_name}
                value={formatTokens(row.total_tokens)}
              />
            ))}
            {models.length === 0 ? <EmptyHint label={t('No data')} /> : null}
          </BoardButton>
          <BoardButton
            open={openBoard === 'users'}
            title={t('User Rankings')}
            hint={`${periodLabel} · tokens`}
            action={t('View details')}
            onClick={() => setOpenBoard('users')}
          >
            {users.slice(0, 3).map((row) => (
              <SummaryRow
                key={row.user_id}
                mark={`#${row.rank}`}
                name={row.username}
                value={formatTokens(row.total_tokens)}
              />
            ))}
            {users.length === 0 ? <EmptyHint label={t('No data')} /> : null}
          </BoardButton>
          <BoardButton
            open={openBoard === 'vendors'}
            title={t('Vendor Share')}
            hint={periodLabel}
            action={t('View details')}
            onClick={() => setOpenBoard('vendors')}
          >
            {vendors.slice(0, 3).map((row) => (
              <SummaryRow
                key={row.vendor}
                mark={`#${row.rank}`}
                name={row.vendor}
                value={`${(row.share * 100).toFixed(1)}%`}
              />
            ))}
            {vendors.length === 0 ? <EmptyHint label={t('No data')} /> : null}
          </BoardButton>
          <BoardButton
            open={openBoard === 'trend'}
            title={t('Token Trend')}
            hint={trend.label || periodLabel}
            action={t('View details')}
            onClick={() => setOpenBoard('trend')}
          >
            <div className='text-primary text-3xl font-semibold tabular-nums'>
              {formatTokens(trend.latest)}
            </div>
            <div className='text-muted-foreground text-sm'>
              {trend.growth >= 0 ? '+' : ''}
              {trend.growth.toFixed(1)}%
              {trend.topModel ? ` · ${trend.topModel}` : ''}
            </div>
          </BoardButton>
          <BoardButton
            open={openBoard === 'movers'}
            title={t('Rank Movements')}
            hint={periodLabel}
            action={t('View details')}
            onClick={() => setOpenBoard('movers')}
          >
            {moverRows.slice(0, 3).map((row) => (
              <SummaryRow
                key={`${row.model}:${row.current}`}
                mark={`#${row.current}`}
                name={row.model}
                value={`${row.growth >= 0 ? '+' : ''}${row.growth.toFixed(1)}%`}
              />
            ))}
            {moverRows.length === 0 ? <EmptyHint label={t('No data')} /> : null}
          </BoardButton>
          <BoardButton
            open={openBoard === 'concentration'}
            title={t('Concentration')}
            hint={periodLabel}
            action={t('View details')}
            onClick={() => setOpenBoard('concentration')}
          >
            <SummaryRow
              mark=''
              name={t('Top 10 Model Concentration')}
              value={`${modelTop10Share.toFixed(1)}%`}
            />
            <SummaryRow
              mark=''
              name={t('Top 10 User Concentration')}
              value={`${userTop10Share.toFixed(1)}%`}
            />
            <SummaryRow
              mark=''
              name={t('Top Vendor Share')}
              value={`${topVendorShare.toFixed(1)}%`}
            />
          </BoardButton>
        </div>

        <Dialog
          open={openBoard != null}
          onOpenChange={(open) => {
            if (!open) setOpenBoard(null)
          }}
        >
          <DialogContent className='rank-board-dialog sm:max-w-5xl'>
            <DialogHeader>
              <DialogTitle>{detail.title}</DialogTitle>
              <DialogDescription>{detail.description}</DialogDescription>
            </DialogHeader>
            {openBoard === 'monitor' ? (
              <div className='grid grid-cols-2 gap-3 md:grid-cols-5'>
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
              </div>
            ) : openBoard ? (
              <div className='rank-chart-frame'>{detail.body}</div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <PublicLayout showMainContainer={false}>
      <div className='mx-auto w-full max-w-[1280px] px-4 pt-24 pb-12 md:px-6 md:pt-32'>
        {content}
      </div>
    </PublicLayout>
  )
}

function EmptyHint(props: { label: string }) {
  return (
    <div className='text-muted-foreground text-sm'>{props.label}</div>
  )
}

function boardDetail(props: {
  id: BoardId | null
  t: (key: string) => string
  periodLabel: string
  loading: boolean
  theme: ReturnType<typeof useScreenTheme>
  models: ModelRanking[]
  users: UserRanking[]
  vendors: VendorRanking[]
  history: ModelHistorySeries | undefined
  moverRows: MoverRow[]
  modelTop10Share: number
  userTop10Share: number
  topVendorShare: number
}) {
  const { t } = props
  if (props.id === 'users') {
    return {
      title: t('User Rankings'),
      description: props.periodLabel,
      body: (
        <UserRankChart
          loading={props.loading}
          theme={props.theme}
          rows={props.users.slice(0, 10)}
        />
      ),
    }
  }
  if (props.id === 'vendors') {
    return {
      title: t('Vendor Share'),
      description: props.periodLabel,
      body: (
        <VendorShareChart
          loading={props.loading}
          theme={props.theme}
          rows={props.vendors}
        />
      ),
    }
  }
  if (props.id === 'trend') {
    return {
      title: t('Token Trend'),
      description: props.periodLabel,
      body: (
        <TokenTrendChart
          loading={props.loading}
          theme={props.theme}
          history={props.history}
        />
      ),
    }
  }
  if (props.id === 'movers') {
    return {
      title: t('Rank Movements'),
      description: props.periodLabel,
      body: <MoversMarquee rows={props.moverRows} />,
    }
  }
  if (props.id === 'concentration') {
    return {
      title: t('Concentration'),
      description: props.periodLabel,
      body: (
        <ConcentrationGauges
          loading={props.loading}
          theme={props.theme}
          modelTop10={props.modelTop10Share}
          userTop10={props.userTop10Share}
          topVendor={props.topVendorShare}
        />
      ),
    }
  }
  return {
    title: props.id === 'monitor' ? t('Full Monitor') : t('Model Rankings'),
    description: props.periodLabel,
    body: (
      <ModelRankChart
        loading={props.loading}
        theme={props.theme}
        rows={props.models.slice(0, 10)}
      />
    ),
  }
}
