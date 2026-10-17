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
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowExpand02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

import { PublicLayout } from '@/components/layout'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getRankingRegions, getRankings, getRegionsCatalog } from '../api'
import { formatTokens } from '../lib/format'
import type {
  ModelHistorySeries,
  ModelRanking,
  RankingPeriod,
  RegionDetail,
  RegionPoint,
  RegionStat,
  UserRanking,
  VendorRanking,
} from '../types'
import { CountUpNumber } from './count-up-number'
import { LandmarkRail } from './landmarks'
import {
  ModelRankChart,
  RegionMapChart,
  RegionRankChart,
  RegionTrendChart,
  TokenTrendChart,
  UserRankChart,
  VendorShareChart,
} from './screen-charts'
import { useRegionGeo } from './use-region-geo'
import { useScreenTheme, type ScreenChartTheme } from './use-screen-theme'
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
// Module-level empty arrays keep useMemo deps referentially stable while the
// snapshots have not loaded yet.
const EMPTY_MODELS: ModelRanking[] = []
const EMPTY_USERS: UserRanking[] = []
const EMPTY_VENDORS: VendorRanking[] = []
const EMPTY_REGIONS: RegionStat[] = []
const EMPTY_POINTS: RegionPoint[] = []

/** Panels that can be opened in the enlarged dialog. */
type ZoomId =
  | 'models'
  | 'users'
  | 'map'
  | 'region'
  | 'regions'
  | 'vendors'
  | 'trend'

/** Refresh the wall-screen data once a minute while staying cache-friendly. */
function useScreenRankings(period: RankingPeriod) {
  return useQuery({
    queryKey: ['rankings', period],
    queryFn: async () => requireServerSuccess(await getRankings(period)),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
  })
}

function useScreenRegions(period: RankingPeriod, province: string) {
  return useQuery({
    queryKey: ['rankings-regions', period, province],
    queryFn: async () =>
      requireServerSuccess(await getRankingRegions(period, province)),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60 * 1000,
    // Keeps the previous scope on screen while the next one loads, so drilling
    // in or switching period never blanks the map.
    placeholderData: (previous) => previous,
  })
}

