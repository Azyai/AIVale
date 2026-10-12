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
import { useQuery } from '@tanstack/react-query'
import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { getPerfMetricsSummary } from '@/features/performance-metrics/api'
import { formatLatency } from '@/features/performance-metrics/lib/format'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getLobeIcon } from '@/lib/lobe-icon'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { parseTags } from '../lib/filters'
import { getModelPriceDisplay } from '../lib/price-pair'
import { formatPrice } from '../lib/price'
import type { PricingModel, TokenUnit } from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'

export interface CompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  models: PricingModel[]
  tokenUnit?: TokenUnit
  priceRate?: number
  usdExchangeRate?: number
  showRechargePrice?: boolean
}

type CompareRow = {
  key: string
  label: string
  render: (model: PricingModel) => ReactNode
}

export function CompareDialog(props: CompareDialogProps) {
  const { t, i18n } = useTranslation()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const tokenUnitLabel = tokenUnit === 'K' ? '1K' : '1M'

  const perfQuery = useQuery({
    queryKey: ['perf-metrics-summary', 24],
    queryFn: async () => requireServerSuccess(await getPerfMetricsSummary(24)),
    staleTime: 60 * 1000,
    retry: false,
    enabled: props.open,
  })

  const perfMap = useMemo(() => {
    const map = new Map<string, { avg_latency_ms?: number; success_rate?: number }>()
    for (const model of perfQuery.data?.data?.models ?? []) {
      map.set(model.model_name, model)
    }
    return map
  }, [perfQuery.data])

  const priceOptions = {
    tokenUnit,
    priceRate: props.priceRate ?? 1,
    usdExchangeRate: props.usdExchangeRate ?? 1,
    showRechargePrice: props.showRechargePrice ?? false,
  }

  // Same dynamic-then-static basis as the model cards, so compared prices
  // match what users see in the grid. The dialog is transient, so evaluating
  // time tiers at render time (instead of the reactive useBillingTime hook)
  // is sufficient.
  const priceDisplay = (model: PricingModel) =>
    getModelPriceDisplay(
      model,
      { ...priceOptions, now: new Date() },
      t,
      i18n.language
    )

  const rows: CompareRow[] = useMemo(
    () => [
      {
        key: 'vendor',
        label: t('Vendor'),
        render: (model) => (
          <span className='text-sm'>{model.vendor_name || '—'}</span>
        ),
      },
      {
        key: 'billing',
        label: t('Billing Type'),
        render: (model) => (
          <ModelBillingModeBadge model={model} appearance='caption' />
        ),
      },
      {
        key: 'input',
        label: t('Input Price'),
        render: (model) => {
          const input = priceDisplay(model).input
          return input ? (
            <span className='font-mono text-sm font-semibold tabular-nums'>
              {input.formatted}
              <span className='text-muted-foreground ml-1 text-xs font-normal'>
                / {input.unit}
              </span>
            </span>
          ) : (
            <span className='text-muted-foreground text-sm'>—</span>
          )
        },
      },
      {
        key: 'output',
        label: t('Output Price'),
        render: (model) => {
          const output = priceDisplay(model).output
          return output ? (
            <span className='font-mono text-sm font-semibold tabular-nums'>
              {output.formatted}
              <span className='text-muted-foreground ml-1 text-xs font-normal'>
                / {output.unit}
              </span>
            </span>
          ) : (
            <span className='text-muted-foreground text-sm'>—</span>
          )
        },
      },
      {
        key: 'cache',
        label: t('Cached Price'),
        render: (model) =>
          model.quota_type === 0 && model.cache_ratio != null ? (
            <span className='font-mono text-sm font-semibold tabular-nums'>
              {formatPrice(
                model,
                'cache',
                priceOptions.tokenUnit,
                priceOptions.showRechargePrice,
                priceOptions.priceRate,
                priceOptions.usdExchangeRate
              )}
              <span className='text-muted-foreground ml-1 text-xs font-normal'>
                / {tokenUnitLabel}
              </span>
            </span>
          ) : (
            <span className='text-muted-foreground text-sm'>—</span>
          ),
      },
      {
        key: 'request_price',
        label: t('Price per Request'),
        render: (model) => {
          const request = priceDisplay(model).request
          return request ? (
            <span className='font-mono text-sm font-semibold tabular-nums'>
              {request.formatted}
            </span>
          ) : (
            <span className='text-muted-foreground text-sm'>—</span>
          )
        },
      },
      {
        key: 'groups',
        label: t('Groups'),
        render: (model) => (
          <span className='text-muted-foreground text-sm'>
            {(model.enable_groups || []).join(', ') || '—'}
          </span>
        ),
      },
      {
        key: 'endpoints',
        label: t('Endpoints'),
        render: (model) => (
          <span className='text-muted-foreground text-sm'>
            {(model.supported_endpoint_types || []).slice(0, 4).join(', ') ||
              '—'}
          </span>
        ),
      },
      {
        key: 'tags',
        label: t('Tags'),
        render: (model) => {
          const tags = parseTags(model.tags)
          return (
            <span className='text-muted-foreground text-sm'>
              {tags.slice(0, 5).join(', ') || '—'}
            </span>
          )
        },
      },
      {
        key: 'perf',
        label: t('Performance'),
        render: (model) => {
          const perf = perfMap.get(model.model_name)
          if (!perf?.avg_latency_ms) {
            return <span className='text-muted-foreground text-sm'>—</span>
          }
          const success =
            perf.success_rate != null && Number.isFinite(perf.success_rate)
              ? `${perf.success_rate.toFixed(1)}%`
              : '—'
          return (
            <span className='text-muted-foreground text-sm tabular-nums'>
              {formatLatency(perf.avg_latency_ms)} · {success}
            </span>
          )
        },
      },
    ],
    // Price strings read the currency config indirectly through the formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, tokenUnit, perfMap, props.priceRate, props.usdExchangeRate, props.showRechargePrice]
  )

  const columns = props.models.length
  if (columns === 0) return null

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[85dvh] max-w-3xl overflow-y-auto sm:max-w-4xl 2xl:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>{t('Compare Models')}</DialogTitle>
          <DialogDescription>
            {t(
              'Compare pricing, billing mode and performance across the selected models.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          role='table'
          aria-label={t('Compare Models')}
          className='min-w-0 overflow-x-auto'
        >
          {/* Header row: model names */}
          <div
            className='grid min-w-[480px]'
            style={{
              gridTemplateColumns: `minmax(110px, 150px) repeat(${columns}, minmax(0, 1fr))`,
            }}
          >
            <div className='border-border/60 flex items-end pb-2.5'>
              <span className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>
                {t('Model')}
              </span>
            </div>
            {props.models.map((model) => {
              const iconKey = model.icon || model.vendor_icon
              const icon = iconKey ? getLobeIcon(iconKey, 18) : null
              return (
                <div
                  key={model.model_name}
                  className='border-border/60 flex items-end gap-2 border-b pb-2.5'
                >
                  {icon}
                  <span
                    className='truncate font-mono text-sm font-semibold'
                    title={model.model_name}
                  >
                    {model.model_name}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Attribute rows */}
          {rows.map((row, rowIndex) => (
            <div
              key={row.key}
              className='grid min-w-[480px]'
              style={{
                gridTemplateColumns: `minmax(110px, 150px) repeat(${columns}, minmax(0, 1fr))`,
              }}
            >
              <div
                className={cn(
                  'text-muted-foreground flex items-center py-2.5 pr-3 text-xs font-semibold tracking-wide uppercase',
                  rowIndex < rows.length - 1 && 'border-border/40 border-b'
                )}
              >
                {row.label}
              </div>
              {props.models.map((model) => (
                <div
                  key={model.model_name}
                  className={cn(
                    'flex min-w-0 items-center py-2.5 pr-3',
                    rowIndex < rows.length - 1 && 'border-border/40 border-b'
                  )}
                >
                  <div className='min-w-0 break-words'>{row.render(model)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
