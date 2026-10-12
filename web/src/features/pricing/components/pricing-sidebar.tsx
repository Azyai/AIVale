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
import { ChevronDown, RotateCcw } from 'lucide-react'
import { memo, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Slider } from '@/components/ui/slider'
import { getLobeIcon } from '@/lib/lobe-icon'
import { cn } from '@/lib/utils'

import {
  ENDPOINT_TYPES,
  FILTER_ALL,
  QUOTA_TYPES,
  getEndpointTypeLabels,
  getQuotaTypeLabels,
} from '../constants'
import { hasTaskUsageSchema } from '../lib/dynamic-price'
import { getModelBasePrice, parseTags } from '../lib/filters'
import type { PricingModel, PricingVendor } from '../types'

type FilterOption = {
  value: string
  label: string
  count?: number
  suffix?: string
  icon?: ReactNode
}

type FilterSectionProps = {
  title: string
  value: string
  options: FilterOption[]
  onChange: (value: string) => void
  children?: ReactNode
}

export interface PricingSidebarProps {
  quotaTypeFilter: string
  endpointTypeFilter: string
  vendorFilter: string
  groupFilter: string
  tagFilter: string
  onQuotaTypeChange: (value: string) => void
  onEndpointTypeChange: (value: string) => void
  onVendorChange: (value: string) => void
  onGroupChange: (value: string) => void
  onTagChange: (value: string) => void
  priceRange?: [number, number]
  onPriceRangeChange: (range: [number, number] | undefined) => void
  freeOnly: boolean
  onFreeOnlyChange: (freeOnly: boolean) => void
  vendors: PricingVendor[]
  groups: string[]
  groupRatios?: Record<string, number>
  tags: string[]
  models: PricingModel[]
  hasActiveFilters: boolean
  onClearFilters: () => void
  className?: string
}

/** Number of list rows before a section collapses behind "show more". */
const COLLAPSED_ROWS = 8

function formatGroupRatio(ratio: number | undefined): string | undefined {
  if (ratio == null) return undefined
  const formatted = Number.isInteger(ratio)
    ? ratio.toString()
    : ratio.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
  return `x${formatted}`
}