function useRegionsCatalog() {
  return useQuery({
    queryKey: ['regions-catalog'],
    queryFn: getRegionsCatalog,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
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

function Panel(props: {
  title: string
  extra?: ReactNode
  className?: string
  onZoom?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <section className={`bsc-panel ${props.className ?? ''}`}>
      <div className='bsc-panel-title'>
        <span className='bsc-panel-name'>{props.title}</span>
        <div className='bsc-panel-tools'>
          {props.extra}
          {props.onZoom ? (
            <button
              type='button'
              className='bsc-zoom'
              onClick={props.onZoom}
              aria-label={t('View details')}
              title={t('View details')}
            >
              <HugeiconsIcon icon={ArrowExpand02Icon} aria-hidden='true' />
            </button>
          ) : null}
        </div>
      </div>
      {props.children}
    </section>
  )
}

/** Calendar-to-date token volume of the region currently in focus. */
function RegionTotals(props: {
  detail: RegionDetail | undefined
  className?: string
}) {
  const { t } = useTranslation()
  const cells = [
    { label: t('Today'), value: props.detail?.today_tokens ?? 0 },
    { label: t('This Month'), value: props.detail?.month_tokens ?? 0 },
    { label: t('This Year'), value: props.detail?.year_tokens ?? 0 },
  ]
  return (
    <div className={`bsc-region-totals ${props.className ?? ''}`}>
      {cells.map((cell) => (
        <div key={cell.label} className='bsc-region-total'>
          <CountUpNumber
            value={cell.value}
            format={formatTokens}
            className='bsc-region-total-value'
          />
          <span className='bsc-region-total-label'>{cell.label}</span>
        </div>
      ))}
    </div>
  )
}

type ZoomContext = {
  t: (key: string) => string
  fetching: boolean
  theme: ScreenChartTheme
  province: string | null
  models: ModelRanking[]
  users: UserRanking[]
  vendors: VendorRanking[]
  history: ModelHistorySeries | undefined
  mapRows: RegionStat[]
  mapKey: string | undefined
  detail: RegionDetail | undefined
  series: RegionPoint[]
  onRegionSelect: (name: string) => void
}

/** Enlarged version of a panel: the same chart with room to show more rows. */
function zoomView(
  id: ZoomId,
  ctx: ZoomContext
): { title: string; body: ReactNode } {
  const { t } = ctx
  if (id === 'models') {
    return {
      title: t('Model Rankings'),
      body: (
        <ModelRankChart
          loading={ctx.fetching}
          theme={ctx.theme}
          rows={ctx.models.slice(0, 20)}
        />
      ),
    }
  }
  if (id === 'users') {
    return {
      title: t('User Rankings'),
      body: (
        <UserRankChart
          loading={ctx.fetching}
          theme={ctx.theme}
          rows={ctx.users.slice(0, 20)}
        />
      ),
    }
  }
  if (id === 'regions') {
    return {
      title: ctx.province ? t('City Rankings') : t('Province Rankings'),
      body: (
        <RegionRankChart
          loading={ctx.fetching}
          theme={ctx.theme}
          rows={ctx.mapRows}
          onSelect={ctx.onRegionSelect}
        />
      ),
    }
  }
  if (id === 'vendors') {
    return {
      title: t('Vendor Share'),
      body: (
        <VendorShareChart
          loading={ctx.fetching}
          theme={ctx.theme}
          rows={ctx.vendors}
        />
      ),
    }
  }
  if (id === 'trend') {
    return {
      title: t('Token Trend'),
      body: (
        <TokenTrendChart
          loading={ctx.fetching}
          theme={ctx.theme}
          history={ctx.history}
        />
      ),
    }
  }
  if (id === 'region') {
    return {
      title: t('Regional Usage'),
      body: (
        <>
          <RegionTotals detail={ctx.detail} className='bsc-region-totals-lg' />
          <RegionTrendChart
            loading={ctx.fetching}
            theme={ctx.theme}
            points={ctx.series}
          />
        </>
      ),
    }
  }
  return {
    title: ctx.province ?? t('Regional Distribution'),
    body: (
      <RegionMapChart
        theme={ctx.theme}
        mapKey={ctx.mapKey}
        rows={ctx.mapRows}
        showLabels
        onSelect={ctx.onRegionSelect}
      />
    ),
  }
}

/**
 * Rankings cockpit: a full-bleed wall screen filling the viewport below the
 * site header. The China map takes the center and drills province → city on
 * click, with ranking / share panels on both sides and the token trend along
 * the bottom. Every panel can be opened enlarged. Follows the app's light /
 * dark / system theme.
 */
export function RankingsScreen() {
  const { t } = useTranslation()
  const search = useSearch({ from: '/rankings/' })
  const navigate = useNavigate({ from: '/rankings/' })
  const clock = useClock()
  const theme = useScreenTheme()

  const period: RankingPeriod = VALID_PERIODS.has(
    search.period as RankingPeriod
  )
    ? (search.period as RankingPeriod)
    : 'week'

  const [province, setProvince] = useState<string | null>(null)
  const [zoomId, setZoomId] = useState<ZoomId | null>(null)

  const rankingsQuery = useScreenRankings(period)
  const regionsQuery = useScreenRegions(period, province ?? '')
  const catalogQuery = useRegionsCatalog()

  const snapshot = rankingsQuery.data?.data
  const regions = regionsQuery.data?.data

  const models = snapshot?.models ?? EMPTY_MODELS
  const users = snapshot?.users ?? EMPTY_USERS
  const vendors = snapshot?.vendors ?? EMPTY_VENDORS
  const provinces = regions?.provinces ?? EMPTY_REGIONS
  const mapRows = province ? (regions?.cities ?? EMPTY_REGIONS) : provinces
  const detailSeries = regions?.detail?.series ?? EMPTY_POINTS

  // undefined (not null) while the catalog is still loading, so the map keeps
  // showing the previous geometry instead of flashing back to the national one.
  const provinceAdcode = useMemo(() => {
    if (!province) return null
    const match = catalogQuery.data?.provinces.find((p) => p.name === province)
    return match ? match.adcode : undefined
  }, [catalogQuery.data, province])
  const geo = useRegionGeo(provinceAdcode)
  const catalogNames = useMemo(
    () => catalogQuery.data?.provinces.map((p) => p.name) ?? [],
    [catalogQuery.data]
  )

  const handlePeriodChange = (next: RankingPeriod) => {
    navigate({ search: { period: next } })
  }
  const handleRegionSelect = (name: string) => {
    // Only catalog provinces drill down; clicks on other shapes are ignored.
    if (province) return
    if (catalogQuery.data?.provinces.some((p) => p.name === name)) {
      setProvince(name)
    }
  }
  // Landmark rail: drill into a province, switch while drilled, or click the
  // focused province's glyph to return to the national map.
  const handleRailSelect = (name: string) => {
    if (!catalogNames.includes(name)) return
    setProvince(province === name ? null : name)
  }

  const periodLabel = t(
    PERIODS.find((p) => p.id === period)?.labelKey ?? 'Week'
  )
  // Nothing can be attributed to a region until admins set province / city on
  // users, so say that instead of leaving a blank map unexplained.
  const regionsUnmapped =
    !regionsQuery.isLoading &&
    (regions?.total_tokens ?? 0) > 0 &&
    provinces.length === 0

  const mapTools = (
    <>
      {province ? (
        <button
          type='button'
          className='bsc-back'
          onClick={() => setProvince(null)}
        >
          ← {t('Nationwide')}
        </button>
      ) : null}
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
    </>
  )

  // Both feeds drive the same screen, so hold it until they have both answered.
  const loading = rankingsQuery.isLoading || regionsQuery.isLoading

  let body: ReactNode
  if (loading) {
    body = (
      <div className='bsc-center'>
        <div>{t('Loading')}…</div>
      </div>
    )
  } else if (rankingsQuery.isError) {
    body = (
      <div className='bsc-center'>
        <div>
          <b>{t('Failed to load rankings data')}</b>
          <br />
          <button
            type='button'
            className='bsc-retry'
            onClick={() => void rankingsQuery.refetch()}
          >
            {t('Retry')}
          </button>
        </div>
      </div>
    )
  } else {
    const fetching = rankingsQuery.isFetching || regionsQuery.isFetching
    body = (
      <>
        <div className='bsc-col bsc-area-left'>
          <Panel
            title={t('Model Rankings')}
            extra={<small>{periodLabel}</small>}
            onZoom={() => setZoomId('models')}
          >
            <ModelRankChart
              loading={fetching}
              theme={theme}
              rows={models.slice(0, 10)}
            />
          </Panel>
          <Panel
            title={t('User Rankings')}
            extra={<small>{periodLabel}</small>}
            onZoom={() => setZoomId('users')}
          >
            <UserRankChart
              loading={fetching}
              theme={theme}
              rows={users.slice(0, 10)}
            />
          </Panel>
        </div>

        <div className='bsc-col bsc-area-center'>
          <Panel
            className='bsc-panel-map'
            title={province ?? t('Regional Distribution')}
            extra={mapTools}
            onZoom={() => setZoomId('map')}
          >
            <div className='bsc-map-wrap'>
              <LandmarkRail
                names={catalogNames}
                active={province}
                onSelect={handleRailSelect}
                ariaLabel={t('Click a province to drill down')}
              />
              <RegionMapChart
                theme={theme}
                mapKey={geo.mapKey}
                rows={mapRows}
                showLabels={province != null}
                onSelect={handleRegionSelect}
                fallback={
                  <div className='bsc-chart-placeholder'>
                    {geo.failed
                      ? t('Failed to load map data')
                      : `${t('Loading')}…`}
                  </div>
                }
              />
              {regionsUnmapped ? (
                <div className='bsc-map-hint'>
                  {t(
                    'No region data yet. Set province and city on users in User Management to populate the map.'
                  )}
                </div>
              ) : null}
              <div className='bsc-map-tip'>
                <span>
                  {province
                    ? t('Showing cities of the selected province')
                    : t('Click a province to drill down')}
                </span>
                <span>{t('Scroll to zoom, drag to pan')}</span>
              </div>
            </div>
          </Panel>
          <Panel
            title={t('Regional Usage')}
            extra={<small>{province ?? t('Nationwide')}</small>}
            onZoom={() => setZoomId('region')}
          >
            <RegionTotals detail={regions?.detail} />
            <RegionTrendChart
              loading={regionsQuery.isFetching}
              theme={theme}
              points={detailSeries}
            />
          </Panel>
        </div>

        <div className='bsc-col bsc-area-right'>
          <Panel
            title={province ? t('City Rankings') : t('Province Rankings')}
            extra={<small>{periodLabel}</small>}
            onZoom={() => setZoomId('regions')}
          >
            <RegionRankChart
              loading={regionsQuery.isFetching}
              theme={theme}
              rows={mapRows.slice(0, 10)}
              onSelect={province ? undefined : handleRegionSelect}
            />
            {regions && regions.unassigned.total_tokens > 0 ? (
              <div className='bsc-panel-foot'>
                <span>{t('Unassigned Region')}</span>
                <span>{formatTokens(regions.unassigned.total_tokens)}</span>
              </div>
            ) : null}
          </Panel>
          <Panel
            title={t('Vendor Share')}
            extra={<small>{periodLabel}</small>}
            onZoom={() => setZoomId('vendors')}
          >
            <VendorShareChart
              loading={fetching}
              theme={theme}
              rows={vendors}
            />
          </Panel>
        </div>

        <Panel
          className='bsc-area-bottom'
          title={t('Token Trend')}
          extra={<small>{periodLabel}</small>}
          onZoom={() => setZoomId('trend')}
        >
          <TokenTrendChart
            loading={fetching}
            theme={theme}
            history={snapshot?.models_history}
          />
        </Panel>
      </>
    )
  }

  const zoom = zoomId
    ? zoomView(zoomId, {
        t,
        fetching: rankingsQuery.isFetching || regionsQuery.isFetching,
        theme,
        province,
        models,
        users,
        vendors,
        history: snapshot?.models_history,
        mapRows,
        mapKey: geo.mapKey,
        detail: regions?.detail,
        series: detailSeries,
        onRegionSelect: handleRegionSelect,
      })
    : null

  return (
    <PublicLayout showMainContainer={false}>
      <div className='bsc-root'>
        <div className='bsc-screen'>
          <div className='bsc-body'>{body}</div>
        </div>
        <Dialog
          open={zoom != null}
          onOpenChange={(open) => {
            if (!open) setZoomId(null)
          }}
        >
          <DialogContent
            className='rank-board-dialog sm:max-w-5xl'
            // Frosted-glass blur via inline style: the production CSS
            // minifier rewrites backdrop-filter down to -webkit-only,
            // which Firefox (and some embedded webviews) ignore.
            style={{
              backdropFilter: 'blur(48px) saturate(1.8)',
              WebkitBackdropFilter: 'blur(48px) saturate(1.8)',
            }}
          >
            <DialogHeader>
              <DialogTitle>{zoom?.title}</DialogTitle>
              <DialogDescription>
                {province ?? t('Nationwide')} · {periodLabel}
              </DialogDescription>
            </DialogHeader>
            {zoom ? <div className='rank-chart-frame'>{zoom.body}</div> : null}
          </DialogContent>
        </Dialog>
      </div>
    </PublicLayout>
  )
}
