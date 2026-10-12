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
import { Sparkles } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { getLobeIcon } from '@/lib/lobe-icon'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { useBillingTime } from '../hooks/use-billing-time'
import { parseTags } from '../lib/filters'
import { MAX_FEATURED_MODELS } from '../lib/featured'
import { getModelPriceDisplay } from '../lib/price-pair'
import type { PricingModel, TokenUnit } from '../types'

export interface FeaturedModelsProps {
  models: PricingModel[]
  onModelClick: (modelName: string) => void
  tokenUnit?: TokenUnit
  priceRate?: number
  usdExchangeRate?: number
  showRechargePrice?: boolean
}

const FEATURED_TAG_COUNT = 2

function FeaturedCard({
  model,
  tokenUnit,
  showRechargePrice,
  priceRate,
  usdExchangeRate,
  onClick,
}: {
  model: PricingModel
  tokenUnit: TokenUnit
  showRechargePrice: boolean
  priceRate: number
  usdExchangeRate: number
  onClick: () => void
}) {
  const { t, i18n } = useTranslation()
  const tags = parseTags(model.tags).slice(0, FEATURED_TAG_COUNT)
  const iconKey = model.icon || model.vendor_icon
  const icon = iconKey ? getLobeIcon(iconKey, 26) : null
  const initial = model.model_name?.charAt(0).toUpperCase() || '?'
  const billingTime = useBillingTime(model.billing_expr)
  const currency = useSystemConfigStore((state) => state.config.currency)

  const priceDisplay = useMemo(
    () =>
      getModelPriceDisplay(
        model,
        {
          tokenUnit,
          showRechargePrice,
          priceRate,
          usdExchangeRate,
          now: billingTime === undefined ? undefined : new Date(billingTime),
        },
        t,
        i18n.language
      ),
    // Currency is read indirectly by the price formatter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      model,
      tokenUnit,
      showRechargePrice,
      priceRate,
      usdExchangeRate,
      billingTime,
      currency,
      t,
      i18n.language,
    ]
  )

  const priceRows = useMemo(() => {
    const rows: { key: string; label: string; value: string; unit: string }[] =
      []
    if (priceDisplay.input) {
      rows.push({
        key: 'input',
        label: t('Input'),
        value: priceDisplay.input.formatted,
        unit: priceDisplay.input.unit,
      })
    }
    if (priceDisplay.output) {
      rows.push({
        key: 'output',
        label: t('Output'),
        value: priceDisplay.output.formatted,
        unit: priceDisplay.output.unit,
      })
    }
    if (rows.length === 0) {
      if (priceDisplay.request) {
        rows.push({
          key: 'request',
          label: '',
          value: priceDisplay.request.formatted,
          unit: priceDisplay.request.unit,
        })
      } else if (priceDisplay.primary) {
        rows.push({
          key: 'primary',
          label: priceDisplay.primary.label,
          value: priceDisplay.primary.formatted,
          unit: priceDisplay.primary.unit,
        })
      }
    }
    return rows
  }, [priceDisplay, t])

  return (
    <button
      type='button'
      onClick={onClick}
      title={model.model_name}
      className='border-border/60 bg-card/80 hover:border-border hover:shadow-md group snap-start flex w-[290px] shrink-0 cursor-pointer flex-col gap-2 rounded-2xl border p-4 text-left shadow-xs backdrop-blur-sm transition-all duration-300 sm:w-[380px] xl:w-[420px]'
    >
      <div className='flex min-w-0 items-center gap-3'>
        <div
          aria-hidden
          className='bg-muted/50 flex size-9 shrink-0 items-center justify-center rounded-lg'
        >
          {icon || (
            <span className='text-muted-foreground text-sm font-bold'>
              {initial}
            </span>
          )}
        </div>
        <div className='min-w-0 flex-1'>
          <p className='truncate font-mono text-sm leading-5 font-semibold'>
            {model.model_name}
          </p>
          {model.vendor_name && (
            <p
              className='text-muted-foreground truncate text-xs'
              title={model.vendor_name}
            >
              {model.vendor_name}
            </p>
          )}
        </div>
        <div className='shrink-0 text-right'>
          {priceDisplay.free ? (
            <span className='rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400'>
              {t('Free to use')}
            </span>
          ) : (
            priceRows.map((row) => (
              <p
                key={row.key}
                className='flex items-baseline justify-end gap-1.5'
              >
                {row.label && (
                  <span className='text-muted-foreground text-[11px]'>
                    {row.label}
                  </span>
                )}
                <span className='text-primary font-mono text-sm leading-5 font-semibold tabular-nums'>
                  {row.value}
                </span>
                <span className='text-muted-foreground text-[11px] whitespace-nowrap'>
                  / {row.unit}
                </span>
              </p>
            ))
          )}
        </div>
      </div>

      {tags.length > 0 && (
        <div className='flex min-h-5 flex-wrap gap-1'>
          {tags.map((tag) => (
            <span
              key={tag}
              className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-[11px] font-medium'
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <p className='text-muted-foreground line-clamp-2 min-h-8 text-xs leading-4 break-words'>
        {model.description || t('No description available.')}
      </p>
    </button>
  )
}

export const FeaturedModels = memo(function FeaturedModels(
  props: FeaturedModelsProps
) {
  const { t } = useTranslation()
  const tokenUnit = props.tokenUnit ?? DEFAULT_TOKEN_UNIT
  const showRechargePrice = props.showRechargePrice ?? false
  const priceRate = props.priceRate ?? 1
  const usdExchangeRate = props.usdExchangeRate ?? 1

  const featured = useMemo(
    () => props.models.slice(0, MAX_FEATURED_MODELS),
    [props.models]
  )

  if (featured.length === 0) {
    return null
  }

  return (
    <section
      aria-label={t('Featured Models')}
      className='from-blue-500/10 via-violet-500/5 to-purple-500/10 rounded-3xl bg-gradient-to-br p-4 shadow-xs backdrop-blur-sm md:p-5'
    >
      <div className='mb-3 flex items-center gap-2 px-1'>
        <Sparkles aria-hidden className='text-primary size-4' />
        <h2 className='text-foreground text-sm font-semibold'>
          {t('Featured Models')}
        </h2>
        <span className='text-muted-foreground/70 text-xs tabular-nums'>
          {t('{{count}} models', { count: featured.length })}
        </span>
      </div>

      <div
        className='overflow-x-auto pb-1'
        style={{
          maskImage:
            'linear-gradient(to right, black 0%, black 96%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(to right, black 0%, black 96%, transparent 100%)',
        }}
      >
        <div className='no-scrollbar flex w-max snap-x gap-6'>
          {featured.map((model) => (
            <FeaturedCard
              key={model.id ?? model.model_name}
              model={model}
              tokenUnit={tokenUnit}
              showRechargePrice={showRechargePrice}
              priceRate={priceRate}
              usdExchangeRate={usdExchangeRate}
              onClick={() => props.onModelClick(model.model_name)}
            />
          ))}
        </div>
      </div>
    </section>
  )
})
