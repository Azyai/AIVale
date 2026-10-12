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
  getDynamicDisplayGroupRatio,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
} from './dynamic-price'
import { formatPrice, formatRequestPrice } from './price'
import { QUOTA_TYPE_VALUES } from '../constants'
import type { PricingModel, TokenUnit } from '../types'
import { taskUsageUnitLabel } from './task-price-display'

export type ModelPriceValue = {
  /** Currency-formatted price string. */
  formatted: string
  /** Localized unit label (e.g. "1M", "request"). */
  unit: string
}

export type ModelPriceDisplay = {
  /** Model is usable at zero cost — render a free badge instead of prices. */
  free: boolean
  /** Price cannot be determined (special/unconfigured expressions). */
  unavailable: boolean
  input?: ModelPriceValue
  output?: ModelPriceValue
  request?: ModelPriceValue
  /** Fallback single row for task-usage style billing (label pre-localized). */
  primary?: { label: string } & ModelPriceValue
}

export type ModelPriceDisplayOptions = {
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
  priceRate?: number
  usdExchangeRate?: number
  /** Evaluation time for time-tiered expressions (undefined = no time rules). */
  now?: Date
  selectedGroup?: string
}

/**
 * Resolve a model's headline input/output prices on the SAME basis the model
 * card and pricing table use: dynamic (tiered) billing when configured,
 * falling back to static ratios. Labels are localized here so callers can
 * render the rows directly.
 */
export function getModelPriceDisplay(
  model: PricingModel,
  options: ModelPriceDisplayOptions,
  t: (key: string) => string,
  language: string
): ModelPriceDisplay {
  const tokenUnitLabel = options.tokenUnit === 'K' ? '1K' : '1M'
  const showRechargePrice = options.showRechargePrice ?? false
  const priceRate = options.priceRate ?? 1
  const usdExchangeRate = options.usdExchangeRate ?? 1

  const dynamicSummary = getDynamicPricingSummary(model, {
    tokenUnit: options.tokenUnit,
    showRechargePrice,
    priceRate,
    usdExchangeRate,
    now: options.now,
    groupRatioMultiplier: getDynamicDisplayGroupRatio(
      model,
      options.selectedGroup
    ),
  })

  if (dynamicSummary) {
    if (dynamicSummary.isSpecialExpression) {
      return { free: false, unavailable: true }
    }
    const entries = dynamicSummary.primaryEntries
    if (entries.length === 0) {
      return { free: false, unavailable: true }
    }

    const inputEntry = entries.find((entry) => entry.field === 'inputPrice')
    const outputEntry = entries.find((entry) => entry.field === 'outputPrice')
    if (inputEntry || outputEntry) {
      return {
        free: false,
        unavailable: false,
        input: inputEntry
          ? { formatted: inputEntry.formatted, unit: tokenUnitLabel }
          : undefined,
        output: outputEntry
          ? { formatted: outputEntry.formatted, unit: tokenUnitLabel }
          : undefined,
      }
    }

    // Fixed per-request / per-image tiers and task-usage fields collapse to a
    // single labeled row, mirroring the first row the model card shows.
    const first = entries[0]
    const unitLabelKey = getDynamicPriceUnitLabelKey(first)
    const unit = taskUsageUnitLabel(
      first,
      language,
      unitLabelKey ? t(unitLabelKey) : tokenUnitLabel
    )
    const label =
      first.labelKind === 'i18n' ? t(first.shortLabel) : first.shortLabel
    return {
      free: false,
      unavailable: false,
      primary: { label, formatted: first.formatted, unit },
    }
  }

  // Static pricing basis.
  if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
    if ((model.model_price ?? 0) <= 0) {
      return { free: true, unavailable: false }
    }
    return {
      free: false,
      unavailable: false,
      request: {
        formatted: formatRequestPrice(
          model,
          showRechargePrice,
          priceRate,
          usdExchangeRate,
          options.selectedGroup
        ),
        unit: t('request'),
      },
    }
  }

  if (model.model_ratio <= 0) {
    return { free: true, unavailable: false }
  }

  return {
    free: false,
    unavailable: false,
    input: {
      formatted: formatPrice(
        model,
        'input',
        options.tokenUnit,
        showRechargePrice,
        priceRate,
        usdExchangeRate,
        options.selectedGroup
      ),
      unit: tokenUnitLabel,
    },
    output: {
      formatted: formatPrice(
        model,
        'output',
        options.tokenUnit,
        showRechargePrice,
        priceRate,
        usdExchangeRate,
        options.selectedGroup
      ),
      unit: tokenUnitLabel,
    },
  }
}