/** Compact Qianwen-style list row replacing the old chip clusters. */
function FilterRow(props: {
  option: FilterOption
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      aria-pressed={props.active}
      title={props.option.label}
      onClick={props.onClick}
      className={cn(
        'flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left text-sm transition-colors',
        props.active
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-foreground/80 hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {props.option.icon && (
        <span className='flex size-4 shrink-0 items-center justify-center'>
          {props.option.icon}
        </span>
      )}
      <span className='min-w-0 flex-1 truncate'>{props.option.label}</span>
      {props.option.suffix && (
        <span className='text-muted-foreground shrink-0 text-xs tabular-nums'>
          {props.option.suffix}
        </span>
      )}
      {props.option.count != null && (
        <span
          className={cn(
            'ml-auto shrink-0 text-xs tabular-nums',
            props.active ? 'text-primary/70' : 'text-muted-foreground'
          )}
        >
          {props.option.count}
        </span>
      )}
    </button>
  )
}

function FilterSection(props: FilterSectionProps) {
  return (
    <Collapsible
      defaultOpen
      className='border-border/60 border-b pb-2 last:border-b-0'
    >
      <CollapsibleTrigger className='group flex w-full items-center justify-between py-2.5 text-left'>
        <span className='text-foreground text-[13px] font-semibold tracking-wide'>
          {props.title}
        </span>
        <ChevronDown className='text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-180' />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='flex flex-col gap-0.5 pb-1'>
          {props.options.map((option) => (
            <FilterRow
              key={option.value}
              option={option}
              active={props.value === option.value}
              onClick={() => props.onChange(option.value)}
            />
          ))}
          {props.children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** Long lists (tags) collapse behind a "show more" toggle row. */
function ExpandableRows(props: {
  options: FilterOption[]
  value: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const collapsed = props.options.slice(0, COLLAPSED_ROWS)
  const hidden = props.options.length - collapsed.length
  const rows = expanded ? props.options : collapsed

  return (
    <>
      {rows.map((option) => (
        <FilterRow
          key={option.value}
          option={option}
          active={props.value === option.value}
          onClick={() => props.onChange(option.value)}
        />
      ))}
      {hidden > 0 && (
        <button
          type='button'
          onClick={() => setExpanded((v) => !v)}
          className='text-muted-foreground hover:text-foreground h-8 w-full cursor-pointer rounded-lg px-2.5 text-left text-xs transition-colors'
        >
          {expanded
            ? t('Show less')
            : t('Show {{count}} more', { count: hidden })}
        </button>
      )}
    </>
  )
}

/**
 * Dual-thumb price range filter. Prices span several orders of magnitude, so
 * the slider position maps through a sqrt scale: t -> domainMax * t^2. This
 * keeps the low-price region usable while still anchoring zero.
 */
function PriceRangeSection(props: {
  models: PricingModel[]
  range?: [number, number]
  onChange: (range: [number, number] | undefined) => void
}) {
  const { t } = useTranslation()

  const domainMax = useMemo(() => {
    let max = 0
    for (const model of props.models) {
      max = Math.max(max, getModelBasePrice(model))
    }
    return max
  }, [props.models])

  const current = props.range ?? [0, domainMax]
  const [currentMin, currentMaxRaw] = current
  // An open upper bound (Infinity) only arrives via hand-crafted URLs; clamp
  // it for display so the label never renders "Infinity".
  const currentMax = Number.isFinite(currentMaxRaw) ? currentMaxRaw : domainMax

  const priceToT = (price: number) =>
    domainMax > 0 ? Math.sqrt(Math.min(Math.max(price / domainMax, 0), 1)) : 0

  const sliderValue: [number, number] = [
    priceToT(currentMin),
    priceToT(currentMax),
  ]

  const formatLabel = (price: number) =>
    formatBillingCurrencyFromUSD(price, {
      showSymbol: true,
      digitsLarge: 2,
      digitsSmall: 2,
      abbreviate: false,
    })

  const handleValueChange = (nextValue: number | readonly number[]) => {
    const values = Array.isArray(nextValue) ? nextValue : [nextValue]
    const [tMin, tMax] = [values[0] ?? 0, values[1] ?? 1]
    if (tMin <= 0.005 && tMax >= 0.995) {
      props.onChange(undefined)
      return
    }
    const min = Math.floor(domainMax * tMin * tMin * 1000) / 1000
    const max = Math.ceil(domainMax * tMax * tMax * 1000) / 1000
    props.onChange([Math.max(0, min), Math.max(min, max)])
  }

  return (
    <Collapsible
      defaultOpen
      className='border-border/60 border-b pb-2 last:border-b-0'
    >
      <CollapsibleTrigger className='group flex w-full items-center justify-between py-2.5 text-left'>
        <span className='text-foreground text-[13px] font-semibold tracking-wide'>
          {t('Price Range')}
        </span>
        <ChevronDown className='text-muted-foreground size-4 transition-transform group-data-[panel-open]:rotate-180' />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className='flex flex-col gap-2.5 px-2.5 pt-1 pb-2'>
          <div className='flex items-baseline justify-between text-xs tabular-nums'>
            <span className='text-foreground font-mono font-medium'>
              {formatLabel(currentMin)}
            </span>
            <span className='text-muted-foreground font-mono'>
              {formatLabel(currentMax)}
            </span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={sliderValue}
            disabled={domainMax <= 0}
            onValueChange={handleValueChange}
            aria-label={t('Price Range')}
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export const PricingSidebar = memo(function PricingSidebar(
  props: PricingSidebarProps
) {
  const { t } = useTranslation()
  const counts = useMemo(() => {
    const vendors = new Map<string, number>()
    const tags = new Map<string, number>()
    const endpoints = new Map<string, number>()
    const quotas = { token: 0, request: 0, task: 0 }
    const free = { free: 0 }
    for (const model of props.models) {
      if (model.vendor_name) {
        vendors.set(
          model.vendor_name,
          (vendors.get(model.vendor_name) ?? 0) + 1
        )
      }
      for (const tag of new Set(
        parseTags(model.tags).map((tag) => tag.toLowerCase())
      )) {
        tags.set(tag, (tags.get(tag) ?? 0) + 1)
      }
      for (const endpoint of new Set(model.supported_endpoint_types ?? [])) {
        endpoints.set(endpoint, (endpoints.get(endpoint) ?? 0) + 1)
      }
      if (getModelBasePrice(model) <= 0) {
        free.free++
      }
      if (hasTaskUsageSchema(model)) {
        quotas.task++
      } else if (model.quota_type === 0) {
        quotas.token++
      } else if (model.quota_type === 1) {
        quotas.request++
      }
    }
    return { vendors, tags, endpoints, quotas, free }
  }, [props.models])
  const quotaTypeLabels = getQuotaTypeLabels(t)
  const endpointTypeLabels = getEndpointTypeLabels(t)

  const vendorOptions: FilterOption[] = [
    {
      value: FILTER_ALL,
      label: t('All Vendors'),
      count: props.models.length,
    },
    ...props.vendors
      .map((vendor) => ({
        value: vendor.name,
        label: vendor.name,
        count: counts.vendors.get(vendor.name) ?? 0,
        icon: vendor.icon ? getLobeIcon(vendor.icon, 14) : undefined,
      }))
      .filter((vendor) => vendor.count > 0),
  ]

  const groupOptions: FilterOption[] = [
    {
      value: FILTER_ALL,
      label: t('All Groups'),
    },
    ...props.groups.map((group) => ({
      value: group,
      label: group,
      suffix: formatGroupRatio(props.groupRatios?.[group]),
    })),
  ]

  const quotaOptions: FilterOption[] = [
    {
      value: QUOTA_TYPES.ALL,
      label: quotaTypeLabels[QUOTA_TYPES.ALL],
      count: props.models.length,
    },
    {
      value: QUOTA_TYPES.TOKEN,
      label: quotaTypeLabels[QUOTA_TYPES.TOKEN],
      count: counts.quotas.token,
    },
    {
      value: QUOTA_TYPES.REQUEST,
      label: quotaTypeLabels[QUOTA_TYPES.REQUEST],
      count: counts.quotas.request,
    },
    {
      value: QUOTA_TYPES.TASK,
      label: quotaTypeLabels[QUOTA_TYPES.TASK],
      count: counts.quotas.task,
    },
  ]

  const tagAllOption: FilterOption = {
    value: FILTER_ALL,
    label: t('All Tags'),
    count: props.models.length,
  }
  const tagOptions: FilterOption[] = props.tags.map((tag) => ({
    value: tag,
    label: tag,
    count: counts.tags.get(tag.toLowerCase()) ?? 0,
  }))

  const endpointOptions: FilterOption[] = [
    {
      value: ENDPOINT_TYPES.ALL,
      label: endpointTypeLabels[ENDPOINT_TYPES.ALL],
      count: props.models.length,
    },
    ...Object.entries(endpointTypeLabels)
      .filter(([value]) => value !== ENDPOINT_TYPES.ALL)
      .map(([value, label]) => ({
        value,
        label,
        count: counts.endpoints.get(value) ?? 0,
      })),
  ]

  return (
    <aside className={cn('bg-card rounded-2xl border p-3', props.className)}>
      <div className='mb-2 flex items-center justify-between gap-2'>
        <div>
          <h2 className='text-foreground text-sm font-bold'>{t('Filter')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t('Refine models by provider, group, type, and tags.')}
          </p>
        </div>
        <button
          type='button'
          onClick={props.onClearFilters}
          disabled={!props.hasActiveFilters}
          title={t('Reset')}
          className='text-muted-foreground hover:text-foreground hover:bg-muted/60 enabled:cursor-pointer flex size-7 items-center justify-center rounded-full transition-colors disabled:opacity-40'
        >
          <RotateCcw className='size-3.5' />
        </button>
      </div>

      <div className='space-y-1'>
        <PriceRangeSection
          models={props.models}
          range={props.priceRange}
          onChange={props.onPriceRangeChange}
        />

        <div className='border-border/60 border-b pb-2 last:border-b-0'>
          <div className='flex h-8 items-center gap-2.5 py-2.5 pl-1'>
            <Checkbox
              id='pricing-free-only'
              checked={props.freeOnly}
              onCheckedChange={(checked) =>
                props.onFreeOnlyChange(checked === true)
              }
            />
            <label
              htmlFor='pricing-free-only'
              className='text-foreground/80 cursor-pointer text-sm select-none'
            >
              {t('Free models')}
            </label>
            <span className='text-muted-foreground ml-auto pr-2 text-xs tabular-nums'>
              {counts.free.free}
            </span>
          </div>
        </div>

        <FilterSection
          title={t('Pricing Type')}
          value={props.quotaTypeFilter}
          options={quotaOptions}
          onChange={props.onQuotaTypeChange}
        />
        <FilterSection
          title={t('Vendors')}
          value={props.vendorFilter}
          options={vendorOptions}
          onChange={props.onVendorChange}
        />
        <FilterSection
          title={t('Model Tags')}
          value={props.tagFilter}
          options={[tagAllOption]}
          onChange={props.onTagChange}
        >
          <ExpandableRows
            options={tagOptions}
            value={props.tagFilter}
            onChange={props.onTagChange}
          />
        </FilterSection>
        <FilterSection
          title={t('Groups')}
          value={props.groupFilter}
          options={groupOptions}
          onChange={props.onGroupChange}
        />
        <FilterSection
          title={t('Endpoint Type')}
          value={props.endpointTypeFilter}
          options={endpointOptions}
          onChange={props.onEndpointTypeChange}
        />
      </div>
    </aside>
  )
})
